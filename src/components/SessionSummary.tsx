import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Tally } from '../hooks/useSession'

interface Props {
  tally: Tally
  onRestart: () => void
  /** 起動レイテンシ（和訳表示→英文開示の中央値ms）。Sentence Engine の2ドリルのみ渡す。 */
  latencyMedianMs?: number
  /** セット制ドリルのとき、いま完了したのが何セット目か（1始まり）。渡すとセット完了の演出になる。 */
  setNumber?: number
}

/** 起動レイテンシの目安（◎3秒以内 / ○5秒以内 / それ以外は目安5秒）。 */
function latencyHint(ms: number): string {
  const sec = ms / 1000
  if (sec <= 3) return '◎ 3秒以内'
  if (sec <= 5) return '○ 5秒以内'
  return '目安は5秒'
}

/** 紙吹雪の色は Carbon の限られたパレットから（アクセント青＋セマンティック3色）。 */
const CONFETTI_COLORS = ['#0f62fe', '#24a148', '#f1c21b', '#78a9ff']
const CONFETTI_PIECES = 12

/** 端末が振動に対応していないブラウザもあるため、任意プロパティとして参照する。 */
type Vibratable = Navigator & { vibrate?: (pattern: number | number[]) => boolean }

export default function SessionSummary({
  tally,
  onRestart,
  latencyMedianMs,
  setNumber,
}: Props) {
  const navigate = useNavigate()
  const total = tally.good + tally.vague + tally.bad
  const celebrate = setNumber != null
  const perfect = tally.bad === 0 && tally.vague === 0 && total > 0

  // セット完了の瞬間だけ短く振動させ、「やりきった」を体で分かるようにする。
  useEffect(() => {
    if (setNumber == null) return
    ;(navigator as Vibratable).vibrate?.([12, 60, 24])
  }, [setNumber])

  return (
    <div className="relative flex flex-col items-center gap-6 pt-16 text-center">
      {celebrate && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: CONFETTI_PIECES }, (_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${(i * 100) / CONFETTI_PIECES + 3}%`,
                animationDelay: `${(i % 5) * 0.12}s`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              }}
            />
          ))}
        </div>
      )}

      <div className={`text-5xl ${celebrate ? 'pop-in' : ''}`}>🎉</div>
      {celebrate ? (
        <div className="pop-in space-y-2">
          <h2 className="text-xl font-normal">セット {setNumber} 完了！</h2>
          <p className="t-muted text-sm">{total}問やりきりました</p>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-normal">セッション完了！</h2>
          <p className="t-muted text-sm">{total} 回採点しました</p>
        </>
      )}
      {celebrate && total > 0 && (
        <p className="t-muted text-sm">正答率 {Math.round((tally.good / total) * 100)}%</p>
      )}
      {celebrate && perfect && (
        <p className="text-sm font-medium text-carbon-success">🏆 全問「できた」！完璧です</p>
      )}
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
          {celebrate ? '次のセットへ →' : 'もう一度'}
        </button>
      </div>
    </div>
  )
}
