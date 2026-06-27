import type { ReactNode } from 'react'
import { FACETS, type PhraseFilter } from '../hooks/usePhraseFilter'

/** Search box + 自信なし toggle + facet chips, driven by usePhraseFilter. */
export default function FacetFilters({ filter }: { filter: PhraseFilter }) {
  const { q, setQ, unsure, toggleUnsure, sel, toggleFacet, facetValues } = filter
  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="検索（チャンク / 日本語 / 例文）"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={unsure} onClick={toggleUnsure}>
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
    </>
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
