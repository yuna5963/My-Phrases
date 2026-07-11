// CSV エクスポート。インポート（import.ts）が読める列名・列順で出力し、
// エクスポート → 再インポートの往復でデータが失われないようにする。
import type { Phrase } from '../types'
import type { StockItem } from '../store/useStock'
import { todayStr } from './srs'

/** エクスポートする例文の枠数。readExamples は Example{n} 列が途切れると
 *  走査を止めるため、歯抜けを作らず常に全枠を出力する。 */
export const MAX_EXAMPLES = 5

/** RFC-4180: 引用符・カンマ・改行を含むフィールドのみダブルクォートで囲む。 */
export function csvEscape(field: string): string {
  if (/[",\n\r]/.test(field)) return '"' + field.replace(/"/g, '""') + '"'
  return field
}

// BOM は Excel の文字化け対策。インポート側は clean() の trim が BOM を落とすので往復可。
const BOM = '\uFEFF'
const CRLF = '\r\n'

function toCsvText(rows: string[][]): string {
  return BOM + rows.map((r) => r.map(csvEscape).join(',')).join(CRLF) + CRLF
}

export const DECK_CSV_HEADER: string[] = [
  'ID',
  'Type',
  'Category',
  'Level',
  'Priority',
  'Chunk',
  '日本語',
  '音節',
  ...Array.from({ length: MAX_EXAMPLES }, (_, i) => [
    `Example${i + 1}`,
    `日本語訳${i + 1}`,
    `音節${i + 1}`,
  ]).flat(),
  'Note',
  'ステータス',
  'カナ要確認',
]

/** デッキ全件のバックアップCSV。ステータス・カナ要確認も含め、再インポートで完全復元できる。 */
export function phrasesToCsv(phrases: Phrase[]): string {
  const rows: string[][] = [DECK_CSV_HEADER]
  for (const p of phrases) {
    const row = [p.id, p.type, p.category, p.level, p.priority, p.en, p.ja, p.kana ?? '']
    for (let n = 0; n < MAX_EXAMPLES; n++) {
      const ex = p.examples[n]
      row.push(ex?.en ?? '', ex?.ja ?? '', ex?.kana ?? '')
    }
    row.push(p.note, p.status, (p.kanaWarnings ?? []).join(';'))
    rows.push(row)
  }
  return toCsvText(rows)
}

/** 表現ストックのCSV。列名は COL_EN / COL_JA の別名に合わせ、このCSV自体も再インポートできる。 */
export function stockToCsv(items: StockItem[]): string {
  return toCsvText([
    ['Chunk', '日本語', '追加日'],
    ...items.map((i) => [i.en, i.ja, i.addedAt]),
  ])
}

export function csvFilename(kind: 'deck' | 'stock'): string {
  return `my-phrases-${kind}-${todayStr().replace(/-/g, '')}.csv`
}
