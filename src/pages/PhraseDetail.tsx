import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { hasVoiceForLang, loadVoices, speak, stopSpeaking } from '../lib/tts'
import type { Phrase } from '../types'

/** Fisher–Yates shuffle that keeps `firstId` at the front so playback can
 * continue from the phrase the user tapped. */
function shuffleKeepingFirst(ids: string[], firstId: string): string[] {
  const rest = ids.filter((x) => x !== firstId)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return firstId && ids.includes(firstId) ? [firstId, ...rest] : rest
}

interface SpeakFlags {
  phrase: boolean
  example: boolean
  ja: boolean
}

interface Part {
  text: string
  lang: string
}

/** The ordered list of utterances for a card given the on/off toggles:
 * フレーズ(英) → 日本語訳(日) → 例文(英)。空欄・OFFの項目は飛ばす。 */
function buildParts(p: Phrase, flags: SpeakFlags): Part[] {
  const parts: Part[] = []
  if (flags.phrase && p.en) parts.push({ text: p.en, lang: 'en-US' })
  if (flags.ja && p.ja) parts.push({ text: p.ja, lang: 'ja-JP' })
  if (flags.example && p.example) parts.push({ text: p.example, lang: 'en-US' })
  return parts
}

/** Speak the parts back-to-back, bailing out as soon as `isCancelled()` is true. */
function speakParts(
  parts: Part[],
  opts: { voiceURI: string | null; rate: number },
  isCancelled: () => boolean,
  onDone: () => void,
): void {
  let i = 0
  const next = () => {
    if (isCancelled()) return
    if (i >= parts.length) {
      onDone()
      return
    }
    const part = parts[i++]
    speak(part.text, {
      voiceURI: opts.voiceURI,
      rate: opts.rate,
      lang: part.lang,
      onEnd: next,
      onError: next,
    })
  }
  next()
}

/**
 * Single-phrase view opened from フレーズ一覧, doubling as a continuous-playback
 * player. It shows the phrase, its 日本語訳 and 例文, and can read any
 * combination of フレーズ / 例文 / 日本語訳 aloud (toggle chips). From the tapped
 * phrase it auto-advances through the list, looping (リピート) or randomising
 * (シャッフル). Order + cursor are kept locally so auto-advance works without
 * navigating routes per phrase.
 */
