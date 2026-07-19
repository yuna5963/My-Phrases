import type { Grade } from '../types'

/** 3段階の自己採点ボタン（瞬間英作文・今日の練習で共有）。
 *  Carbon の semantic 3色（error/warning/success）。警告黄の上は ink 文字（白はコントラスト不足）。 */
export default function GradeButtons({ onGrade }: { onGrade: (g: Grade) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 pt-2">
      <button
        onClick={() => onGrade('bad')}
        className="rounded-none bg-carbon-error py-4 font-medium text-white active:opacity-80"
      >
        ✕<br />
        <span className="text-xs">できなかった</span>
      </button>
      <button
        onClick={() => onGrade('vague')}
        className="rounded-none bg-carbon-warning py-4 font-medium text-carbon-ink active:opacity-80"
      >
        △<br />
        <span className="text-xs">あいまい</span>
      </button>
      <button
        onClick={() => onGrade('good')}
        className="rounded-none bg-carbon-success py-4 font-medium text-white active:opacity-80"
      >
        ◯<br />
        <span className="text-xs">できた</span>
      </button>
    </div>
  )
}
