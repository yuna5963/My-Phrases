import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { ALL_STATUSES } from '../store/useSettings'
import { LEVEL_OPTIONS, TYPE_OPTIONS } from '../lib/enrich'
import { MAX_EXAMPLES } from '../lib/export'
import { normalize } from '../lib/chunkMatch'
import {
  draftKanaIssues,
  draftToPhraseFromForm,
  emptyDraft,
  emptyExample,
  phraseToDraft,
  validateDraft,
  type PhraseDraft,
} from '../lib/phraseForm'
import type { KanaIssue } from '../lib/kanaLint'
import FormField from '../components/FormField'

const SELECT_CLS =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900'

function KanaWarning({ issues }: { issues: KanaIssue[] }) {
  if (!issues.length) return null
  return (
    <p className="text-xs text-amber-600 dark:text-amber-400">
      ⚠ カナ要確認: {[...new Set(issues.map((i) => i.message))].join(' / ')}
      — このまま保存すると「要確認」フラグ付きになります。
    </p>
  )
}

/**
 * チャンク編集/新規追加フォーム（/chunk/:id/edit・/chunk/new）。
 * CSV往復なしで教材の全フィールドを修正できる。編集では id と createdTime を
 * 維持する（英文を変えてもSRS進捗・並びが保たれる）。
 */
