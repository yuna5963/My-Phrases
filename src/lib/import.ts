import { unzipSync, strFromU8 } from 'fflate'
import type { Phrase } from '../types'

// Notion property names in the フレーズ集 database.
const COL_EN = 'フレーズ'
const COL_JA = '日本語訳'
// Example column has gone by a few names across exports/sheets.
const COL_EX_ALIASES = ['使用例（例文）', '例文', '使用例', '例']
const COL_STATUS = 'ステータス'

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
 *  (and therefore preserve SRS progress) when no Notion page id is available. */
function stableId(en: string): string {
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

// ---- CSV ----------------------------------------------------------------

/** Minimal RFC-4180 CSV parser (handles quoted fields, commas & newlines). */
function parseCsvRows(text: string): string[][] {
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

function fromCsv(text: string): Phrase[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []
  const header = rows[0].map(clean)
  const idx = (name: string) => header.indexOf(name)
  const iEn = idx(COL_EN)
  const iJa = idx(COL_JA)
  if (iEn === -1 || iJa === -1) return [] // not the phrase table
  const iEx = firstIndexOf(header, COL_EX_ALIASES)
  const iStatus = idx(COL_STATUS)
  const out: Phrase[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const en = clean(cells[iEn] ?? '')
    const ja = clean(cells[iJa] ?? '')
    if (!en || !ja) continue
    out.push({
      id: stableId(en),
      en,
      ja,
      example: iEx >= 0 ? clean(cells[iEx] ?? '') : '',
      status: iStatus >= 0 ? clean(cells[iStatus] ?? '') || '未着手' : '未着手',
      createdTime: '',
    })
  }
  return out
}

// ---- Markdown -----------------------------------------------------------

/** A markdown table whose header row contains フレーズ / 日本語訳. */
function fromMarkdownTable(text: string): Phrase[] {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex(
    (l) => l.includes('|') && l.includes(COL_EN) && l.includes(COL_JA),
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
  const iEn = header.indexOf(COL_EN)
  const iJa = header.indexOf(COL_JA)
  const iEx = firstIndexOf(header, COL_EX_ALIASES)
  const iStatus = header.indexOf(COL_STATUS)
  const out: Phrase[] = []
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const l = lines[i]
    if (!l.includes('|')) break
    const cells = splitRow(l)
    const en = cells[iEn] ?? ''
    const ja = cells[iJa] ?? ''
    if (!en || !ja) continue
    out.push({
      id: stableId(en),
      en,
      ja,
      example: iEx >= 0 ? cells[iEx] ?? '' : '',
      status: iStatus >= 0 ? cells[iStatus] || '未着手' : '未着手',
      createdTime: '',
    })
  }
  return out
}

/** A single Notion page exported as markdown: H1 title + "Key: value" props. */
function fromMarkdownPage(text: string, filename: string): Phrase[] {
  const lines = text.split('\n').map((l) => l.replace(/\r/g, ''))
  const h1 = lines.find((l) => l.startsWith('# '))
  const en = h1 ? clean(h1.slice(2)) : ''
  if (!en) return []
  const prop = (name: string) => {
    const line = lines.find((l) => clean(l).startsWith(name + ':'))
    return line ? clean(line.slice(line.indexOf(':') + 1)) : ''
  }
  const ja = prop(COL_JA)
  if (!ja) return []
  const example = COL_EX_ALIASES.map(prop).find((v) => v) ?? ''
  return [
    {
      id: idFromFilename(filename) ?? stableId(en),
      en,
      ja,
      example,
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
