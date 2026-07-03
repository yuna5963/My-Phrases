import { speak } from '../lib/tts'
import { useSettings } from '../store/useSettings'
import type { Example } from '../types'
import KanaLine from './KanaLine'

/**
 * 例文一覧（英＋カナ＋和、個別再生🔊つき）。音声はボタンを押した例文だけ再生する。
 * ModelCard / ComposeCard で共有。
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
  if (!examples.length) return null
  return (
    <ol className={className}>
      {examples.map((ex, i) => (
        <li key={i} className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base leading-relaxed text-slate-700 dark:text-slate-200">
              {ex.en}
            </p>
            <KanaLine kana={ex.kana} />
            {ex.ja && <p className="mt-0.5 text-xs text-slate-400">{ex.ja}</p>}
          </div>
          <button
            onClick={() => speak(ex.en, { voiceURI, rate })}
            className="shrink-0 text-sky-500 active:scale-95"
          >
            🔊
          </button>
        </li>
      ))}
    </ol>
  )
}
