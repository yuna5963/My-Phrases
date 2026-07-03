import type { Grade } from '../types'

/** 3段階の自己採点ボタン（瞬間英作文・今日の練習で共有）。 */
export default function GradeButtons({ onGrade }: { onGrade: (g: Grade) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 pt-2">
      <button
        onClick={() => onGrade('bad')}
        className="rounded-2xl bg-rose-500 py-4 font-medium text-white active:scale-95"
      >
        ✕<br />
        <span className="text-xs">できなかった</span>
      </button>
      <button
        onClick={() => onGrade('vague')}
        className="rounded-2xl bg-amber-500 py-4 font-medium text-white active:scale-95"
      >
        🔺<br />
        <span className="text-xs">あいまい</span>
      </button>
      <button
        onClick={() => onGrade('good')}
        className="rounded-2xl bg-emerald-500 py-4 font-medium text-white active:scale-95"
      >
        ⭕<br />
        <span className="text-xs">できた</span>
      </button>
    </div>
  )
}
