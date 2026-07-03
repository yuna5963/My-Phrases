import type { Phrase } from '../types'

/** 穴埋め1問分。masked表示・答え合わせ表示の両方を組み立てられる形で持つ。 */
export interface ClozeItem {
  /** 元の例文の番号（0始まり）。 */
  exampleIndex: number
  /** チャンクより前の英文。 */
  before: string
  /** 例文中に実際に現れたチャンクの表記（大文字小文字は例文側を保持）。 */
  chunk: string
  /** チャンクより後の英文。 */
  after: string
  /** 例文の日本語訳。 */
  ja: string
  /** 例文のシラブル音節カナ（任意）。 */
  kana?: string
}

/** 大文字小文字とアポストロフィの違いを無視して比較するための正規化。 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'")
}

/**
 * 例文中でチャンクが現れる位置を返す（大文字小文字無視・単語境界チェック付き）。
 * `in` が `going` に一致するような単語途中のヒットは除外する。
 * 活用形（going→go 等）は探さない: 見つからない例文は穴埋め対象外とする。
 */
export function findChunkSpan(
  exampleEn: string,
  chunkEn: string,
): { start: number; end: number } | null {
  const hay = normalize(exampleEn)
  const needle = normalize(chunkEn.trim())
  if (!needle) return null
  const isWordChar = (ch: string | undefined) => !!ch && /[a-z0-9]/.test(ch)
  let from = 0
  while (from <= hay.length - needle.length) {
    const start = hay.indexOf(needle, from)
    if (start === -1) return null
    const end = start + needle.length
    if (!isWordChar(hay[start - 1]) && !isWordChar(hay[end])) return { start, end }
    from = start + 1
  }
  return null
}

/** チャンク部分を固定の伏せ字1つに置き換えた英文を返す。 */
export function maskChunk(
  exampleEn: string,
  span: { start: number; end: number },
): string {
  return exampleEn.slice(0, span.start) + '____' + exampleEn.slice(span.end)
}

/** チャンクが見つかる例文だけを穴埋め問題に変換する。 */
export function clozeItems(p: Phrase): ClozeItem[] {
  const items: ClozeItem[] = []
  p.examples.forEach((ex, i) => {
    if (!ex.en) return
    const span = findChunkSpan(ex.en, p.en)
    if (!span) return
    items.push({
      exampleIndex: i,
      before: ex.en.slice(0, span.start),
      chunk: ex.en.slice(span.start, span.end),
      after: ex.en.slice(span.end),
      ja: ex.ja,
      kana: ex.kana,
    })
  })
  return items
}

/** 穴埋めに使える例文が1つでもあるか（出題プールの絞り込みに使う）。 */
export function hasCloze(p: Phrase): boolean {
  return p.examples.some((ex) => !!ex.en && findChunkSpan(ex.en, p.en) !== null)
}
