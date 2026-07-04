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
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="rounded-full bg-slate-200 px-5 py-2 text-sm font-medium text-slate-600 active:scale-95 disabled:opacity-40 disabled:active:scale-100 dark:bg-slate-800 dark:text-slate-300"
      >
        ← 前
      </button>
      <span className="text-sm text-slate-400">
        {page + 1} / {pageCount}
      </span>
      <button
        onClick={onNext}
        disabled={page >= pageCount - 1}
        className="rounded-full bg-slate-200 px-5 py-2 text-sm font-medium text-slate-600 active:scale-95 disabled:opacity-40 disabled:active:scale-100 dark:bg-slate-800 dark:text-slate-300"
      >
        次 →
      </button>
    </div>
  )
}
