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
      <div className="w-full rounded-2xl bg-white p-5 text-center shadow-sm dark:bg-slate-900">
        <p className="text-xl font-semibold leading-relaxed">
          {item.before}
          <span className="font-bold text-rose-500 dark:text-rose-400">
            {revealed ? item.chunk : '____'}
          </span>
          {item.after}
        </p>
        {revealed && <KanaLine kana={item.kana} className="text-center" />}
        {item.ja && <p className="mt-2 text-sm text-slate-500">{item.ja}</p>}
        <p className="mt-1 text-xs text-slate-400">ヒント: {chunkJa}</p>
        {revealed && (
          <div className="mt-4 flex justify-center">
            <PlayButton text={item.before + item.chunk + item.after} />
          </div>
        )}
      </div>

      {!revealed && (
        <button
          onClick={onReveal}
          className="rounded-2xl border-2 border-dashed border-slate-300 px-8 py-4 text-slate-500 dark:border-slate-700"
        >
          答えを見る 👀
        </button>
      )}
    </div>
  )
}
