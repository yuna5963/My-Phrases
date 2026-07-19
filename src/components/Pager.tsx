/**
 * 一覧のページ送り（チャンク一覧・例文一覧で共有）。
 * 1ページに収まる（pageCount <= 1）ときは何も表示しない。
 * `page` は 0 始まり、表示は 1 始まり。
 */
export default function Pager({
  page,
  pageCount,
  onPrev,
  onNext,
}: {
  page: number
  pageCount: number
  onPrev: () => void
  onNext: () => void
}) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-center gap-4 pt-2">
      <button onClick={onPrev} disabled={page === 0} className="chip px-5 py-2 text-sm font-medium">
        ← 前
      </button>
      <span className="t-subtle text-sm">
        {page + 1} / {pageCount}
      </span>
      <button
        onClick={onNext}
        disabled={page >= pageCount - 1}
        className="chip px-5 py-2 text-sm font-medium"
      >
        次 →
      </button>
    </div>
  )
}
