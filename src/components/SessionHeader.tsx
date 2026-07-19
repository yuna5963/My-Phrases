interface Props {
  pos: number
  total: number
  title: string
}

export default function SessionHeader({ pos, total, title }: Props) {
  const pct = total > 0 ? Math.min(100, (pos / total) * 100) : 0
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{title}</span>
        <span className="t-subtle">
          {Math.min(pos + 1, total)} / {total}
        </span>
      </div>
      {/* Carbon: 直角のトラック＋青いフィル */}
      <div className="h-1 w-full bg-carbon-surface-2 dark:bg-carbon-line-dark">
        <div
          className="h-1 bg-carbon-blue transition-all dark:bg-carbon-blue-40"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
