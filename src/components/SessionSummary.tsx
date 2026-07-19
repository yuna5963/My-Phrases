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
      <h2 className="text-xl font-normal">セッション完了！</h2>
      <p className="t-muted text-sm">{total} 回採点しました</p>
      <div className="grid w-full grid-cols-3 gap-3">
        <div className="tile p-4">
          <div className="display text-2xl text-carbon-success">{tally.good}</div>
          <div className="t-muted text-xs">できた</div>
        </div>
        <div className="tile p-4">
          <div className="display text-2xl">{tally.vague}</div>
          <div className="t-muted text-xs">あいまい</div>
        </div>
        <div className="tile p-4">
          <div className="display text-2xl text-carbon-error">{tally.bad}</div>
          <div className="t-muted text-xs">できなかった</div>
        </div>
      </div>
      <div className="flex w-full gap-3 pt-2">
        <button onClick={() => navigate('/')} className="btn-tertiary flex-1 py-3">
          ホームへ
        </button>
        <button onClick={onRestart} className="btn-primary flex-1 py-3 font-medium">
          もう一度
        </button>
      </div>
    </div>
  )
}
