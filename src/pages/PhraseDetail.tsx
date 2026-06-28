import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { hasVoiceForLang, loadVoices, speakSequence, stopSpeaking } from '../lib/tts'
import type { SeqPart } from '../lib/tts'
import { useWakeLock } from '../lib/wakeLock'
import { isLongReading } from '../lib/longReading'
import MetaChips from '../components/MetaChips'
import ReproCard from '../components/ReproCard'
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

// 間（ま）の長さ。1項目内（和訳↔英文）の間、次の項目との間。
const GAP_EN_JA = 1500
const GAP_NEXT = 2000

/** 1項目（チャンク or 例文）の英文と和訳。 */
interface Item {
  en: string
  ja: string
}

/** トグルに従って読み上げ・再現の対象となる項目列を作る（チャンク→例文）。 */
function buildItems(p: Phrase, opts: { phrase: boolean; example: boolean }): Item[] {
  const items: Item[] = []
  if (opts.phrase && p.en) items.push({ en: p.en, ja: p.ja })
  if (opts.example) for (const ex of p.examples) if (ex.en) items.push({ en: ex.en, ja: ex.ja })
  return items
}

/** 連続/単発再生の読み上げ列。日本語訳ONなら「和訳→英文」の順、OFFなら英文のみ。
 * 間は1項目内（和訳↔英文）が1.5s、次の項目へが2s。最後は間なし。 */
