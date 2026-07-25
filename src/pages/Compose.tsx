import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../store/useSettings'
import type { Grade } from '../types'
import SessionHeader from '../components/SessionHeader'
import SessionSummary from '../components/SessionSummary'
import ReproCard, { chunkAndExampleItems } from '../components/ReproCard'
import GradeButtons from '../components/GradeButtons'
import MetaChips from '../components/MetaChips'
import StepNav from '../components/StepNav'

/**
 * 瞬間英作文: 「日本語訳 → 声に出して英作文 → タッチで答え合わせ」を
 * チャンク → 例文1 → … と1枚のカードで続けて練習する（共通 `ReproCard`）。
 * 最後の項目まで答え合わせしたら3段階採点。
 * 出題はチャンク単位のSRSキューを Type → Category でまとめ直し、
 * 同じタイプ・同じカテゴリのチャンクへ優先的に遷移する（clusterByFacet）。
 */
export default function Compose() {
  const s = useSession({ clusterByFacet: true, mode: 'compose' })
  const commitGate = useSettings((x) => x.commitGate)
  const navigate = useNavigate()

  // 最後の項目（例文の末尾）の英文まで開示したら採点ボタンを出す。
  const [atEnd, setAtEnd] = useState(false)
  // 開示前の申告（コミットゲート）。採点時に一緒に記録する。
  const [predicted, setPredicted] = useState<'can' | 'unsure' | undefined>(undefined)

  useEffect(() => {
    setAtEnd(false)
    setPredicted(undefined)
  }, [s.pos])

  const c = s.current
  const items = useMemo(() => (c ? chunkAndExampleItems(c) : []), [c])

  if (s.empty) {
    return (
      <div className="pt-20 text-center t-muted">
        <p>練習できるフレーズがありません。</p>
        <button onClick={() => navigate('/')} className="mt-4 link">
          ホームへ戻る
        </button>
      </div>
    )
  }
  if (s.done) return <SessionSummary tally={s.tally} onRestart={s.restart} />

  return (
    <div className="flex h-full flex-col">
      <SessionHeader pos={s.pos} total={s.total} title="瞬間英作文" />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
        <ReproCard
          key={s.pos}
          items={items}
          meta={<MetaChips phrase={c!} />}
          accentClass="link"
          onStep={(st) => setAtEnd(st.revealed && st.idx === items.length - 1)}
          commitGate={commitGate}
          onPredict={setPredicted}
        />
        <p className="text-center text-sm t-subtle">
          日本語を見て声に出して英作文 → タッチで答え合わせ
        </p>
      </div>

      {atEnd && (
        <GradeButtons onGrade={(g: Grade) => s.answer(g, undefined, predicted)} />
      )}

      <StepNav
        onPrev={s.goPrev}
        onNext={s.goNext}
        canPrev={s.canPrev}
        canNext={s.canNext}
      />

      {/* 片手で押せるよう、終了は画面下部に置く。 */}
      <button
        onClick={() => navigate('/')}
        className="mt-2 w-full py-2 text-center text-sm t-subtle active:opacity-80"
      >
        ✕ やめる
      </button>
    </div>
  )
}