export default function ChunkEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const phrases = useDeck((s) => s.phrases)
  const updatePhrase = useDeck((s) => s.updatePhrase)

  const state = (location.state ?? {}) as { ids?: string[]; backTo?: string }
  const isNew = !id
  const existing = isNew ? undefined : phrases.find((p) => p.id === id)

  const [draft, setDraft] = useState<PhraseDraft>(() =>
    existing ? phraseToDraft(existing) : emptyDraft(),
  )
  const [saving, setSaving] = useState(false)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)

  const categories = useMemo(
    () => [...new Set(phrases.map((p) => p.category).filter(Boolean))],
    [phrases],
  )

  if (!isNew && !existing) {
    return (
      <div className="pt-20 text-center text-slate-500">
        <p>フレーズが見つかりませんでした。</p>
        <button onClick={() => navigate('/browse')} className="mt-4 text-sky-500">
          一覧へ戻る
        </button>
      </div>
    )
  }

  const patch = (p: Partial<PhraseDraft>) => {
    setDuplicateId(null)
    setDraft((d) => ({ ...d, ...p }))
  }
  const patchExample = (index: number, p: Partial<PhraseDraft['examples'][number]>) => {
    setDuplicateId(null)
    setDraft((d) => ({
      ...d,
      examples: d.examples.map((ex, i) => (i === index ? { ...ex, ...p } : ex)),
    }))
  }

  const issues = draftKanaIssues(draft)
  const errors = validateDraft(draft)

  const save = async () => {
    if (errors.length || saving) return
    // 同一英文の重複防止。編集でIDを維持する仕様のため、ID比較ではなく
    // 正規化した英文で比較する（教材化のデッキ収載チェックと同じ normalize）。
    // 編集時は自分自身を除いて判定する。
    const key = normalize(draft.en)
    const dup = phrases.find((p) => p.id !== existing?.id && normalize(p.en) === key)
    if (dup) {
      setDuplicateId(dup.id)
      return
    }
    setSaving(true)
    try {
      const phrase = draftToPhraseFromForm(draft, { existingPhrase: existing })
      await updatePhrase(phrase)
      navigate(`/chunk/${phrase.id}`, {
        replace: true,
        state: { ids: state.ids, backTo: state.backTo ?? '/browse' },
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{isNew ? '＋ チャンクを追加' : '✏️ チャンクを編集'}</h1>

      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <FormField
          label="英語（Chunk）"
          value={draft.en}
          onChange={(en) => patch({ en })}
          placeholder="It turned out better than I expected."
        />
        <FormField label="日本語訳" value={draft.ja} onChange={(ja) => patch({ ja })} />
        <FormField
          label="カナ（音節）"
          value={draft.kana}
          onChange={(kana) => patch({ kana })}
          placeholder="*ス・ティル*"
        />
        <KanaWarning issues={issues.kana} />

        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="text-xs text-slate-400">Type</span>
            <select
              value={draft.type}
              onChange={(e) => patch({ type: e.target.value })}
              className={`mt-0.5 ${SELECT_CLS}`}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
              {!(TYPE_OPTIONS as readonly string[]).includes(draft.type) && draft.type && (
                <option>{draft.type}</option>
              )}
            </select>
          </label>
          <label className="block flex-1">
            <span className="text-xs text-slate-400">Level</span>
            <select
              value={draft.level}
              onChange={(e) => patch({ level: e.target.value })}
              className={`mt-0.5 ${SELECT_CLS}`}
            >
              {LEVEL_OPTIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
              {!(LEVEL_OPTIONS as readonly string[]).includes(draft.level) && draft.level && (
                <option>{draft.level}</option>
              )}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-slate-400">カテゴリ</span>
          <input
            value={draft.category}
            onChange={(e) => patch({ category: e.target.value })}
            list="chunk-edit-categories"
            placeholder="Daily Status"
            className={`mt-0.5 ${SELECT_CLS}`}
          />
          <datalist id="chunk-edit-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <div className="flex gap-2">
          <div className="flex-1">
            <FormField
              label="Priority"
              value={draft.priority}
              onChange={(priority) => patch({ priority })}
              placeholder="★★★☆☆"
            />
          </div>
          <label className="block flex-1">
            <span className="text-xs text-slate-400">ステータス</span>
            <select
              value={draft.status}
              onChange={(e) => patch({ status: e.target.value })}
              className={`mt-0.5 ${SELECT_CLS}`}
            >
              {ALL_STATUSES.map((st) => (
                <option key={st}>{st}</option>
              ))}
              {!(ALL_STATUSES as readonly string[]).includes(draft.status) && draft.status && (
                <option>{draft.status}</option>
              )}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-slate-400">Note</span>
          <textarea
            value={draft.note}
            onChange={(e) => patch({ note: e.target.value })}
            rows={3}
            className={`mt-0.5 ${SELECT_CLS}`}
          />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-500">例文（最大{MAX_EXAMPLES}）</h2>
        {draft.examples.map((ex, i) => (
          <div
            key={i}
            className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-400">例文{i + 1}</span>
              <button
                onClick={() => {
                  setDuplicateId(null)
                  setDraft((d) => ({
                    ...d,
                    examples: d.examples.filter((_, j) => j !== i),
                  }))
                }}
                className="text-xs text-slate-400 underline"
              >
                ✕ この例文を削除
              </button>
            </div>
            <FormField label="英文" value={ex.en} onChange={(en) => patchExample(i, { en })} />
            <FormField
              label="日本語訳"
              value={ex.ja}
              onChange={(ja) => patchExample(i, { ja })}
            />
            <FormField
              label="カナ（音節）"
              value={ex.kana}
              onChange={(kana) => patchExample(i, { kana })}
            />
            <KanaWarning issues={issues.examples[i] ?? []} />
            {!ex.en.trim() && (ex.ja.trim() || ex.kana.trim()) && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ 英文が空の例文は保存されません
              </p>
            )}
          </div>
        ))}
        {draft.examples.length < MAX_EXAMPLES && (
          <button
            onClick={() =>
              setDraft((d) => ({ ...d, examples: [...d.examples, emptyExample()] }))
            }
            className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 active:scale-[0.99] dark:border-slate-700 dark:text-slate-400"
          >
            ＋ 例文を追加
          </button>
        )}
      </section>

      {errors.length > 0 && (
        <p className="text-center text-xs text-slate-400">{errors.join(' / ')}</p>
      )}
      {duplicateId && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          ⚠ この英文は既にデッキにあります。{' '}
          <Link to={`/chunk/${duplicateId}`} className="font-medium underline">
            既存のチャンクを開く →
          </Link>
        </p>
      )}

      <button
        disabled={errors.length > 0 || saving}
        onClick={save}
        className="w-full rounded-2xl bg-sky-500 py-4 font-medium text-white active:scale-95 disabled:opacity-50"
      >
        {saving ? '保存中…' : isNew ? '📚 デッキに追加' : '💾 保存する'}
      </button>
      <button
        onClick={() => navigate(-1)}
        className="w-full rounded-2xl bg-slate-200 py-4 font-medium text-slate-600 active:scale-95 dark:bg-slate-800 dark:text-slate-300"
      >
        ← 戻る（保存しない）
      </button>
    </div>
  )
}
