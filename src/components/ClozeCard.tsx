import type { ClozeItem } from '../lib/cloze'
import PlayButton from './PlayButton'
import KanaLine from './KanaLine'

/**
 * 文脈穴埋めカード: 例文中のチャンクを伏せ字にして表示し、
 * 文脈と日本語ヒントからチャンクを想起させる。開示で全文＋カナ＋再生を出す。
 */
export default function ClozeCard({
  item,
  chunkJa,
  revealed,
  onReveal,
}: {
  item: ClozeItem
  /** チャンクの日本語訳（ヒントとして小さく出す）。 */
  chunkJa: string
  revealed: boolean
  onReveal: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
      <div className="tile w-full p-5 text-center">
        <p className="text-xl font-semibold leading-relaxed">
          {item.before}
          <span className="font-semibold text-carbon-blue dark:text-carbon-blue-40">
            {revealed ? item.chunk : '____'}
          </span>
          {item.after}
        </p>
        {revealed && <KanaLine kana={item.kana} className="text-center" />}
        {item.ja && <p className="t-muted mt-2 text-sm">{item.ja}</p>}
        <p className="t-subtle mt-1 text-xs">ヒント: {chunkJa}</p>
        {revealed && (
          <div className="mt-4 flex justify-center">
            <PlayButton text={item.before + item.chunk + item.after} />
          </div>
        )}
      </div>

      {!revealed && (
        <button
          onClick={onReveal}
          className="t-muted rounded-none border border-dashed border-carbon-ink-subtle px-8 py-4"
        >
          答えを見る 👀
        </button>
      )}
    </div>
  )
}
