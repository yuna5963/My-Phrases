// Notion → public/data/phrases.json exporter.
// Run with: npm run sync
// Requires NOTION_TOKEN (and optionally NOTION_DATA_SOURCE_ID) in .env
import { Client } from '@notionhq/client'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TOKEN = process.env.NOTION_TOKEN
const DATA_SOURCE_ID =
  process.env.NOTION_DATA_SOURCE_ID || '37ad60c3-814b-807f-a288-000b36b3b8cd'

if (!TOKEN) {
  console.error('✗ NOTION_TOKEN is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const notion = new Client({ auth: TOKEN })

/** Read a plain-text value out of a Notion property of any text-ish type. */
function plainText(prop) {
  if (!prop) return ''
  const rich = prop.title ?? prop.rich_text
  if (Array.isArray(rich)) return rich.map((t) => t.plain_text).join('').trim()
  return ''
}

async function fetchAll() {
  const rows = []
  let cursor = undefined
  do {
    // data_source / database query (Notion API). Works with a database_id too.
    const res = await notion.databases.query({
      database_id: DATA_SOURCE_ID,
      start_cursor: cursor,
      page_size: 100,
    })
    for (const page of res.results) {
      const p = page.properties ?? {}
      rows.push({
        id: page.id,
        en: plainText(p['フレーズ']),
        ja: plainText(p['日本語訳']),
        example: plainText(p['使用例（例文）']),
        status: p['ステータス']?.status?.name ?? '未着手',
        createdTime: page.created_time,
      })
    }
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return rows
}

const rows = (await fetchAll()).filter((r) => r.en && r.ja)
rows.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1)) // newest first

const outPath = resolve(__dirname, '../public/data/phrases.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8')
console.log(`✓ Wrote ${rows.length} phrases to ${outPath}`)
