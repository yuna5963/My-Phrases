import { useMemo, useState, type ReactNode } from 'react'
import { useDeck } from '../store/useDeck'
import { speak } from '../lib/tts'
import { useSettings } from '../store/useSettings'
import { isMastered } from '../lib/srs'
import { ALL_STATUSES } from '../store/useSettings'

export default function Browse() {
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.rate)

  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return phrases.filter((p) => {
      if (status && p.status !== status) return false
      if (!needle) return true
      return (
        p.en.toLowerCase().includes(needle) || p.ja.toLowerCase().includes(needle)
      )
    })
  }, [phrases, q, status])

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">フレーズ一覧</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="検索（英語 / 日本語）"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={status === null} onClick={() => setStatus(null)}>
          すべて
        </Chip>
        {ALL_STATUSES.map((st) => (
          <Chip key={st} active={status === st} onClick={() => setStatus(st)}>
            {st}
          </Chip>
        ))}
      </div>

      <p className="text-xs text-slate-400">{filtered.length} 件</p>

      <ul className="space-y-2">
        {filtered.map((p) => {
          const pr = progress[p.id]
          const mastered = pr && isMastered(pr)
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.en}</p>
                <p className="truncate text-sm text-slate-500">{p.ja}</p>
              </div>
              {mastered && <span title="習得済み">✅</span>}
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