function buildParts(p: Phrase, flags: SpeakFlags): SeqPart[] {
  type Raw = { text: string; lang: string; item: number }
  const raw: Raw[] = []
  buildItems(p, { phrase: flags.phrase, example: flags.example }).forEach((it, idx) => {
    if (flags.ja && it.ja) raw.push({ text: it.ja, lang: 'ja-JP', item: idx })
    if (it.en) raw.push({ text: it.en, lang: 'en-US', item: idx })
  })
  return raw.map((r, i) => {
    const next = raw[i + 1]
    const gapAfter = !next ? 0 : next.item === r.item ? GAP_EN_JA : GAP_NEXT
    return { text: r.text, lang: r.lang, gapAfter }
  })
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

  // Natural id order from the list that opened this view (filtered) or the
  // whole deck. `backTo` remembers which list to return to.
  const baseIds = useMemo(() => {
    const passed = (location.state as { ids?: string[] } | null)?.ids
    if (passed && passed.length) return passed
    // 一覧から渡されない（直接URL等）場合のフォールバック。長文音読は除外する。
    return phrases.filter((p) => !isLongReading(p)).map((p) => p.id)
  }, [location.state, phrases])
  const backTo = (location.state as { backTo?: string } | null)?.backTo ?? '/browse'

  const [play, setPlay] = useState<{ order: string[]; cursor: number }>(() => {
    const order = shuffle && id ? shuffleKeepingFirst(baseIds, id) : baseIds
    return { order, cursor: Math.max(0, order.indexOf(id ?? '')) }
  })
  const [playing, setPlaying] = useState(false)
  const [jaVoiceAvailable, setJaVoiceAvailable] = useState(true)
  // 「画面を暗くして再生」モード：全画面を黒く覆い、誤タッチを無効化する。
  // バックライト自体は消せない（Web に明るさ API が無い）ので“黒く塗る”だけ。
  const [dark, setDark] = useState(false)

  // 連続再生中は画面スリープを抑止（消灯で再生が止まらないように）。
  // 暗転モード中も同様に点けたままにして Web Speech を止めない。
  useWakeLock(playing || dark)

  // 再生が止まったら暗転も解除（無音の黒画面が残らないように）。
  useEffect(() => {
    if (!playing && dark) setDark(false)
  }, [playing, dark])

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

  // 再現練習の対象項目（チャンク→例文）。トグルに従う。
  const items = useMemo(
    () => (phrase ? buildItems(phrase, { phrase: speakPhrase, example: speakExample }) : []),
    [phrase, speakPhrase, speakExample],
  )
  // 通常時 × 日本語訳ON × 項目あり のときだけ「タッチ送りの再現練習」を行う。
  const reproActive = !playing && speakJa && items.length > 0

  // Token to cancel an in-flight single-card playback (manual navigation).
  const manualToken = useRef(0)
  const playCardOnce = (pid: string) => {
    const p = phrases.find((x) => x.id === pid)
    if (!p) return
    const token = ++manualToken.current
    speakSequence(buildParts(p, flagsFromRefs()), {
      voiceURI: voiceRef.current,
      rate: rateRef.current,
      isCancelled: () => token !== manualToken.current,
    })
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
  // 日本語訳ONの再現練習中は専用ドライバが音声を出すので、ここでは鳴らさない。
  const didOpenPlay = useRef(false)
  useEffect(() => {
    if (didOpenPlay.current || !phrase) return
    didOpenPlay.current = true
    if (autoPlay && !jaRef.current) playCardOnce(phrase.id)
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
    speakSequence(buildParts(p, flagsFromRefs()), {
      voiceURI: voiceRef.current,
      rate: rateRef.current,
      isCancelled: () => cancelled,
      onDone: advance,
    })
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
        <button onClick={() => navigate(backTo)} className="mt-4 text-sky-500">
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

  // 再生を始めつつ画面を暗転。停止中から押されたら再生も開始する。
  const startDark = () => {
    if (!playing) {
      manualToken.current++
      stopSpeaking()
      setPlaying(true)
    }
    setDark(true)
  }

  const step = (delta: number) => {
    const next = play.cursor + delta
    if (next < 0 || next >= play.order.length) return
    setPlay((cur) => ({ ...cur, cursor: next }))
    if (!playing) {
      stopSpeaking()
      // 日本語訳ONの再現練習中は専用ドライバ（カード切替で先頭から）が鳴らす。
      if (autoPlay && !speakJa) playCardOnce(play.order[next])
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
        <span className="font-medium">フレーズ再生</span>
        <span className="text-slate-400">
          {play.cursor + 1} / {play.order.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
        {reproActive ? (
          <ReproCard items={items} meta={<MetaChips phrase={phrase} className="mt-2" />} />
        ) : (
          <div className="w-full rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
            <div className="text-center">
              <p className="text-2xl font-bold leading-relaxed text-violet-600 dark:text-violet-400">
                {phrase.en}
              </p>
              <p className="mt-2 text-sm text-slate-500">{phrase.ja}</p>
              <MetaChips phrase={phrase} />
            </div>
            {phrase.examples.length > 0 && (
              <ol className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                {phrase.examples.map((ex, i) => (
                  <li key={i} className="text-left">
                    <p className="text-base leading-relaxed text-slate-700 dark:text-slate-200">
                      {ex.en}
                    </p>
                    {ex.ja && (
                      <p className="mt-0.5 text-xs text-slate-400">{ex.ja}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className={`rounded-full px-8 py-3 text-lg font-semibold text-white active:scale-95 ${
              playing ? 'bg-rose-500' : 'bg-violet-500'
            }`}
          >
            {playing ? '⏸ 停止' : '▶ 自動再生'}
          </button>
          <button
            onClick={startDark}
            className="rounded-full bg-slate-700 px-5 py-3 text-base font-semibold text-white active:scale-95"
          >
            🌙 暗くして再生
          </button>
        </div>

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
              🔊 チャンク
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

      {/* 片手で押せるよう、一覧へ戻る導線は画面下部に置く。 */}
      <button
        onClick={() => navigate(backTo)}
        className="mt-2 w-full py-2 text-center text-sm text-slate-400 active:scale-95"
      >
        ← 一覧へ
      </button>

      {dark && <DarkOverlay onExit={() => setDark(false)} />}
    </div>
  )
}

/**
 * 全画面を黒く覆い、再生を続けたまま誤タッチを無効化する“おやすみ”オーバーレイ。
 * 1本指のタッチは握り潰し（ポケット誤操作防止）、2本指同時タッチで解除する。
 * ※ バックライト自体は Web から消せないため、見た目を黒くするのみ。
 *   有機ELなら実質消灯に近く、液晶では手動で明るさを下げると効果的。
 */
function DarkOverlay({ onExit }: { onExit: () => void }) {
  const [showHint, setShowHint] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      onTouchStart={(e) => {
        // 2本指同時タッチでのみ解除。1本指は無効化して誤操作を防ぐ。
        if (e.touches.length >= 2) {
          e.preventDefault()
          onExit()
        }
      }}
      onClick={(e) => e.preventDefault()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{ touchAction: 'none' }}
    >
      <p
        className={`select-none text-xs text-slate-600 transition-opacity duration-1000 ${
          showHint ? 'opacity-100' : 'opacity-0'
        }`}
      >
        2本指でタッチすると解除
      </p>
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
