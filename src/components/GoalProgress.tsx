// ホーム一等地のゴール進捗。未選択ならトラック選択、選択済みなら北極星＋進捗バー＋次のステップを出す。
// 「最終ゴールに近づいている実感」と「次の小さな達成」を1枚で見せるのが狙い。
// 見た目は Carbon の cta-banner: 青ソリッド・直角・白文字（DESIGN.md）。
import { useMemo, useState } from 'react'
import { useDeck } from '../store/useDeck'
import { GOAL_TRACKS, computeTrackProgress, getTrack } from '../lib/goals'

function TrackPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <section className="tile-muted p-4">
      <h2 className="text-base font-semibold">🎯 ゴールを選ぶ</h2>
      <p className="t-muted mt-1 text-sm">
        めざす英語を選ぶと、そこへ向かう中間ゴールが並びます。ひとつずつクリアして最終ゴールへ。
      </p>
      <div className="mt-3 space-y-2">
        {GOAL_TRACKS.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            className="tile flex w-full items-center gap-3 px-3 py-3 text-left active:bg-carbon-surface dark:active:bg-carbon-line-dark"
          >
            <span className="text-2xl">{t.emoji}</span>
            <span>
              <span className="block font-semibold">{t.title}</span>
              <span className="t-muted block text-xs">{t.northStar}</span>
            </span>
            <span className="link ml-auto shrink-0">→</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function GoalProgress() {
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const events = useDeck((s) => s.events)
  const goalTrackId = useDeck((s) => s.goalTrackId)
  const setGoalTrack = useDeck((s) => s.setGoalTrack)
  const [showSteps, setShowSteps] = useState(false)

  const track = getTrack(goalTrackId)
  const tp = useMemo(
    () => (track ? computeTrackProgress(track, { phrases, progress, events }) : null),
    [track, phrases, progress, events],
  )

  if (!track || !tp) return <TrackPicker onPick={setGoalTrack} />

  const pct = Math.round(tp.ratio * 100)
  const step = tp.currentStep

  return (
    <section className="rounded-none bg-carbon-blue p-5 text-white">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">
          {track.emoji} {track.title}
        </div>
        <button
          onClick={() => setGoalTrack('')}
          className="text-xs text-white/70 underline underline-offset-2"
        >
          変更
        </button>
      </div>
      <p className="mt-1 text-xs text-white/80">🏁 {track.northStar}</p>

      <div className="mt-3">
        <div className="flex items-end justify-between">
          <span className="display text-4xl">{pct}%</span>
          <span className="text-xs text-white/80">
            ステップ {tp.doneCount}/{track.steps.length} 達成
          </span>
        </div>
        <div className="mt-2 h-1 w-full bg-carbon-blue-80">
          <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {step ? (
        <button
          onClick={() => setShowSteps((v) => !v)}
          className="mt-3 block w-full border border-white/40 px-3 py-2 text-left"
        >
          <div className="text-xs text-white/80">次のゴール</div>
          <div className="text-sm font-semibold">{step.step.title}</div>
          <div className="mt-0.5 text-xs text-white/80">
            {step.current} / {step.step.target}
          </div>
        </button>
      ) : (
        <p className="mt-3 border border-white/40 px-3 py-2 text-sm font-semibold">
          🎉 全ステップ達成！最終ゴールに到達しました
        </p>
      )}

      {showSteps && (
        <ul className="mt-3 space-y-1.5">
          {tp.steps.map((s) => (
            <li key={s.step.id} className="flex items-center gap-2 text-sm">
              <span>{s.done ? '✅' : s === step ? '▶' : '・'}</span>
              <span className={s.done ? 'text-white/70 line-through' : ''}>{s.step.title}</span>
              <span className="ml-auto text-xs text-white/70">
                {s.current}/{s.step.target}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