export default function PhraseDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)

  const autoPlay = useSettings((x) => x.autoPlay)
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)
  const repeat = useSettings((x) => x.repeat)
  const shuffle = useSettings((x) => x.shuffle)
  const speakPhrase = useSettings((x) => x.speakPhrase)
  const speakExample = useSettings((x) => x.speakExample)
  const speakJa = useSettings((x) => x.speakJa)
  const setRepeat = useSettings((x) => x.setRepeat)
  const setShuffle = useSettings((x) => x.setShuffle)
  const setSpeakPhrase = useSettings((x) => x.setSpeakPhrase)
  const setSpeakExample = useSettings((x) => x.setSpeakExample)
  const setSpeakJa = useSettings((x) => x.setSpeakJa)

  // Natural id order from the browse list (filtered) or the whole deck.
  const baseIds = useMemo(() => {
    const passed = (location.state as { ids?: string[] } | null)?.ids
    return passed && passed.length ? passed : phrases.map((p) => p.id)
  }, [location.state, phrases])

  const [play, setPlay] = useState<{ order: string[]; cursor: number }>(() => {
    const order = shuffle && id ? shuffleKeepingFirst(baseIds, id) : baseIds
    return { order, cursor: Math.max(0, order.indexOf(id ?? '')) }
  })
  const [playing, setPlaying] = useState(false)
  const [jaVoiceAvailable, setJaVoiceAvailable] = useState(true)

  // Read settings inside async callbacks without re-triggering the player effect.
  const repeatRef = useRef(repeat)
  const phraseRef = useRef(speakPhrase)
  const exampleRef = useRef(speakExample)
  const jaRef = useRef(speakJa)
  const voiceRef = useRef(voiceURI)
  const rateRef = useRef(rate)
  repeatRef.current = repeat
  phraseRef.current = speakPhrase
  exampleRef.current = speakExample
  jaRef.current = speakJa
  voiceRef.current = voiceURI
  rateRef.current = rate

  const flagsFromRefs = (): SpeakFlags => ({
    phrase: phraseRef.current,
    example: exampleRef.current,
    ja: jaRef.current,
  })

  const currentId = play.order[play.cursor]
  const phrase = phrases.find((p) => p.id === currentId)

  // Token to cancel an in-flight single-card playback (manual navigation).
  const manualToken = useRef(0)
  const playCardOnce = (pid: string) => {
    const p = phrases.find((x) => x.id === pid)
    if (!p) return
    const token = ++manualToken.current
    speakParts(
      buildParts(p, flagsFromRefs()),
      { voiceURI: voiceRef.current, rate: rateRef.current },
      () => token !== manualToken.current,
      () => {},
    )
  }

  useEffect(() => {
    loadVoices().then(() => setJaVoiceAvailable(hasVoiceForLang('ja')))
  }, [])

  // Re-seed the order once the deck has loaded (phrases arrive async) or when a
  // different phrase id is opened from the list.
  useEffect(() => {
    if (!id || play.order.includes(id)) return
    const order = shuffle ? shuffleKeepingFirst(baseIds, id) : baseIds
    setPlay({ order, cursor: Math.max(0, order.indexOf(id)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIds, id])

  // Auto-play the card once when it first appears (mirrors the previous open
  // behaviour). Continuous playback / manual nav handle later cards themselves.
  const didOpenPlay = useRef(false)
  useEffect(() => {
    if (didOpenPlay.current || !phrase) return
    didOpenPlay.current = true
    if (autoPlay) playCardOnce(phrase.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase])

  // Stop any speech when leaving the page.
  useEffect(() => () => stopSpeaking(), [])

  // Continuous playback: read the current card (per the toggles), then advance.
  useEffect(() => {
    if (!playing) return
    const p = phrases.find((x) => x.id === play.order[play.cursor])
    if (!p) {
      setPlaying(false)
      return
    }
    let cancelled = false
    let gapTimer: ReturnType<typeof setTimeout> | undefined
    const goNext = () => {
      const next = play.cursor + 1
      if (next < play.order.length) setPlay((cur) => ({ ...cur, cursor: next }))
      else if (repeatRef.current) setPlay((cur) => ({ ...cur, cursor: 0 }))
      else setPlaying(false)
    }
    // Pause for 2s after a card finishes before moving to the next one.
    const advance = () => {
      if (cancelled) return
      gapTimer = setTimeout(goNext, 2000)
    }
    speakParts(
      buildParts(p, flagsFromRefs()),
      { voiceURI: voiceRef.current, rate: rateRef.current },
      () => cancelled,
      advance,
    )
    return () => {
      cancelled = true
      if (gapTimer) clearTimeout(gapTimer)
      stopSpeaking()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, play.cursor, play.order])

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

  const togglePlay = () => {
    if (playing) {
      stopSpeaking()
      setPlaying(false)
    } else {
      manualToken.current++ // cancel any single-card playback first
      stopSpeaking()
      setPlaying(true)
    }
  }

  const step = (delta: number) => {
    const next = play.cursor + delta
    if (next < 0 || next >= play.order.length) return
    setPlay((cur) => ({ ...cur, cursor: next }))
    if (!playing) {
      stopSpeaking()
      if (autoPlay) playCardOnce(play.order[next])
    }
  }

  const onToggleShuffle = () => {
    const nextOn = !shuffle
    setShuffle(nextOn)
    const order = nextOn ? shuffleKeepingFirst(baseIds, currentId) : baseIds
    setPlay({ order, cursor: Math.max(0, order.indexOf(currentId)) })
  }

  const hasPrev = play.cursor > 0
  const hasNext = play.cursor < play.order.length - 1

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between text-sm">
        <button onClick={() => navigate('/browse')} className="text-slate-400">
          ← 一覧へ
        </button>
        <span className="font-medium">フレーズ再生</span>
        <span className="text-slate-400">
          {play.cursor + 1} / {play.order.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
        <div className="w-full rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-900">
          <p className="text-2xl font-bold leading-relaxed text-violet-600 dark:text-violet-400">
            {phrase.en}
          </p>
          <p className="mt-3 text-sm text-slate-500">{phrase.ja}</p>
          {phrase.example && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-base leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
              {phrase.example}
            </p>
          )}
        </div>

        <button
          onClick={togglePlay}
          className={`rounded-full px-8 py-3 text-lg font-semibold text-white active:scale-95 ${
            playing ? 'bg-rose-500' : 'bg-violet-500'
          }`}
        >
          {playing ? '⏸ 停止' : '▶ 自動再生'}
        </button>

        <div className="flex flex-wrap justify-center gap-2">
          <ToggleChip active={repeat} onClick={() => setRepeat(!repeat)}>
            🔁 リピート
          </ToggleChip>
          <ToggleChip active={shuffle} onClick={onToggleShuffle}>
            🔀 シャッフル
          </ToggleChip>
        </div>

        <div className="flex w-full flex-col items-center gap-1.5">
          <p className="text-xs text-slate-400">読み上げる項目</p>
          <div className="flex flex-wrap justify-center gap-2">
            <ToggleChip active={speakPhrase} onClick={() => setSpeakPhrase(!speakPhrase)}>
              🔊 フレーズ
            </ToggleChip>
            <ToggleChip active={speakExample} onClick={() => setSpeakExample(!speakExample)}>
              🔊 例文
            </ToggleChip>
            <ToggleChip
              active={speakJa}
              disabled={!jaVoiceAvailable}
              onClick={() => setSpeakJa(!speakJa)}
            >
              🇯🇵 日本語訳
            </ToggleChip>
          </div>
        </div>
        {!jaVoiceAvailable && (
          <p className="text-center text-xs text-slate-400">
            日本語の読み上げ音声が端末にないため、日本語訳は再生できません
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={() => step(-1)}
          disabled={!hasPrev}
          className="rounded-2xl bg-slate-400 py-4 font-medium text-white active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          ← 戻る
        </button>
        <button
          onClick={() => step(1)}
          disabled={!hasNext}
          className="rounded-2xl bg-violet-500 py-4 font-medium text-white active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          進む →
        </button>
      </div>
    </div>
  )
}

function ToggleChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 disabled:opacity-40 ${
        active
          ? 'bg-violet-500 text-white'
          : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}
