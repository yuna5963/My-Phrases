import { useNavigate } from 'react-router-dom'
import type { Tally } from '../hooks/useSession'

interface Props {
  tally: Tally
  onRestart: () => void
}

export default function SessionSummary({ tally, onRestart }: Props) {
  const navigate = useNavigate()
  const total = tally.good + tally.vague + tally.bad
  return (
    <div className="flex flex-col items-center gap-6 pt-16 text-center">
      <div className="text-5xl">🎉</div>
      <h2 className="text-xl font-bold">セッション完了！</h2>
      <p className="text-sm text-slate-500">{total} 回採点しました</p>
      <div className="grid w-full grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-4 dark:bg-slate-900">
          <div className="text-2xl font-bold text-emerald-500">{tally.good}</div>
          <div className="text-xs text-slate-500">できた</div>
        </div>
        <div className="rounded-2xl bg-white p-4 dark:bg-slate-900">
          <div className="text-2xl font-bold text-amber-500">{tally.vague}</div>
          <div className="text-xs text-slate-500">あいまい</div>
        </div>
        <div className="rounded-2xl bg-white p-4 dark:bg-slate-900">
          <div className="text-2xl font-bold text-rose-500">{tally.bad}</div>
          <div className="text-xs text-slate-500">できなかった</div>
        </div>
      </div>
      <div className="flex w-full gap-3 pt-2">
        <button
          onClick={() => navigate('/')}
          className="flex-1 rounded-2xl border border-slate-300 py-3 dark:border-slate-700"
        >
          ホームへ
        </button>
        <button
          onClick={onRestart}
          className="flex-1 rounded-2xl bg-sky-500 py-3 font-medium text-white"
        >
          もう一度
        </button>
      </div>
    </div>
  )
}
