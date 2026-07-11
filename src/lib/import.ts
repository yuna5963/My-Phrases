import { unzipSync, strFromU8 } from 'fflate'
import type { Example, Phrase } from '../types'

// 新CSV（My Phrases Enhanced）と旧Notionエクスポートの両方の列名を許容する。
const COL_ID = ['ID', 'Id', 'id']
const COL_EN = ['Chunk', 'フレーズ'] // 見出しの語・型
const COL_JA = ['日本語', '日本語訳'] // チャンクの和訳
const COL_TYPE = ['Type', '品詞', 'タイプ']
const COL_CATEGORY = ['Category', 'カテゴリ', 'カテゴリー']
const COL_LEVEL = ['Level', 'Difficulty', '難易度']
const COL_PRIORITY = ['Priority', '優先度']
const COL_NOTE = ['Note', 'メモ', '備考']
const COL_STATUS = ['ステータス', 'Status']
const COL_KANA = ['音節', 'Chunkカナ', 'Chunk_Kana', 'Syllable', 'カナ'] // チャンクのシラブル音節カナ
const COL_KANA_WARN = ['カナ要確認'] // kanaLint の要確認フィールド（;区切り、エクスポート往復用）
// 旧フォーマットの単一例文列。
const COL_EX_SINGLE = ['使用例（例文）', '例文', '使用例', '例']

/** First index in `header` matching any of `names`, or -1. */
function firstIndexOf(header: string[], names: string[]): number {
  for (const name of names) {
    const i = header.indexOf(name)
    if (i !== -1) return i
  }
  return -1
}

const TEXT_EXT = /\.(md|markdown|txt|csv)$/i

/** Deterministic id from the English text so re-imports keep the same key
 *  (and therefore preserve SRS progress) when no explicit id is available. */
export function stableId(en: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < en.length; i++) {
    h ^= en.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return 'p_' + (h >>> 0).toString(16)
}

/** Notion exports filenames like "Title 37cd60c3814b803ead21e5147cfcd05d.md".
 *  The trailing 32-hex chunk is the page id — use it as a stable id. */
function idFromFilename(name: string): string | null {
  const base = name.replace(/^.*[\\/]/, '').replace(TEXT_EXT, '')
  const m = base.match(/([0-9a-f]{32})$/i)
  return m ? m[1] : null
}

function clean(s: string): string {
  return s.replace(/\r/g, '').trim()
}

/**
 * Pair up the example columns. Supports two layouts:
 *  - 交互列: Example1, 日本語訳1, Example2, 日本語訳2, ...（推奨の新CSV）
 *  - 英語のみ: Example1..Example5（和訳列なし）
 * Also accepts a single legacy example column (使用例（例文）等, 和訳なし).
 */
function readExamples(header: string[], cells: string[]): Example[] {
  const out: Example[] = []
  // Example{n} と対応する 日本語訳{n} / Example{n}_JA を拾う。
  for (let n = 1; ; n++) {
    const iEn = firstIndexOf(header, [`Example${n}`, `例文${n}`, `Ex${n}`])
    if (iEn === -1) break
    const iJa = firstIndexOf(header, [
      `日本語訳${n}`,
      `Example${n}_JA`,
      `例文${n}日本語`,
      `Ja${n}`,
    ])
    const iKana = firstIndexOf(header, [
      `音節${n}`,
      `Example${n}カナ`,
      `Example${n}_Kana`,
      `カナ${n}`,
    ])
    const en = clean(cells[iEn] ?? '')
    if (!en) continue
    const kana = iKana >= 0 ? clean(cells[iKana] ?? '') : ''
    out.push({ en, ja: iJa >= 0 ? clean(cells[iJa] ?? '') : '', ...(kana ? { kana } : {}) })
  }
  if (out.length) return out
  // 旧フォーマット: 単一の例文列。
  const iSingle = firstIndexOf(header, COL_EX_SINGLE)
  if (iSingle >= 0) {
    const en = clean(cells[iSingle] ?? '')
    if (en) out.push({ en, ja: '' })
  }
  return out
}

function makePhrase(
  header: string[],
  cells: string[],
  fallbackId: string,
): Phrase | null {
  const at = (names: string[]) => {
    const i = firstIndexOf(header, names)
    return i >= 0 ? clean(cells[i] ?? '') : ''
  }
  const en = at(COL_EN)
  const ja = at(COL_JA)
  if (!en || !ja) return null
  const id = at(COL_ID) || fallbackId || stableId(en)
  const kana = at(COL_KANA)
  const kanaWarnings = at(COL_KANA_WARN)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    id,
    en,
    ja,
    ...(kana ? { kana } : {}),
    ...(kanaWarnings.length ? { kanaWarnings } : {}),
    examples: readExamples(header, cells),
    type: at(COL_TYPE),
    category: at(COL_CATEGORY),
    level: at(COL_LEVEL),
    priority: at(COL_PRIORITY),
    note: at(COL_NOTE),
    status: at(COL_STATUS) || '未着手',
    createdTime: '',
  }
}

// ---- CSV ----------------------------------------------------------------

