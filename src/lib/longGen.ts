// 長文音読用の読み物を AI に生成させる。テーマ・難易度・長さと、デッキから
// 選んだチャンク（3〜5個）を必ず織り込ませ、チャンク練習と長文練習を分離させない。
import { streamChat } from './chatApi'
import { extractJson } from './aiJson'
import { stableId } from './import'
import { LONG_READING_TYPE } from './longReading'
import type { Phrase } from '../types'

export const LONG_LEVELS = ['Basic', 'Core', 'Advanced'] as const
export type LongLevel = (typeof LONG_LEVELS)[number]
export type LongLength = 'short' | 'medium'

export const MIN_CHUNKS = 3
export const MAX_CHUNKS = 5

export interface LongGenOptions {
  theme: string
  level: LongLevel
  length: LongLength
  chunks: Phrase[] // MIN_CHUNKS〜MAX_CHUNKS 件
}

export interface LongDraft {
  titleEn: string
  titleJa: string
  en: string // 本文。段落は \n\n 区切り
  ja: string
}

const LEVEL_DESC: Record<LongLevel, string> = {
  Basic: 'CEFR A2 (simple everyday words, short sentences)',
  Core: 'CEFR B1 (natural everyday English)',
  Advanced: 'CEFR B2 (richer vocabulary, longer sentences)',
}

const LENGTH_DESC: Record<LongLength, string> = {
  short: '1 paragraph, 60-100 words',
  medium: '2 paragraphs, 120-180 words',
}

export function buildLongGenPrompt(opts: LongGenOptions): string {
  const chunkLines = opts.chunks
    .map((c) => `- "${c.en}"${c.ja ? ` (${c.ja})` : ''}`)
    .join('\n')
  return `Write a short reading passage for a Japanese English learner to read aloud.

## Constraints
- Theme: ${opts.theme}
- Level: ${LEVEL_DESC[opts.level]}
- Length: ${LENGTH_DESC[opts.length]}
- Naturally include ALL of these expressions (weave them into the story; do not list them):
${chunkLines}
- First-person, everyday tone. No headings, no bullet points.

## Output format (STRICT)
Reply with ONLY a JSON object. No markdown fences, no explanations, no <thought>:
{"title_en": "...", "title_ja": "...", "en": "...", "ja": "..."}
- "en": the passage. Use \\n\\n between paragraphs.
- "ja": natural Japanese translation of the whole passage.
- "title_en": a short title (3-6 words). "title_ja": its Japanese translation.`
}

/** 応答をドラフトに変換する。JSONが読めない・必須キー欠落は null（呼び出し側がリトライ）。 */
export function parseLongGenResponse(text: string): LongDraft | null {
  let data: unknown
  try {
    data = extractJson(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '')
  const draft: LongDraft = {
    titleEn: str('title_en'),
    titleJa: str('title_ja'),
    en: str('en'),
    ja: str('ja'),
  }
  if (!draft.titleEn || !draft.en || !draft.ja) return null
  return draft
}

/** 1リクエストで生成し、JSONが読めなければ1回だけリトライ。それでも駄目なら null。 */
export async function generateLongReading(
  opts: LongGenOptions,
  api: { apiKey: string; model: string; signal?: AbortSignal },
): Promise<LongDraft | null> {
  const prompt = buildLongGenPrompt(opts)
  const run = (p: string) =>
    streamChat({
      apiKey: api.apiKey,
      model: api.model,
      messages: [{ role: 'user', content: p }],
      // 読み物なので多少の多様性は残しつつ、JSON遵守が崩れない程度に抑える。
      temperature: 0.6,
      signal: api.signal,
    })
  let draft = parseLongGenResponse(await run(prompt))
  if (!draft) {
    draft = parseLongGenResponse(
      await run(prompt + '\n\nIMPORTANT: Reply with ONLY the raw JSON object, starting with "{".'),
    )
  }
  return draft
}

/** LongReading.tsx の表示規約（本文= examples[0]、Example2以降なし）に合わせて組み立てる。 */
export function draftToLongPhrase(d: LongDraft, opts: LongGenOptions): Phrase {
  return {
    // タイトルだけだと衝突しやすいので本文の先頭も混ぜて採番する。
    id: stableId(d.titleEn + '\n' + d.en.slice(0, 64)),
    en: d.titleEn,
    ja: d.titleJa,
    examples: [{ en: d.en, ja: d.ja }], // カナなし（KanaLine は空欄可）
    type: LONG_READING_TYPE,
    category: opts.theme,
    level: opts.level,
    priority: '',
    note: opts.chunks.length
      ? `使用チャンク: ${opts.chunks.map((c) => c.en).join(' / ')}`
      : '',
    status: '未着手',
    createdTime: new Date().toISOString(),
  }
}
