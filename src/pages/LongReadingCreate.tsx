import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { excludeLongReading } from '../lib/longReading'
import { matchesChunk } from '../lib/chunkMatch'
import { isDue } from '../lib/srs'
import UsageBadge from '../components/UsageBadge'
import {
  draftToLongPhrase,
  generateLongReading,
  LONG_LEVELS,
  MAX_CHUNKS,
  MIN_CHUNKS,
  type LongDraft,
  type LongGenOptions,
  type LongLength,
  type LongLevel,
} from '../lib/longGen'

const THEME_CHIPS = ['日常', '仕事', '健康', '旅行', '雑談']

/**
 * AI長文作成: テーマ・難易度・長さと、デッキから選んだチャンク（3〜5個）を指定して
 * 長文音読用の読み物を生成する。蓄積したチャンクを長文の中で再利用することで、
 * チャンク練習と長文練習を分離させない。
 */
export default function LongReadingCreate() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const addPhrases = useDeck((s) => s.addPhrases)
  const apiKey = useSettings((s) => s.chatApiKey)
  const model = useSettings((s) => s.chatModel)

  const [theme, setTheme] = useState('日常')
  const [level, setLevel] = useState<LongLevel>('Core')
  const [length, setLength] = useState<LongLength>('short')
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<LongDraft | null>(null)
  const [usedOpts, setUsedOpts] = useState<LongGenOptions | null>(null)
  const [saving, setSaving] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 期日が来ているチャンクを先頭に提示（今日弱いものを長文で再利用する）。
  const candidates = useMemo(() => {
    const base = excludeLongReading(phrases)
    return [...base].sort((a, b) => {
      const da = isDue(progress[a.id]) ? 0 : 1
      const db = isDue(progress[b.id]) ? 0 : 1
      return da - db
    })
  }, [phrases, progress])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(
      (p) => p.en.toLowerCase().includes(q) || p.ja.includes(query.trim()),
    )
  }, [candidates, query])

  if (!apiKey) {
    return (
      <div className="pt-20 text-center t-muted">
        <p className="text-3xl">📖</p>
        <p className="mt-4">AI長文の作成には Gemini API キーが必要です。</p>
        <p className="mt-1 text-sm">設定画面でキーを登録してください（無料で取得できます）。</p>
        <Link to="/settings" className="mt-4 inline-block font-medium link underline">
          ⚙️ 設定を開く
        </Link>
      </div>
    )
  }

  const toggleChunk = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_CHUNKS) next.add(id)
      return next
    })
  }

  const generate = async () => {
    const chunks = candidates.filter((p) => selectedIds.has(p.id))
    const opts: LongGenOptions = { theme: theme.trim() || '日常', level, length, chunks }
    setError(null)
    setBusy(true)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const d = await generateLongReading(opts, { apiKey, model, signal: ac.signal })
      if (!d) setError('AIの応答を解析できませんでした。もう一度お試しください。')
      else {
        setDraft(d)
        setUsedOpts(opts)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const save = async () => {
    if (!draft || !usedOpts) return
    setSaving(true)
    try {
      await addPhrases([draftToLongPhrase(draft, usedOpts)])
      // createdTime 降順ソートで先頭に来るので、そのまま音読を始められる。
      navigate('/long-reading')
    } finally {
      setSaving(false)
    }
  }

  if (busy) {
    return (
      <div className="pt-20 text-center t-muted">
        <p className="text-3xl">📖</p>
        <p className="mt-4">長文を生成しています…</p>
        <button
          onClick={() => abortRef.current?.abort()}
          className="mt-6 text-sm t-subtle underline"
        >
          中止する
        </button>
      </div>
    )
  }

  if (draft && usedOpts) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">📖 生成された長文</h1>
        <div className="space-y-2 tile p-4 ">
          <Field label="タイトル" value={draft.titleEn} onChange={(titleEn) => setDraft({ ...draft, titleEn })} />
          <Field label="タイトル訳" value={draft.titleJa} onChange={(titleJa) => setDraft({ ...draft, titleJa })} />
          <Area label="本文" value={draft.en} rows={8} onChange={(en) => setDraft({ ...draft, en })} />
          <Area label="和訳" value={draft.ja} rows={6} onChange={(ja) => setDraft({ ...draft, ja })} />
        </div>

        {usedOpts.chunks.length > 0 && (
          <div className="tile p-4 ">
            <p className="text-xs t-subtle">指定チャンクの含有チェック</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {usedOpts.chunks.map((c) => {
                const ok = matchesChunk(c.en, draft.en)
                return (
                  <li
                    key={c.id}
                    className={`rounded-none border px-3 py-1 text-xs ${
 ok
                        ? 'border-carbon-success text-carbon-success'
                        : 'border-carbon-error text-carbon-error'
                    }`}
                  >
                    {ok ? '✓' : '✗'} {c.en}
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs t-subtle">
              ✗ があっても保存はできます。気になる場合は「もう一度生成」を。
            </p>
          </div>
        )}

        {error && <p className="text-sm text-carbon-error">⚠ {error}</p>}
        <button
          disabled={saving || !draft.titleEn || !draft.en}
          onClick={save}
          className="btn-primary w-full py-4 font-medium"
        >
          {saving ? '追加中…' : '📖 デッキに追加して音読へ'}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={generate}
            className="btn-secondary py-3 text-sm font-medium"
          >
            ↻ もう一度生成
          </button>
          <button
            onClick={() => setDraft(null)}
            className="btn-secondary py-3 text-sm font-medium"
          >
            ← 条件を変える
          </button>
        </div>
      </div>
    )
  }

  const canGenerate = selectedIds.size >= MIN_CHUNKS && selectedIds.size <= MAX_CHUNKS

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">📖 AIで長文を作る</h1>
      <p className="text-sm t-muted">
        デッキのチャンクを織り込んだ音読用の長文を生成します。テーマとチャンク（{MIN_CHUNKS}〜{MAX_CHUNKS}個）を選んでください。
      </p>
      <UsageBadge />

      <section className="space-y-3 tile p-4 ">
        <label className="block">
          <span className="text-xs t-subtle">テーマ</span>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="例: 日常、仕事の報告、旅行の思い出"
            className="input mt-0.5 w-full px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {THEME_CHIPS.map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-3 py-1 text-xs ${theme === t ? 'chip-active' : 'chip'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div>
          <span className="text-xs t-subtle">難易度</span>
          <div className="mt-1 flex gap-2">
            {LONG_LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`flex-1 px-3 py-1.5 text-sm ${level === l ? 'chip-active' : 'chip'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-xs t-subtle">長さ</span>
          <div className="mt-1 flex gap-2">
            {(
              [
                ['short', '短め（1段落）'],
                ['medium', '長め（2段落）'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setLength(v)}
                className={`flex-1 px-3 py-1.5 text-sm ${length === v ? 'chip-active' : 'chip'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2 tile p-4 ">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">織り込むチャンク</span>
          <span className="text-xs t-subtle">{selectedIds.size} / {MAX_CHUNKS}</span>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索（英語・日本語）"
          className="input w-full px-2 py-1.5 text-sm"
        />
        <p className="text-xs t-subtle">今日の復習対象（期日到来）を先頭に表示しています。</p>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id}>
              <label className="flex items-start gap-2 px-1 py-1.5">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedIds.has(p.id)}
                  disabled={!selectedIds.has(p.id) && selectedIds.size >= MAX_CHUNKS}
                  onChange={() => toggleChunk(p.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {p.en}
                    {isDue(progress[p.id]) && (
                      <span className="link ml-1 rounded-none border border-carbon-blue px-1 text-[10px] dark:border-carbon-blue-40">
                        今日
                      </span>
                    )}
                  </span>
                  <span className="block text-xs t-subtle">{p.ja}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="text-sm text-carbon-error">⚠ {error}</p>}
      <button
        disabled={!canGenerate}
        onClick={generate}
        className="btn-primary w-full py-4 font-medium"
      >
        📖 生成する
      </button>
      {!canGenerate && (
        <p className="text-center text-xs t-subtle">
          チャンクを{MIN_CHUNKS}〜{MAX_CHUNKS}個選ぶと生成できます。
        </p>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs t-subtle">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-0.5 w-full px-2 py-1.5 text-sm"
      />
    </label>
  )
}

function Area({
  label,
  value,
  rows,
  onChange,
}: {
  label: string
  value: string
  rows: number
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs t-subtle">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-0.5 w-full px-2 py-1.5 text-sm leading-relaxed"
      />
    </label>
  )
}
