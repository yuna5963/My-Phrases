import { useMemo, useState } from 'react'
import { useDeck } from '../store/useDeck'
import { isLongReading } from '../lib/longReading'
import { isSentenceEngine } from '../lib/sentenceEngine'
import type { Phrase } from '../types'

export type FacetKey = 'type' | 'category' | 'level' | 'priority'

export const FACETS: { key: FacetKey; label: string }[] = [
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

export interface PhraseFilter {
  q: string
  setQ: (v: string) => void
  unsure: boolean
  toggleUnsure: () => void
  sel: Record<FacetKey, string | null>
  toggleFacet: (key: FacetKey, value: string) => void
  facetValues: Record<FacetKey, string[]>
  /** Phrases passing the search query, 自信なし toggle and facet chips. */
  filtered: Phrase[]
  /** 一覧の母数＝長文音読・Sentence Engine を除いた全チャンク（絞り込み前）。 */
  base: Phrase[]
}

/**
 * Shared deck filtering (search + 自信なし + facet chips) used by both the
 * チャンク一覧 and 例文一覧 pages. Render the matching UI with <FacetFilters>.
 */
export function usePhraseFilter(phrases: Phrase[]): PhraseFilter {
  const progress = useDeck((s) => s.progress)

  // 長文音読・Sentence Engine は一覧（チャンク一覧・例文一覧）にもタイプ絞り込みにも出さない。
  const base = useMemo(
    () => phrases.filter((p) => !isLongReading(p) && !isSentenceEngine(p)),
    [phrases],
  )

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
        FACETS.map((f) => [f.key, distinct(base, f.key)]),
      ) as Record<FacetKey, string[]>,
    [base],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return base.filter((p) => {
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
  }, [base, progress, q, unsure, sel])

  const toggleUnsure = () => setUnsure((v) => !v)
  const toggleFacet = (key: FacetKey, value: string) =>
    setSel((cur) => ({ ...cur, [key]: cur[key] === value ? null : value }))

  return { q, setQ, unsure, toggleUnsure, sel, toggleFacet, facetValues, filtered, base }
}
