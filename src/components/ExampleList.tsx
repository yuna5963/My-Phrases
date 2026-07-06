import { useRef, useState } from 'react'
import { speak, stopSpeaking } from '../lib/tts'
import { useSettings } from '../store/useSettings'
import { useSpokenWordTracker } from '../hooks/useSpokenWordTracker'
import type { Example } from '../types'
import KanaLine from './KanaLine'
import SpokenText from './SpokenText'

/**
 * 例文一覧（英＋カナ＋和、個別再生🔊つき）。音声はボタンを押した例文だけ再生し、
 * その行の英文を読み上げに合わせて Word Spark ハイライトする（他の例文は表示のまま）。
 * ModelCard（チャンク詳細・今日の練習）で共有。
 */
export default function ExampleList({
  examples,
  className = 'mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800',
}: {
  examples: Example[]
  className?: string
}) {
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)

  // Word Spark ハイライト: 再生中の例文番号と単語位置。
  const tracker = useSpokenWordTracker()
  const [active, setActive] = useState(-1)
  // 再生連打時、キャンセルされた旧発話の onEnd/onError が
  // 新しいハイライトを消さないよう、世代トークンで判別する。
  const playSeq = useRef(0)

  const play = (i: number, en: string) => {
    const id = ++playSeq.current
    stopSpeaking()
    setActive(i)
    tracker.start(en, rate)
    const done = () => {
      if (playSeq.current !== id) return
      tracker.stop()
      setActive(-1)
    }
    speak(en, {
      voiceURI,
      rate,
      onBoundary: tracker.onBoundary,
      onStart: tracker.onStart,
      onEnd: () => {
        tracker.onEnd()
        done()
      },
      onError: done,
    })
  }

  if (!examples.length) return null
  return (
    <ol className={className}>
      {examples.map((ex, i) => (
        <li key={i} className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base leading-relaxed text-slate-700 dark:text-slate-200">
              <SpokenText text={ex.en} current={i === active ? tracker.current : -1} />
            </p>
            <KanaLine kana={ex.kana} />
            {ex.ja && <p className="mt-0.5 text-xs text-slate-400">{ex.ja}</p>}
          </div>
          <button
            onClick={() => play(i, ex.en)}
            className="shrink-0 text-sky-500 active:scale-95"
          >
            🔊
          </button>
        </li>
      ))}
    </ol>
  )
}
