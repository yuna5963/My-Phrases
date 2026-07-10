// まとめ本文から「➕ 追加候補チャンク」行を抽出する。
// コーチには「➕ 英語表現 — 日本語訳」の行形式で出させ（coachPrompt.ts）、
// デッキに既にあるものはクライアント側で除外する。
import type { Phrase } from '../types'
import { normalize } from './chunkMatch'

export interface Suggestion {
  en: string
  ja: string
}

const SUGGESTION_LINE = /^[-*\s]*➕\s*(.+)$/

/** "英語 — 日本語" を分割する。em/en ダッシュ優先、無ければ ' - ' を使う。 */
function splitEnJa(line: string): Suggestion {
  const dash = line.match(/\s*[—–]\s*/)
  if (dash && dash.index !== undefined) {
    return {
      en: line.slice(0, dash.index).trim(),
      ja: line.slice(dash.index + dash[0].length).trim(),
    }
  }
  const sep = line.indexOf(' - ')
  if (sep !== -1) {
    return { en: line.slice(0, sep).trim(), ja: line.slice(sep + 3).trim() }
  }
  return { en: line.trim(), ja: '' }
}

/** 前後の引用符・括弧を落とす。 */
function unquote(s: string): string {
  return s.replace(/^["'“”「『]+|["'“”」』]+$/g, '').trim()
}

/**
 * まとめ本文から ➕ 行を抜き出し、本文（➕ 行を除いたもの）と候補一覧を返す。
 */
export function extractSuggestions(text: string): {
  body: string
  suggestions: Suggestion[]
} {
  const suggestions: Suggestion[] = []
  const bodyLines: string[] = []
  for (const line of text.split('\n')) {
    const m = line.match(SUGGESTION_LINE)
    if (m) {
      const { en, ja } = splitEnJa(m[1])
      const cleanEn = unquote(en)
      if (cleanEn) suggestions.push({ en: cleanEn, ja: unquote(ja) })
    } else {
      bodyLines.push(line)
    }
  }
  return { body: bodyLines.join('\n').trim(), suggestions }
}

/** デッキに同じ表現が既にある候補を除外する（正規化して同一判定）。 */
export function filterNewSuggestions(
  suggestions: Suggestion[],
  phrases: Phrase[],
): Suggestion[] {
  const known = new Set(phrases.map((p) => normalize(p.en)))
  const seen = new Set<string>()
  return suggestions.filter((s) => {
    const key = normalize(s.en)
    if (!key || known.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