/** Minimal RFC-4180 CSV parser (handles quoted fields, commas & newlines). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export function fromCsv(text: string): Phrase[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []
  const header = rows[0].map(clean)
  if (firstIndexOf(header, COL_EN) === -1 || firstIndexOf(header, COL_JA) === -1) {
    return [] // not the phrase table
  }
  const out: Phrase[] = []
  for (let r = 1; r < rows.length; r++) {
    const p = makePhrase(header, rows[r], '')
    if (p) out.push(p)
  }
  return out
}

// ---- Markdown -----------------------------------------------------------

/** A markdown table whose header row contains a chunk + 和訳 column. */
function fromMarkdownTable(text: string): Phrase[] {
  const lines = text.split('\n')
  const hasEn = (l: string) => COL_EN.some((n) => l.includes(n))
  const hasJa = (l: string) => COL_JA.some((n) => l.includes(n))
  const headerIdx = lines.findIndex(
    (l) => l.includes('|') && hasEn(l) && hasJa(l),
  )
  if (headerIdx === -1) return []
  const splitRow = (l: string) =>
    l
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => clean(c))
  const header = splitRow(lines[headerIdx])
  const out: Phrase[] = []
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const l = lines[i]
    if (!l.includes('|')) break
    const p = makePhrase(header, splitRow(l), '')
    if (p) out.push(p)
  }
  return out
}

/** A single Notion page exported as markdown: H1 title + "Key: value" props. */
function fromMarkdownPage(text: string, filename: string): Phrase[] {
  const lines = text.split('\n').map((l) => l.replace(/\r/g, ''))
  const h1 = lines.find((l) => l.startsWith('# '))
  const en = h1 ? clean(h1.slice(2)) : ''
  if (!en) return []
  const prop = (names: string[]) => {
    for (const name of names) {
      const line = lines.find((l) => clean(l).startsWith(name + ':'))
      if (line) return clean(line.slice(line.indexOf(':') + 1))
    }
    return ''
  }
  const ja = prop(COL_JA)
  if (!ja) return []
  const example = prop(COL_EX_SINGLE)
  return [
    {
      id: idFromFilename(filename) ?? stableId(en),
      en,
      ja,
      examples: example ? [{ en: example, ja: '' }] : [],
      type: prop(COL_TYPE),
      category: prop(COL_CATEGORY),
      level: prop(COL_LEVEL),
      priority: prop(COL_PRIORITY),
      note: prop(COL_NOTE),
      status: prop(COL_STATUS) || '未着手',
      createdTime: '',
    },
  ]
}

function fromText(text: string, filename: string): Phrase[] {
  if (/\.csv$/i.test(filename)) return fromCsv(text)
  // Markdown: prefer an inline table, fall back to a single page.
  const table = fromMarkdownTable(text)
  if (table.length) return table
  return fromMarkdownPage(text, filename)
}

// ---- Merge ----------------------------------------------------------------

export interface MergeResult {
  merged: Phrase[]
  added: number // incoming にだけあった件数
  updated: number // ID一致で上書きした件数
  kept: number // existing にだけあり、そのまま保持した件数
}

/**
 * マージ取り込み: incoming は ID 一致で existing を上書きし、existing にしか
 * ない行（アプリ内で追加した教材など）は保持する。削除は伝播しない
 * （Notion 側の削除を反映したいときは全置換を使う）。
 */
export function mergePhrases(existing: Phrase[], incoming: Phrase[]): MergeResult {
  const byId = new Map(existing.map((p) => [p.id, p]))
  let added = 0
  let updated = 0
  for (const inc of incoming) {
    const prev = byId.get(inc.id)
    if (!prev) {
      byId.set(inc.id, inc)
      added++
      continue
    }
    const next: Phrase = { ...inc }
    // CSV は createdTime を持たないため、アプリ内追加時刻を消さない。
    if (!inc.createdTime) next.createdTime = prev.createdTime
    // incoming がカナを持ち込んだ場合は人手修正済みとみなし既存の要確認フラグを破棄。
    // カナ列も要確認列も無い incoming なら既存フラグを維持する。
    const incHasKana = !!inc.kana || inc.examples.some((e) => e.kana)
    if (!inc.kanaWarnings && !incHasKana && prev.kanaWarnings) {
      next.kanaWarnings = prev.kanaWarnings
    }
    byId.set(inc.id, next)
    updated++
  }
  return {
    merged: [...byId.values()],
    added,
    updated,
    kept: existing.length - updated,
  }
}

// ---- Entry point --------------------------------------------------------

/** Parse phrases out of the dropped files (Notion .zip export, .csv, or .md). */
export async function parsePhrasesFromFiles(files: File[]): Promise<Phrase[]> {
  const byId = new Map<string, Phrase>()
  const add = (p: Phrase) => byId.set(p.id, p)

  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const buf = new Uint8Array(await file.arrayBuffer())
      const entries = unzipSync(buf, { filter: (f) => TEXT_EXT.test(f.name) })
      for (const [name, data] of Object.entries(entries)) {
        if (!data.length) continue
        fromText(strFromU8(data), name).forEach(add)
      }
    } else if (TEXT_EXT.test(file.name)) {
      fromText(await file.text(), file.name).forEach(add)
    }
  }
  return [...byId.values()]
}
