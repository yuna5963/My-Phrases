import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { useStock } from '../store/useStock'
import { normalize } from '../lib/chunkMatch'
import { logEvent } from '../lib/db'
import { makeEvent } from '../lib/events'
import { lintKana } from '../lib/kanaLint'
import Field from '../components/FormField'
import UsageBadge from '../components/UsageBadge'
import {
  draftToPhrase,
  enrichAll,
  LEVEL_OPTIONS,
  TYPE_OPTIONS,
  type EnrichDraft,
  type EnrichInput,
} from '../lib/enrich'

type Phase = 'select' | 'running' | 'review' | 'done'

/**
 * 教材化: 表現ストックの英文に、AI が和訳・例文・シラブルカナ・分類を補完し、
 * プレビューで確認・修正してからデッキへ追加する画面。
 * 生成は「教材化する」を押したときだけ・不足項目だけ・5件バッチ（コスト対策）。
 */
export default function StockEnrich() {
  const navigate = useNavigate()
  const items = useStock((s) => s.items)
  const removeFromStock = useStock((s) => s.remove)
  const phrases = useDeck((s) => s.phrases)
  const addPhrases = useDeck((s) => s.addPhrases)
  const apiKey = useSettings((s) => s.chatApiKey)
  const model = useSettings((s) => s.chatModel)

  // デッキ収載済みの表現は生成対象から外す（重複防止＋API節約）。
  const deckKeys = useMemo(() => new Set(phrases.map((p) => normalize(p.en))), [phrases])
  const categories = useMemo(
    () => [...new Set(phrases.map((p) => p.category).filter(Boolean))],
    [phrases],
  )

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((i) => !deckKeys.has(normalize(i.en))).map((i) => i.en)),
  )
  const [phase, setPhase] = useState<Phase>('select')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [drafts, setDrafts] = useState<EnrichDraft[]>([])
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [apiError, setApiError] = useState<string | null>(null)
  // APIエラーで生成できなかった残り（targets）と、その結果を差し込む drafts 上の位置（at）。
  const [retryPlan, setRetryPlan] = useState<{ targets: EnrichInput[]; at: number[] } | null>(
    null,
  )
  const [addedCount, setAddedCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  if (!apiKey) {
    return (
      <div className="pt-20 text-center t-muted">
        <p className="text-3xl">✨</p>
        <p className="mt-4">教材化には Gemini API キーが必要です。</p>
        <p className="mt-1 text-sm">設定画面でキーを登録してください（無料で取得できます）。</p>
        <Link to="/settings" className="mt-4 inline-block font-medium link underline">
          ⚙️ 設定を開く
        </Link>
      </div>
    )
  }

  const toggleSelect = (en: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(en)) next.delete(en)
      else next.add(en)
      return next
    })
  }

  /** indexes を省略すると選択項目の一括生成、指定すると該当ドラフトの再生成。 */
  const generate = async (targets: EnrichInput[], replaceAt?: number[]) => {
    setApiError(null)
    setRetryPlan(null)
    setPhase('running')
    setProgress({ done: 0, total: targets.length })
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const result = await enrichAll(targets, {
        apiKey,
        model,
        categories,
        signal: ac.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      if (replaceAt) {
        setDrafts((prev) => {
          const next = [...prev]
          replaceAt.forEach((at, i) => {
            if (result.drafts[i]) next[at] = result.drafts[i]
          })
          return next
        })
      } else {
        setDrafts(result.drafts)
        setExcluded(new Set())
      }
      if (result.error) {
        setApiError(result.error.message)
        // 未生成の残りを覚えておき、成功分を保持したまま続きから再試行できるようにする。
        // キー無効（auth）は設定を直すまで再試行しても無駄なので対象外。
        const doneCount = result.drafts.length
        const at = replaceAt ?? targets.map((_, idx) => idx)
        if (result.error.kind !== 'auth' && doneCount < targets.length) {
          setRetryPlan({ targets: targets.slice(doneCount), at: at.slice(doneCount) })
        }
      }
      setPhase('review')
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setPhase(replaceAt ? 'review' : 'select')
        return
      }
      setApiError((e as Error).message)
      setPhase(replaceAt ? 'review' : 'select')
    } finally {
      abortRef.current = null
    }
  }

  const startGenerate = () => {
    const targets: EnrichInput[] = items
      .filter((i) => selected.has(i.en))
      .map((i) => ({ en: i.en, ...(i.ja ? { ja: i.ja } : {}) }))
    if (targets.length) generate(targets)
  }

  const regenerateErrors = () => {
    const idx = drafts
      .map((d, i) => (d.error && !excluded.has(i) ? i : -1))
      .filter((i) => i >= 0)
    if (!idx.length) return
    const stockByEn = new Map(items.map((i) => [i.en, i]))
    const targets = idx.map((i) => {
      const ja = stockByEn.get(drafts[i].en)?.ja
      return { en: drafts[i].en, ...(ja ? { ja } : {}) }
    })
    generate(targets, idx)
  }

  const updateDraft = (index: number, patch: Partial<EnrichDraft>) => {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d
        const next = { ...d, ...patch }
        // カナ・英文を編集したら検証結果も更新する。
        next.kanaIssues = {
          kana: next.kana ? lintKana(next.kana, next.en) : [],
          exampleKana:
            next.exampleKana && next.exampleEn
              ? lintKana(next.exampleKana, next.exampleEn)
              : [],
        }
        return next
      }),
    )
  }

  const save = async () => {
    const keep = drafts.filter((d, i) => !excluded.has(i) && !d.error && d.ja)
    if (!keep.length) return
    setSaving(true)
    try {
      await addPhrases(keep.map(draftToPhrase))
      keep.forEach((d) => removeFromStock(d.en))
      // 学習ログ（追記・best-effort）。教材化した件数を記録する。
      try {
        await logEvent(makeEvent('materialize', { addedCount: keep.length }))
      } catch {
        /* ログは best-effort */
      }
      // addPhrases が load() を呼ぶので events も読み直されるが、明示的に整合させる。
      await useDeck.getState().refreshEvents()
      setAddedCount(keep.length)
      setPhase('done')
    } finally {
      setSaving(false)
    }
  }

  if (phase === 'done') {
    return (
      <div className="pt-20 text-center">
        <p className="text-3xl">📚</p>
        <p className="mt-4 font-medium">{addedCount}件をデッキに追加しました。</p>
        <p className="mt-1 text-sm t-muted">
          追加した教材はデッキの先頭に並び、すぐ練習に出てきます。
        </p>
        <div className="mt-6 space-y-3">
          <button
            onClick={() => navigate('/daily')}
            className="btn-primary w-full py-4 font-medium"
          >
            📖 今日の練習へ
          </button>
          <button
            onClick={() => navigate('/browse')}
            className="btn-secondary w-full py-4 font-medium"
          >
            チャンク一覧を見る
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'running') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <div className="pt-20 text-center t-muted">
        <p className="text-3xl">✨</p>
        <p className="mt-4">教材を生成しています…</p>
        <p className="mt-1 text-sm">
          {progress.done} / {progress.total} 件
        </p>
        <div className="mx-auto mt-4 h-1 w-56 overflow-hidden bg-carbon-surface-2 dark:bg-carbon-line-dark">
          <div className="h-full bg-carbon-blue transition-all" style={{ width: `${pct}%` }} />
        </div>
        <button
          onClick={() => abortRef.current?.abort()}
          className="mt-6 text-sm t-subtle underline"
        >
          中止する
        </button>
      </div>
    )
  }

  if (phase === 'review') {
    const savable = drafts.filter((d, i) => !excluded.has(i) && !d.error && d.ja).length
    const hasErrors = drafts.some((d, i) => d.error && !excluded.has(i))
    return (
      <div className="space-y-4">
        <header className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">✨ 教材化プレビュー</h1>
          <span className="text-sm t-muted">{drafts.length}件</span>
        </header>
        <p className="text-sm t-muted">
          AIが作った下書きです。訳・例文・カナを確認して、必要なら修正してから追加してください。
        </p>
        <UsageBadge />
        {apiError && (
          <div className="space-y-2 rounded-none border-l-4 border-carbon-error bg-carbon-surface px-3 py-2 dark:bg-carbon-layer">
            <p className="text-sm text-carbon-error">⚠ {apiError}</p>
            {retryPlan && (
              <button
                onClick={() => generate(retryPlan.targets, retryPlan.at)}
                className="btn-danger w-full py-2 text-sm font-medium active:opacity-80"
              >
                ↻ 残り{retryPlan.targets.length}件をもう一度生成する
              </button>
            )}
          </div>
        )}
        {hasErrors && (
          <button onClick={regenerateErrors} className="text-sm font-medium link underline">
            ↻ 失敗した項目をまとめて再生成
          </button>
        )}

        <ul className="space-y-3">
          {drafts.map((d, i) => (
            <DraftCard
              key={`${d.en}-${i}`}
              draft={d}
              excluded={excluded.has(i)}
              onToggleExclude={() =>
                setExcluded((prev) => {
                  const next = new Set(prev)
                  if (next.has(i)) next.delete(i)
                  else next.add(i)
                  return next
                })
              }
              onChange={(patch) => updateDraft(i, patch)}
              categories={categories}
            />
          ))}
        </ul>

        <button
          disabled={savable === 0 || saving}
          onClick={save}
          className="btn-primary w-full py-4 font-medium"
        >
          {saving ? '追加中…' : `📚 デッキに追加（${savable}件）`}
        </button>
        <button onClick={() => setPhase('select')} className="w-full text-sm t-subtle underline">
          ← 選び直す
        </button>
      </div>
    )
  }

  // phase === 'select'
  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">✨ 教材化する</h1>
        <span className="text-sm t-muted">{items.length}件</span>
      </header>
      <p className="text-sm t-muted">
        ストックした表現に、AIが和訳・例文・シラブルカナ・分類を補完してデッキに追加します。教材化する表現を選んでください。
      </p>

      {items.length === 0 ? (
        <div className="tile p-6 text-center text-sm t-subtle ">
          <p>ストックが空です。</p>
          <p className="mt-1">チャット練習のまとめで表現をチェックすると、ここから教材化できます。</p>
          <button onClick={() => navigate('/chat')} className="mt-4 font-medium link">
            💬 チャット練習へ →
          </button>
        </div>
      ) : (
        <>
          {apiError && (
            <p className="rounded-none border-l-4 border-carbon-error bg-carbon-surface px-3 py-2 text-sm text-carbon-error dark:bg-carbon-layer">
              ⚠ {apiError}
            </p>
          )}
          <ul className="space-y-2">
            {items.map((i) => {
              const inDeck = deckKeys.has(normalize(i.en))
              return (
                <li key={i.en}>
                  <label
                    className={`flex items-start gap-3 tile p-3 ${
                      inDeck ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={inDeck}
                      checked={!inDeck && selected.has(i.en)}
                      onChange={() => toggleSelect(i.en)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{i.en}</span>
                      {i.ja && <span className="block text-sm t-muted">{i.ja}</span>}
                      {inDeck && (
                        <span className="t-muted block text-xs">
                          既にデッキにあります
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <button
            disabled={selected.size === 0}
            onClick={startGenerate}
            className="btn-primary w-full py-4 font-medium"
          >
            ✨ 生成する（{selected.size}件）
          </button>
          <p className="text-center text-xs t-subtle">
            生成はこのボタンを押したときだけ・5件ずつ行われます（API節約）。
          </p>
        </>
      )}
    </div>
  )
}

function DraftCard({
  draft: d,
  excluded,
  onToggleExclude,
  onChange,
  categories,
}: {
  draft: EnrichDraft
  excluded: boolean
  onToggleExclude: () => void
  onChange: (patch: Partial<EnrichDraft>) => void
  categories: string[]
}) {
  const kanaProblems = [...d.kanaIssues.kana, ...d.kanaIssues.exampleKana]
  return (
    <li
      className={`space-y-2 tile p-4 ${
        excluded ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 font-medium">{d.en}</p>
        <label className="flex shrink-0 items-center gap-1 text-xs t-subtle">
          <input type="checkbox" checked={excluded} onChange={onToggleExclude} />
          除外
        </label>
      </div>

      {d.error ? (
        <p className="text-sm text-carbon-error">⚠ {d.error}</p>
      ) : (
        <>
          <Field label="訳" value={d.ja} onChange={(ja) => onChange({ ja })} />
          <Field label="カナ" value={d.kana} onChange={(kana) => onChange({ kana })} />
          <Field
            label="例文"
            value={d.exampleEn}
            onChange={(exampleEn) => onChange({ exampleEn })}
          />
          <Field
            label="例文訳"
            value={d.exampleJa}
            onChange={(exampleJa) => onChange({ exampleJa })}
          />
          <Field
            label="例文カナ"
            value={d.exampleKana}
            onChange={(exampleKana) => onChange({ exampleKana })}
          />
          {!d.exampleEn && (
            <p className="t-muted text-xs">
              ⚠ 例文が空です（穴埋め・瞬間英作文の対象外になります）
            </p>
          )}
          {kanaProblems.length > 0 && (
            <p className="t-muted text-xs">
              ⚠ カナ要確認: {[...new Set(kanaProblems.map((i) => i.message))].join(' / ')}
              — このまま追加すると「要確認」フラグ付きで保存されます。
            </p>
          )}
          <div className="flex gap-2">
            <select
              value={d.type}
              onChange={(e) => onChange({ type: e.target.value })}
              className="input flex-1 px-2 py-1.5 text-sm"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              value={d.level}
              onChange={(e) => onChange({ level: e.target.value })}
              className="input flex-1 px-2 py-1.5 text-sm"
            >
              {LEVEL_OPTIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <input
              value={d.category}
              onChange={(e) => onChange({ category: e.target.value })}
              list="enrich-categories"
              placeholder="カテゴリ"
              className="input w-full px-2 py-1.5 text-sm"
            />
            <datalist id="enrich-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </>
      )}
    </li>
  )
}

