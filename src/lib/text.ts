/**
 * Count the sentences in an English phrase by splitting on terminal
 * punctuation (. ! ?). Trailing/empty segments are ignored, so text without
 * any terminator still counts as one sentence.
 */
export function sentenceCount(en: string): number {
  const parts = (en ?? '')
    .trim()
    .split(/[.!?]+(?:\s+|$)/)
    .filter((s) => s.trim().length > 0)
  return Math.max(1, parts.length)
}

/** True when the phrase is two or more sentences (→ modeling practice). */
export function isMultiSentence(en: string): boolean {
  return sentenceCount(en) >= 2
}
