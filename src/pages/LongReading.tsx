import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { speak, stopSpeaking } from '../lib/tts'
import { useWakeLock } from '../lib/wakeLock'
import { startBackgroundSession, stopBackgroundSession } from '../lib/backgroundSession'
import { isNativeApp } from '../lib/platform'
import { isLongReading } from '../lib/longReading'
import { useSpokenWordTracker } from '../hooks/useSpokenWordTracker'
import { usePlayTracking } from '../hooks/usePlayTracking'
import MetaChips from '../components/MetaChips'
import StepNav from '../components/StepNav'
import KanaLine from '../components/KanaLine'
import SpokenText from '../components/SpokenText'

/**
 * 長文音読モード。Type=Long Reading のフレーズだけを対象に、本文（examples[0]）を
 * お手本として読み上げ、ユーザーが続けて音読する。フレーズ再生と同じ「← 戻る / 進む →」
 * でカードを送る。長文は本文・和訳が1つずつ（Example2 以降は空欄）。
 */
export default function LongReading() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)
  const bgPlayback = useSettings((x) => x.bgPlayback)

  const items = useMemo(() => phrases.filter(isLongReading), [phrases])

  const [pos, setPos] = useState(0)
  const [showJa, setShowJa] = useState(false)
  const [playing, setPlaying] = useState(false)

  // 読み上げ中の単語を Word Spark ハイライトする。
  const tracker = useSpokenWordTracker()

  // 長文の読み上げ中は画面スリープを抑止（消灯で再生が止まらないように）。
  useWakeLock(playing)
  // お手本再生の経過時間を学習ログへ（最低ライン=5分の判定材料）。
  usePlayTracking(playing)

  const current = items[pos]
  const passage = current?.examples[0]

  // カード切替・離脱時は読み上げを止め、訳の表示もリセットする。
  useEffect(() => {
    stopSpeaking()
    tracker.stop()
    setPlaying(false)
    setShowJa(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])
  useEffect(
    () => () => {
      stopSpeaking()
      stopBackgroundSession()
    },
    [],
  )
  // 読み上げが止まったらバックグラウンドセッションも止める（onEnd/onError 経由も含む）。
  useEffect(() => {
    if (!playing) stopBackgroundSession()
  }, [playing])

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <Header pos={0} total={0} />
        <div className="pt-20 text-center text-slate-500">
          <p>長文音読のコンテンツがありません。</p>
          <p className="mt-1 text-xs text-slate-400">
            Type が「Long Reading」のフレーズを取り込むと表示されます。
          </p>
          <button
            onClick={() => navigate('/long-reading/new')}
            className="mt-6 w-full rounded-2xl bg-amber-500 py-4 font-medium text-white active:scale-95"
          >
            ＋ AIで長文を作る
          </button>
          <button onClick={() => navigate('/')} className="mt-4 text-sky-500">
            ホームへ戻る
          </button>
        </div>
      </div>
    )
  }

  const stopPlayback = () => {
    stopSpeaking()
    tracker.stop()
    setPlaying(false)
  }

  const togglePlay = () => {
    if (playing) {
      stopPlayback()
      return
    }
    if (!passage?.en) return
    // 画面オフでも読み上げが続くように（ネイティブは常時・Webは実験設定ON時。
    // Webのautoplay制限があるためタップハンドラ内で開始する）。
    if (isNativeApp || bgPlayback) {
      startBackgroundSession({
        title: current!.en,
        artist: '長文音読',
        onExternalPause: stopPlayback,
      })
    }
    setPlaying(true)
    tracker.start(passage.en, rate)
    speak(passage.en, {
      voiceURI,
      rate,
      onBoundary: tracker.onBoundary,
      onStart: tracker.onStart,
      onEnd: () => {
        tracker.onEnd()
        tracker.stop()
        setPlaying(false)
      },
      onError: () => {
        tracker.stop()
        setPlaying(false)
      },
    })
  }

  return (
    <div className="flex h-full flex-col">
      <Header pos={pos + 1} total={items.length} />

      {/* 本文は長いのでこの領域だけスクロール。お手本ボタンは常時見えるよう外に出す。 */}
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <div className="w-full rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="text-center">
            <p className="text-lg font-bold leading-relaxed text-amber-600 dark:text-amber-400">
              {current!.en}
            </p>
            <KanaLine kana={current!.kana} className="text-center" />
            <p className="mt-1 text-sm text-slate-500">{current!.ja}</p>
            <MetaChips phrase={current!} className="mt-2" />
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="text-left text-lg leading-loose text-slate-800 dark:text-slate-100">
              {passage?.en && (
                <SpokenText text={passage.en} current={tracker.current} />
              )}
            </p>
            <KanaLine kana={passage?.kana} className="text-left leading-relaxed" />
            {passage?.ja && (
              <>
                <button
                  onClick={() => setShowJa((v) => !v)}
                  className="mt-4 text-sm text-slate-400"
                >
                  {showJa ? '訳を隠す' : '訳を見る'}
                </button>
                {showJa && (
                  <p className="mt-2 text-left text-sm leading-relaxed text-slate-500">
                    {passage.ja}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 py-3">
        <button
          onClick={togglePlay}
          className={`rounded-full px-6 py-3 font-medium text-white active:scale-95 ${
            playing ? 'bg-rose-500' : 'bg-amber-500'
          }`}
        >
          {playing ? '⏸ 停止' : '🔊 お手本を聞く'}
        </button>
        <p className="text-center text-xs text-slate-400">
          お手本に続けて、声に出して読んでみよう
        </p>
      </div>

      <StepNav
        onPrev={() => setPos((p) => Math.max(0, p - 1))}
        onNext={() => setPos((p) => Math.min(items.length - 1, p + 1))}
        canPrev={pos > 0}
        canNext={pos < items.length - 1}
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

function Header({ pos, total }: { pos: number; total: number }) {
  const navigate = useNavigate()
  return (
    <div className="mb-2 flex items-center justify-between text-sm">
      <span className="font-medium">長文音読</span>
      <span className="flex items-center gap-3">
        <button
          onClick={() => navigate('/long-reading/new')}
          className="font-medium text-amber-500"
        >
          ＋ AIで作る
        </button>
        <span className="text-slate-400">
          {pos} / {total}
        </span>
      </span>
    </div>
  )
}
