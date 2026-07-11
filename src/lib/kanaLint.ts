// シラブル音節カナ（docs/シラブル音節記法.md）のルールベース検証。
// AI（Gemma）が生成したカナの下書きを機械検査し、怪しいものに「要確認」フラグを
// 立てるための最小リンター。表記の正しさ（発音として自然か）までは判定しない。
import type { Phrase } from '../types'

export type KanaIssueLevel = 'error' | 'warn'

export interface KanaIssue {
  code: string
  level: KanaIssueLevel
  message: string
}

// カタカナ（ァ-ヶ）・長音・音節区切り・半角スペース・リンキング・丸かっこ・強勢のみ許容。
const KANA_CHAR = /[ァ-ヶー]/
const ALLOWED_CHAR = /[ァ-ヶー・ ‿()*]/

function issue(code: string, level: KanaIssueLevel, message: string): KanaIssue {
  return { code, level, message }
}

/** 記法違反の一覧を返す（空配列 = 合格）。error は書式違反、warn は要注意の兆候。 */
export function lintKana(kana: string, en: string): KanaIssue[] {
  const issues: KanaIssue[] = []
  if (!kana.trim()) return [issue('empty', 'error', 'カナが空です')]

  const badChars = [...new Set([...kana].filter((c) => !ALLOWED_CHAR.test(c)))]
  if (badChars.length) {
    issues.push(
      issue('chars', 'error', `記法にない文字があります: ${badChars.join(' ')}`),
    )
  }

  // 強勢 *…* はペアで、囲みの中にカナが必要。
  const starCount = (kana.match(/\*/g) ?? []).length
  if (starCount % 2 !== 0) {
    issues.push(issue('star-pair', 'error', '強勢 * が対応していません（奇数個）'))
  } else {
    const segs = kana.split('*')
    for (let i = 1; i < segs.length; i += 2) {
      if (!KANA_CHAR.test(segs[i])) {
        issues.push(issue('star-empty', 'error', '強勢 *…* の中にカナがありません'))
        break
      }
    }
  }

  // 以降の構造チェックは表示時に消える * を除いて行う。
  const t = kana.replace(/\*/g, '')

  // 丸かっこ: 開閉対応・入れ子なし・空なし・中身はカナのみ。
  let depth = 0
  let content = ''
  const parenCodes = new Set<string>()
  for (const c of t) {
    if (c === '(') {
      if (depth > 0) parenCodes.add('paren-nest')
      depth++
      content = ''
    } else if (c === ')') {
      if (depth === 0) parenCodes.add('paren-balance')
      else {
        depth--
        if (!content) parenCodes.add('paren-empty')
      }
    } else if (depth > 0) {
      content += c
      if (!KANA_CHAR.test(c)) parenCodes.add('paren-content')
    }
  }
  if (depth > 0) parenCodes.add('paren-balance')
  const parenMessages: Record<string, string> = {
    'paren-balance': '丸かっこ ( ) が対応していません',
    'paren-nest': '丸かっこの入れ子は使えません',
    'paren-empty': '空の丸かっこ ( ) があります',
    'paren-content': '丸かっこの中はカナのみにしてください',
  }
  for (const code of parenCodes) issues.push(issue(code, 'error', parenMessages[code]))

  // 区切り記号の位置: 行頭/行末・スペース隣接・連続は不正。
  const trimmed = t.trim()
  if (/^[・‿]|[・‿]$/.test(trimmed)) {
    issues.push(issue('sep-edge', 'error', '行頭・行末に区切り記号（・/‿）があります'))
  }
  if (/[・‿]{2,}/.test(trimmed)) {
    issues.push(issue('sep-run', 'error', '区切り記号（・/‿）が連続しています'))
  }
  if (/ [・‿]|[・‿] /.test(trimmed)) {
    issues.push(issue('sep-space', 'error', 'スペースの隣に区切り記号（・/‿）があります'))
  }

  // ソフト検査: 単語数の整合。リンキング ‿ は2語を1つに結合するので加算して戻す。
  const enWords = en
    .trim()
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w)).length
  const kanaUnits = trimmed.split(/\s+/).filter(Boolean).length
  const kanaWords = kanaUnits + (trimmed.match(/‿/g) ?? []).length
  if (enWords > 0 && kanaUnits > 0) {
    if (kanaWords > enWords) {
      issues.push(
        issue('words-over', 'warn', `カナの語数（${kanaWords}）が英語（${enWords}語）より多いです`),
      )
    } else if (kanaWords < enWords * 0.5) {
      issues.push(
        issue('words-under', 'warn', `カナの語数（${kanaWords}）が英語（${enWords}語）に比べて少なすぎます`),
      )
    }
  }

  // ソフト検査: 3語以上の文に強勢が1つも無い。
  if (enWords >= 3 && starCount === 0) {
    issues.push(issue('no-stress', 'warn', '強勢（*…*）がありません'))
  }

  return issues
}

/** フレーズ全体を検査し、要確認フィールドのラベル（'音節' / '音節1'…）を返す。
 *  空のカナ欄は「未入力」であって違反ではないため対象外。 */
export function lintPhraseKana(p: Phrase): string[] {
  const labels: string[] = []
  if (p.kana && lintKana(p.kana, p.en).length) labels.push('音節')
  p.examples.forEach((ex, i) => {
    if (ex.kana && lintKana(ex.kana, ex.en).length) labels.push(`音節${i + 1}`)
  })
  return labels
}
