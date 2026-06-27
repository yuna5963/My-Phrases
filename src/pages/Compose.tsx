import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../store/useSettings'
import { speak } from '../lib/tts'
import SessionHeader from '../components/SessionHeader'
import SessionSummary from '../components/SessionSummary'
import PlayButton from '../components/PlayButton'
import ReproCard from '../components/ReproCard'
import StepNav from '../components/StepNav'

/**
 * 瞬間英作文: 日本語（チャンクの意味）を見て英語チャンクを即作文し、
 * 答え合わせでチャンク英語＋5例文（ネットワーク）を確認する。
 */
export default function Compose() {
  const s = useSession()
  const autoPlay = useSettings((x) => x.autoPlay)
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)
  const navigate = useNavigate()

  const [revealed, setRevealed] = useState(false)
  const [showExamples, setShowExamples] = useState(false)

  useEffect(() => {
    setRevealed(false)
    setShowExamples(false)
  }, [s.pos])

  if (s.empty) {
    return (
      <div className="pt-20 text-center text-slate-500">
        <p>練習できるフレーズがありません。</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sky-500">
          ホームへ戻る
        </button>
      </div>
    )
  }
  if (s.done) return <SessionSummary tally={s.tally} onRestart={s.restart} />

  const c = s.current!

  const reveal = () => {
    setRevealed(true)
    if (autoPlay) speak(c.en, { voiceURI, rate })
  }

  return (
    <div className="flex h-full flex-col">
      <SessionHeader pos={s.pos} total={s.total} title="瞬間英作文" />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
        {/* Japanese prompt */}
        <p className="text-center text-2xl font-bold leading-relaxed">{c.ja}</p>

        {revealed ? (
          <div className="w-full space-y-4">
            <div className="rounded-2xl bg-white p-5 text-center shadow-sm dark:bg-slate-900">
              <p className="text-xl font-semibold text-sky-600 dark:text-sky-400">
                {c.en}
              </p>
              <div className="mt-4 flex justify-center">
                <PlayButton text={c.en} />
              </div>
            </div>

            {c.examples.length > 0 && (
              <div className="text-center">
                <button
                  onClick={() => setShowExamples((v) => !v)}
                  className="text-sm text-slate-400"
                >
                  {showExamples ? '例文を隠す' : `例文を見る（${c.examples.length}）`}
                </button>
                {showExamples && (
                  <div className="mt-3">
                    <ReproCard
                      items={c.examples}
                      accentClass="text-sky-600 dark:text-sky-400"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={reveal}
            className="rounded-2xl border-2 border-dashed border-slate-300 px-8 py-4 text-slate-500 dark:border-slate-700"
          >
            答えを見る 👀
          </button>
        )}
      </div>

      {/* Grade buttons */}
      {revealed && (
        <div className="grid grid-cols-3 gap-2 pt-2">
          <button
            onClick={() => s.answer('bad')}
            className="rounded-2xl bg-rose-500 py-4 font-medium text-white active:scale-95"
          >
            ✕<br />
            <span className="text-xs">できなかった</span>
          </button>
          <button
            onClick={() => s.answer('vague')}
            className="rounded-2xl bg-amber-500 py-4 font-medium text-white active:scale-95"
          >
            🔺<br />
            <span className="text-xs">あいまい</span>
          </button>
          <button
            onClick={() => s.answer('good')}
            className="rounded-2xl bg-emerald-500 py-4 font-medium text-white active:scale-95"
          >
            ⭕<br />
            <span className="text-xs">できた</span>
          </button>
        </div>
      )}

      <StepNav
        onPrev={s.goPrev}
        onNext={s.goNext}
        canPrev={s.canPrev}
        canNext={s.canNext}
      />
    </div>
  )
}
