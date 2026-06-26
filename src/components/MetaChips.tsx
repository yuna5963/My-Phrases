import type { Phrase } from '../types'

/** Small read-only badges for a phrase's facets (Type / Category / Level /
 * Priority). Empty facets are skipped so older data still renders cleanly. */
export default function MetaChips({
  phrase,
  className = '',
}: {
  phrase: Phrase
  className?: string
}) {
  const items = [phrase.type, phrase.category, phrase.level].filter(Boolean)
  if (!items.length && !phrase.priority) return null
  return (
    <div className={`flex flex-wrap items-center justify-center gap-1.5 ${className}`}>
      {items.map((t) => (
        <span
          key={t}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          {t}
        </span>
      ))}
      {phrase.priority && (
        <span className="text-[11px] text-amber-500">{phrase.priority}</span>
      )}
    </div>
  )
}
