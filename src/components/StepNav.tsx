interface Props {
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}

/** フレーズ再生（PhraseDetail）と同じ見た目の「← 戻る / 進む →」カード送り。
 *  Carbon: 戻る=secondary（チャコール）/ 進む=primary（青）。 */
export default function StepNav({ onPrev, onNext, canPrev, canNext }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <button onClick={onPrev} disabled={!canPrev} className="btn-secondary py-3 font-medium">
        ← 戻る
      </button>
      <button onClick={onNext} disabled={!canNext} className="btn-primary py-3 font-medium">
        進む →
      </button>
    </div>
  )
}
