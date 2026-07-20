import { useNavigate } from 'react-router-dom'
import type { Tally } from '../hooks/useSession'

interface Props {
  tally: Tally
  onRestart: () => void
  /** 起動レイテンシ（和訳表示→英文開示の中央値ms）。Sentence Engine の2ドリルのみ渡す。 */
  latencyMedianMs?: number
}

/** 起動レイテンシの目安（◎3秒以内 / ○5秒以内 / それ以外は目安5秒）。 */
function latencyHint(ms: number): string {
  const sec = ms / 1000
  if (sec <= 3) return '◎ 3秒以内'
  if (sec <= 5) return '○ 5秒以内'
  return '目安は5秒'
}

export default function SessionSummary({ tally, onRestart, latencyMedianMs }: Props) {
  const navigate = useNavigate()
  const total = tally.good + tally.vague + tally.bad
  return (
    <div className="flex flex-col items-center gap-6 pt-16 text-center">
      <div className="text-5xl">🎉</div>
      <h2 className="text-xl font-normal">セッション完了！</h2>
      <p className="t-muted text-sm">{total} 回採点しました</p>
      {latencyMedianMs != null && (
        <p className="t-muted text-sm">
          ⚡ 起動 {(latencyMedianMs / 1000).toFixed(1)}秒
          <span className="t-subtle"> ／ {latencyHint(latencyMedianMs)}</span>
        </p>
      )}
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
