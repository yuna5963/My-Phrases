import type { SeqPart } from '../lib/tts'
import type { Phrase } from '../types'
import MetaChips from './MetaChips'
import KanaLine from './KanaLine'
import ExampleList from './ExampleList'

/** お手本の読み上げ列: チャンク → 例文1 → 例文2 …（英語）。 */
export function modelParts(c: Phrase): SeqPart[] {
  const parts: SeqPart[] = []
  if (c.en) parts.push({ text: c.en, lang: 'en-US' })
  for (const ex of c.examples) if (ex.en) parts.push({ text: ex.en, lang: 'en-US' })
  return parts
}

/**
 * モデリングカード: チャンク（英/カナ/日/メタ情報）と例文一覧（個別再生つき）を
 * 最初からすべて表示する。発音練習・今日の練習・チャンク詳細で共有。
 */
export default function ModelCard({
  phrase,
  accentText,
}: {
  phrase: Phrase
  /** チャンク英語の文字色（画面テーマに合わせる）。 */
  accentText: string
}) {
  return (
    <div className="tile w-full p-6">
      <div className="text-center">
        <p className={`display text-2xl leading-relaxed ${accentText}`}>{phrase.en}</p>
        <KanaLine kana={phrase.kana} className="text-center" />
        <p className="t-muted mt-2 text-sm">{phrase.ja}</p>
        <MetaChips phrase={phrase} />
      </div>
      <ExampleList examples={phrase.examples} />
    </div>
  )
}
