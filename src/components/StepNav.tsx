interface Props {
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}

/** フレーズ再生（PhraseDetail）と同じ見た目の「← 戻る / 進む →」カード送り。 */
export default function StepNav({ onPrev, onNext, canPrev, canNext }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <button
        onClick={onPrev}
        disabled={!canPrev}
        className="rounded-2xl bg-slate-400 py-3 font-medium text-white active:scale-95 disabled:opacity-40 disabled:active:scale-100"
      >
        ← 戻る
      </button>
      <button
        onClick={onNext}
        disabled={!canNext}
        className="rounded-2xl bg-violet-500 py-3 font-medium text-white active:scale-95 disabled:opacity-40 disabled:active:scale-100"
      >
        進む →
      </button>
    </div>
  )
}
