import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { speak } from '../lib/tts'
import PlayButton from '../components/PlayButton'

/**
 * Single-phrase pronunciation view opened from フレーズ一覧. Mirrors the
 * 発音練習 card display and lets the user step through the list with 戻る / 進む.
 * The browse list passes its (filtered) id order via router state; otherwise we
 * fall back to the full deck order.
 */
export default function PhraseDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const autoPlay = useSettings((x) => x.autoPlay)
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)

  const ids = useMemo(() => {
    const passed = (location.state as { ids?: string[] } | null)?.ids
    return passed && passed.length ? passed : phrases.map((p) => p.id)
  }, [location.state, phrases])

  const phrase = phrases.find((p) => p.id === id)
  const index = ids.indexOf(id ?? '')

  // Read the model aloud whenever the phrase changes.
  useEffect(() => {
    if (autoPlay && phrase) speak(phrase.en, { voiceURI, rate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!phrase) {
    return (
      <div className="pt-20 text-center text-slate-500">
        <p>フレーズが見つかりませんでした。</p>
        <button onClick={() => navigate('/browse')} className="mt-4 text-sky-500">
          一覧へ戻る
        </button>
      </div>
    )
  }

  const go = (i: number) => {
    const nextId = ids[i]
    if (!nextId) return
    navigate(`/phrase/${nextId}`, { state: { ids } })
  }

  const hasPrev = index > 0
  const hasNext = index >= 0 && index < ids.length - 1

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between text-sm">
        <button onClick={() => navigate('/browse')} className="text-slate-400">
          ← 一覧へ
        </button>
        <span className="font-medium">発音練習</span>
        <span className="text-slate-400">
          {index >= 0 ? `${index + 1} / ${ids.length}` : ''}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
        <div className="w-full rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-900">
          <p className="text-2xl font-bold leading-relaxed text-violet-600 dark:text-violet-400">
            {phrase.en}
          </p>
          <p className="mt-3 text-sm text-slate-500">{phrase.ja}</p>
        </div>

        <PlayButton text={phrase.en} label="🔊 もう一度聞く" className="bg-violet-500" />
        <p className="text-center text-sm text-slate-400">
          お手本に続けて、声に出して言ってみよう
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={() => go(index - 1)}
          disabled={!hasPrev}
          className="rounded-2xl bg-slate-400 py-4 font-medium text-white active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          ← 戻る
        </button>
        <button
          onClick={() => go(index + 1)}
          disabled={!hasNext}
          className="rounded-2xl bg-violet-500 py-4 font-medium text-white active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          進む →
        </button>
      </div>
    </div>
  )
}
