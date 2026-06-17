import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession, type SessionOptions } from '../hooks/useSession'
import { useSettings } from '../store/useSettings'
import { speak } from '../lib/tts'
import SessionHeader from './SessionHeader'
import SessionSummary from './SessionSummary'
import PlayButton from './PlayButton'

interface Props {
  title: string
  /** Encouragement shown under the card. */
  hint: string
  /** Tailwind accent colour for the prompt text + play button. */
  accent: { text: string; button: string }
  filter?: SessionOptions['filter']
}

/**
 * Shared "listen to the model and say it aloud" practice flow used by both
 * 発音練習 and モデリング — the model English is shown from the start and the
 * user self-grades whether they could say it.
 */
export default function ListenPractice({ title, hint, accent, filter }: Props) {
  const s = useSession({ filter })
  const autoPlay = useSettings((x) => x.autoPlay)
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)
  const navigate = useNavigate()

  // Auto-play the model audio when a new card appears.
  useEffect(() => {
    if (autoPlay && s.current) speak(s.current.en, { voiceURI, rate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="flex h-full flex-col">
      <SessionHeader pos={s.pos} total={s.total} title={title} />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
        <div className="w-full rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-900">
          <p className={`text-2xl font-bold leading-relaxed ${accent.text}`}>
            {c.en}
          </p>
          <p className="mt-3 text-sm text-slate-500">{c.ja}</p>
        </div>

        <PlayButton text={c.en} label="🔊 もう一度聞く" className={accent.button} />
        <p className="text-center text-sm text-slate-400">{hint}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={() => s.answer('vague')}
          className="rounded-2xl bg-slate-400 py-4 font-medium text-white active:scale-95"
        >
          🔁 もう一度
        </button>
        <button
          onClick={() => s.answer('good')}
          className="rounded-2xl bg-emerald-500 py-4 font-medium text-white active:scale-95"
        >
          ✅ 言えた
        </button>
      </div>
    </div>
  )
}
