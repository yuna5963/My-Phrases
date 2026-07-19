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
          className="rounded-none bg-carbon-surface px-2 py-0.5 text-[11px] text-carbon-ink-muted dark:bg-carbon-line-dark dark:text-carbon-inverse-muted"
        >
          {t}
        </span>
      ))}
      {phrase.priority && (
        <span className="t-subtle text-[11px]">{phrase.priority}</span>
      )}
    </div>
  )
}
