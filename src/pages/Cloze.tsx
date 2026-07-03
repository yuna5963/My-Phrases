import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../store/useSettings'
import { speak } from '../lib/tts'
import { clozeItems, hasCloze } from '../lib/cloze'
import SessionHeader from '../components/SessionHeader'
import SessionSummary from '../components/SessionSummary'
import ClozeCard from '../components/ClozeCard'
import GradeButtons from '../components/GradeButtons'
import StepNav from '../components/StepNav'

/**
 * 文脈穴埋め: 例文中のチャンクを伏せ字にして、文脈からチャンクを想起する練習。
 * チャンクが例文中に（単語境界つきで）見つかるフレーズだけを出題し、
 * 1チャンクにつきマッチした例文からランダムに1つを出す。
 */
export default function Cloze() {
  const s = useSession({ filter: hasCloze })
  const autoPlay = useSettings((x) => x.autoPlay)
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)
  const navigate = useNavigate()

  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    setRevealed(false)
  }, [s.pos])

  const c = s.current
  // 出題する例文は表示のたびにランダムに1つ選ぶ（同一カード内では固定）。
  const item = useMemo(() => {
    if (!c) return null
    const items = clozeItems(c)
    return items[Math.floor(Math.random() * items.length)] ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, s.pos])

  if (s.empty) {
    return (
      <div className="pt-20 text-center text-slate-500">
        <p>穴埋めにできる例文がありません。</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sky-500">
          ホームへ戻る
        </button>
      </div>
    )
  }
  if (s.done) return <SessionSummary tally={s.tally} onRestart={s.restart} />

  const reveal = () => {
    setRevealed(true)
    if (autoPlay && item) speak(item.before + item.chunk + item.after, { voiceURI, rate })
  }

  return (
    <div className="flex h-full flex-col">
      <SessionHeader pos={s.pos} total={s.total} title="文脈穴埋め" />

      {item && (
        <ClozeCard item={item} chunkJa={c!.ja} revealed={revealed} onReveal={reveal} />
      )}

      {revealed && <GradeButtons onGrade={s.answer} />}

      <StepNav
        onPrev={s.goPrev}
        onNext={s.goNext}
        canPrev={s.canPrev}
        canNext={s.canNext}
      />

      {/* 片手で押せるよう、終了は画面下部に置く。 */}
      <button
        onClick={() => navigate('/')}
        className="mt-2 w-full py-2 text-center text-sm text-slate-400 active:scale-95"
      >
        ✕ やめる
      </button>
    </div>
  )
}
