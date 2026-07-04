/**
 * カラオケ式読み上げハイライトの下回り（純関数）。
 * 英文を単語スパンに分割し、boundary イベントの文字位置→単語番号の変換と、
 * boundary が発火しないエンジン向けの推定タイミングを提供する。
 */

export interface WordSpan {
  start: number
  end: number
}

/** 空白区切りで単語スパン（元文字列内のオフセット）を列挙する。句読点は単語に含める。 */
export function wordSpans(text: string): WordSpan[] {
  const spans: WordSpan[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length })
  }
  return spans
}

/**
 * boundary イベントの charIndex が指す単語番号を返す。
 * charIndex は通常その単語の先頭を指すが、エンジン差を考慮して
 * 「start <= charIndex を満たす最後のスパン」を採用する。該当なしは 0。
 */
export function wordAtChar(spans: WordSpan[], charIndex: number): number {
  if (!spans.length) return -1
  let idx = 0
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].start <= charIndex) idx = i
    else break
  }
  return idx
}

// 推定用の読み上げ速度: 英語TTSの実測はおよそ 15文字/秒（rate=1）。
const CHARS_PER_SECOND = 15
const MIN_TOTAL_MS = 500

/**
 * 各単語の読み上げ開始時刻（ms、先頭からの累積）を推定する。
 * boundary イベントが来ないエンジンでのフォールバック用。
 * 単語の重みは「文字数+1」（短い単語も一瞬では飛ばさない）。
 */
export function estimateWordTimings(text: string, rate: number): number[] {
  const spans = wordSpans(text)
  if (!spans.length) return []
  const effectiveRate = rate > 0 ? rate : 1
  const totalMs = Math.max(MIN_TOTAL_MS, (text.length / (CHARS_PER_SECOND * effectiveRate)) * 1000)
  const weights = spans.map((s) => s.end - s.start + 1)
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const timings: number[] = []
  let acc = 0
  for (const w of weights) {
    timings.push((acc / totalWeight) * totalMs)
    acc += w
  }
  return timings
}
