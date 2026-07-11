// AI（Gemma 系）の応答から JSON を取り出す共通処理。
// Gemma は指示しても <thought> やコードフェンス・前置きの散文を混ぜることがあるため、
// それらを剥がして最初の JSON 値だけを厳格にパースする。
import { stripThoughts } from './chatApi'

/** ```json … ``` / ``` … ``` のフェンス記号を取り除く（中身は残す）。 */
export function stripCodeFences(text: string): string {
  return text.replace(/```[a-zA-Z]*\r?\n?/g, '').replace(/```/g, '')
}

/** start 位置の [ / { に対応する閉じ括弧までを、文字列リテラルを考慮して切り出す。 */
function sliceBalanced(s: string, start: number): string | null {
  const open = s[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/**
 * 応答テキストから最初の JSON 配列/オブジェクトを取り出してパースする。
 * 見つからない・壊れている場合は throw（呼び出し側がリトライを判断する）。
 */
export function extractJson(text: string): unknown {
  const cleaned = stripCodeFences(stripThoughts(text))
  const start = cleaned.search(/[[{]/)
  if (start === -1) throw new Error('JSON_PARSE_FAILED')
  const slice = sliceBalanced(cleaned, start)
  if (!slice) throw new Error('JSON_PARSE_FAILED')
  try {
    return JSON.parse(slice)
  } catch {
    throw new Error('JSON_PARSE_FAILED')
  }
}
