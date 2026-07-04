import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { speak } from '../lib/tts'
import { useSettings } from '../store/useSettings'
import { isMastered } from '../lib/srs'
import { usePhraseFilter } from '../hooks/usePhraseFilter'
import FacetFilters from '../components/FacetFilters'
import Pager from '../components/Pager'

const PAGE_SIZE = 100

export default function Browse() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const setLearned = useDeck((s) => s.setLearned)
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.rate)

  const filter = usePhraseFilter(phrases)
  const { filtered } = filter

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const [page, setPage] = useState(0)
  // フィルタが変わったら先頭ページに戻す（結果は上から見たいので）。
  useEffect(() => {
    setPage(0)
  }, [filtered])

  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  // 連続再生で前後送りできるよう、絞り込み後の id 列を渡す。
  const ids = useMemo(() => filtered.map((p) => p.id), [filtered])

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">チャンク一覧</h1>

      <FacetFilters filter={filter} />

      <p className="text-xs text-slate-400">{filtered.length} 件</p>

      <ul className="space-y-2">
        {pageItems.map((p) => {
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
                  navigate(`/chunk/${p.id}`, {
                    state: { ids, backTo: '/browse' },
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
              <button
                onClick={() =>
                  navigate(`/phrase/${p.id}`, {
                    state: { ids, backTo: '/browse' },
                  })
                }
                title="連続再生"
                className="shrink-0 rounded-full bg-violet-100 px-3 py-2 text-violet-600 active:scale-95 dark:bg-violet-900/40 dark:text-violet-400"
              >
                ▶
              </button>
            </li>
          )
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">
          該当するチャンクがありません
        </p>
      )}

      <Pager
        page={page}
        pageCount={pageCount}
        onPrev={() => setPage((n) => Math.max(0, n - 1))}
        onNext={() => setPage((n) => Math.min(pageCount - 1, n + 1))}
      />
    </div>
  )
}
