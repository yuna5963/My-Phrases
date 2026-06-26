import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { speak } from '../lib/tts'
import { useSettings } from '../store/useSettings'
import { isMastered } from '../lib/srs'
import type { Phrase } from '../types'

type FacetKey = 'type' | 'category' | 'level' | 'priority'
const FACETS: { key: FacetKey; label: string }[] = [
  { key: 'type', label: 'タイプ' },
  { key: 'category', label: 'カテゴリ' },
  { key: 'level', label: 'レベル' },
  { key: 'priority', label: '優先度' },
]

/** Distinct facet values in deck order (empty values dropped). */
function distinct(phrases: Phrase[], key: FacetKey): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of phrases) {
    const v = p[key]
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

export default function Browse() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const setLearned = useDeck((s) => s.setLearned)
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.rate)

  const [q, setQ] = useState('')
  const [unsure, setUnsure] = useState(false)
  const [sel, setSel] = useState<Record<FacetKey, string | null>>({
    type: null,
    category: null,
    level: null,
    priority: null,
  })

  const facetValues = useMemo(
    () =>
      Object.fromEntries(
        FACETS.map((f) => [f.key, distinct(phrases, f.key)]),
      ) as Record<FacetKey, string[]>,
    [phrases],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return phrases.filter((p) => {
      if (unsure && progress[p.id]?.learned) return false
      for (const { key } of FACETS) {
        if (sel[key] && p[key] !== sel[key]) return false
      }
      if (!needle) return true
      return (
        p.en.toLowerCase().includes(needle) ||
        p.ja.toLowerCase().includes(needle) ||
        p.examples.some(
          (ex) =>
            ex.en.toLowerCase().includes(needle) ||
            ex.ja.toLowerCase().includes(needle),
        )
      )
    })
  }, [phrases, progress, q, unsure, sel])

  const toggleFacet = (key: FacetKey, value: string) =>
    setSel((cur) => ({ ...cur, [key]: cur[key] === value ? null : value }))

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">フレーズ一覧</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="検索（チャンク / 日本語 / 例文）"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={unsure} onClick={() => setUnsure((v) => !v)}>
          ⚠️ 自信なし
        </Chip>
      </div>

      {FACETS.map((f) =>
        facetValues[f.key].length ? (
          <div key={f.key} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-slate-400">{f.label}</span>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {facetValues[f.key].map((v) => (
                <Chip
                  key={v}
                  active={sel[f.key] === v}
                  onClick={() => toggleFacet(f.key, v)}
                >
                  {v}
                </Chip>
              ))}
            </div>
          </div>
        ) : null,
      )}

      <p className="text-xs text-slate-400">{filtered.length} 件</p>

      <ul className="space-y-2">
        {filtered.map((p) => {
          const pr = progress[p.id]
          const mastered = pr && isMastered(pr)
          const learned = pr?.learned === true
          return (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900"
            >
              <button
                onClick={() =>
                  navigate(`/phrase/${p.id}`, {
                    state: { ids: filtered.map((x) => x.id) },
                  })
                }
                className="min-w-0 flex-1 text-left active:opacity-70"
              >
                <p className="truncate font-medium">{p.en}</p>
                <p className="truncate text-sm text-slate-500">{p.ja}</p>
              </button>
              {mastered && <span title="習得済み">✅</span>}
              <button
                onClick={() => setLearned(p.id, !learned)}
                title="覚えた"
                className={`shrink-0 rounded-full px-2.5 py-2 text-xs font-medium active:scale-95 ${
                  learned
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {learned ? '☑覚えた' : '☐覚えた'}
              </button>
              <button
                onClick={() => speak(p.en, { voiceURI, rate })}
                className="shrink-0 rounded-full bg-sky-100 px-3 py-2 text-sky-600 active:scale-95 dark:bg-sky-900/40 dark:text-sky-400"
              >
                🔊
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${
        active
          ? 'bg-sky-500 text-white'
          : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}
