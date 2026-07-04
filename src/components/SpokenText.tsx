import { useMemo } from 'react'
import { wordSpans } from '../lib/spokenWords'

/**
 * カラオケ式ハイライト表示: 読み上げ中の単語（current 番目）をマーカー風に強調する。
 * 文字サイズは変えず（行の高さ・折り返しが揺れないよう）背景色＋文字色で示す。
 * current が -1 のときは通常のテキスト表示。
 */
export default function SpokenText({
  text,
  current,
  className,
}: {
  text: string
  /** 読み上げ中の単語番号（0始まり）。-1 で強調なし。 */
  current: number
  className?: string
}) {
  const spans = useMemo(() => wordSpans(text), [text])

  if (current < 0 || spans.length === 0) {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {text.slice(0, spans[0].start)}
      {spans.map((s, i) => (
        <span key={i}>
          <span
            className={`rounded transition-colors duration-150 ${
              i === current
                ? 'bg-amber-300/70 text-amber-950 dark:bg-amber-400/40 dark:text-amber-100'
                : ''
            }`}
          >
            {text.slice(s.start, s.end)}
          </span>
          {text.slice(s.end, spans[i + 1]?.start ?? text.length)}
        </span>
      ))}
    </span>
  )
}
