// チャット練習でユーザーの発話に対象チャンクが使われたかを判定する。
// LLM に判定させず、正規化＋単語境界マッチで機械的に検出する（誤検出を抑えて安定させる）。
import type { Phrase } from '../types'

// チャンク見出しの穴（自由スロット）を表す記号。この位置は任意の語を許す。
const PLACEHOLDER = /\.{3}|…|_{2,}|~|〜/g

/**
 * 比較用にテキストを正規化する。
 * 小文字化 → 短縮形展開 → 記号除去 → 空白圧縮。
 * チャンク側・発話側の両方に同じ変換を掛けるので、展開形が多少不自然でも一致判定には影響しない。
 */
export function normalize(text: string): string {
  let t = text.toLowerCase()
  t = t
    .replace(/won't/g, 'will not')
    .replace(/n't\b/g, ' not')
    .replace(/'m\b/g, ' am')
    .replace(/'re\b/g, ' are')
    .replace(/'ve\b/g, ' have')
    .replace(/'ll\b/g, ' will')
  // 残るアポストロフィ（it's / friend's / I'd）は除去して1語に潰す。
  t = t.replace(/['’]/g, '')
  t = t.replace(/[^a-z0-9\s]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/** 正規化済みテキスト内で、正規化済み語列 segment が単語境界で from 以降に現れる位置を返す。 */
function indexOfWords(text: string, segment: string, from: number): number {
  const padded = ` ${text} `
  const needle = ` ${segment} `
  const idx = padded.indexOf(needle, from)
  return idx === -1 ? -1 : idx
}

/**
 * チャンク見出し（例: "It takes ... to ~"）が userText 内で使われたか。
 * 穴記号で区切った固定語のまとまりが、順序を保って現れれば使用とみなす。
 */
export function matchesChunk(chunkEn: string, userText: string): boolean {
  const text = normalize(userText)
  if (!text) return false
  const segments = chunkEn
    .split(PLACEHOLDER)
    .map((s) => normalize(s))
    .filter((s) => s.length > 0)
  if (segments.length === 0) return false
  let pos = 0
  for (const seg of segments) {
    const idx = indexOfWords(text, seg, pos)
    if (idx === -1) return false
    pos = idx + seg.length + 1 // 次のまとまりはこの後ろから探す
  }
  return true
}

/** 発話 text に使われている対象チャンクの id を返す。 */
export function findUsedChunks(targets: Phrase[], text: string): string[] {
  return targets.filter((p) => matchesChunk(p.en, text)).map((p) => p.id)
}
