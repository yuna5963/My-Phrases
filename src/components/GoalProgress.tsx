// ホーム一等地のゴール進捗。未選択ならトラック選択、選択済みなら北極星＋進捗バー＋次のステップを出す。
// 「最終ゴールに近づいている実感」と「次の小さな達成」を1枚で見せるのが狙い。
import { useMemo, useState } from 'react'
import { useDeck } from '../store/useDeck'
import { GOAL_TRACKS, computeTrackProgress, getTrack } from '../lib/goals'

function TrackPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
      <h2 className="text-base font-bold text-indigo-900 dark:text-indigo-200">🎯 ゴールを選ぶ</h2>
      <p className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">
        めざす英語を選ぶと、そこへ向かう中間ゴールが並びます。ひとつずつクリアして最終ゴールへ。
      </p>
      <div className="mt-3 space-y-2">
        {GOAL_TRACKS.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left shadow-sm active:scale-[0.99] dark:bg-slate-900"
          >
            <span className="text-2xl">{t.emoji}</span>
            <span>
              <span className="block font-bold">{t.title}</span>
              <span className="block text-xs text-slate-500">{t.northStar}</span>
            </span>
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
    <section className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-5 text-white shadow">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-indigo-100">
          {track.emoji} {track.title}
        </div>
        <button
          onClick={() => setGoalTrack('')}
          className="text-xs text-indigo-200 underline underline-offset-2"
        >
          変更
        </button>
      </div>
      <p className="mt-1 text-xs text-indigo-100">🏁 {track.northStar}</p>

      <div className="mt-3">
        <div className="flex items-end justify-between">
          <span className="text-3xl font-bold">{pct}%</span>
          <span className="text-xs text-indigo-100">
            ステップ {tp.doneCount}/{track.steps.length} 達成
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {step ? (
        <button
          onClick={() => setShowSteps((v) => !v)}
          className="mt-3 block w-full rounded-xl bg-white/15 px-3 py-2 text-left"
        >
          <div className="text-xs text-indigo-100">次のゴール</div>
          <div className="text-sm font-bold">{step.step.title}</div>
          <div className="mt-0.5 text-xs text-indigo-100">
            {step.current} / {step.step.target}
          </div>
        </button>
      ) : (
        <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">
          🎉 全ステップ達成！最終ゴールに到達しました
        </p>
      )}

      {showSteps && (
        <ul className="mt-3 space-y-1.5">
          {tp.steps.map((s) => (
            <li key={s.step.id} className="flex items-center gap-2 text-sm">
              <span>{s.done ? '✅' : s === step ? '▶️' : '⬜'}</span>
              <span className={s.done ? 'text-indigo-100 line-through' : ''}>{s.step.title}</span>
              <span className="ml-auto text-xs text-indigo-200">
                {s.current}/{s.step.target}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
