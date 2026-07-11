// 教材化: 表現ストックの英文（＋あれば和訳）から、Gemma に不足項目
// （和訳・例文1件・シラブルカナ・分類）を固定 JSON スキーマで生成させる。
// 出力は下書きとして扱い、カナは kanaLint で機械検証してから保存する。
import { ChatApiError, streamChat } from './chatApi'
import { extractJson } from './aiJson'
import { lintKana, type KanaIssue } from './kanaLint'
import { stableId } from './import'
import type { Phrase } from '../types'

/** 1リクエストの件数。応答トークン切れとレート消費を抑える。 */
export const ENRICH_BATCH_SIZE = 5

export const TYPE_OPTIONS = ['Chunk', 'Pattern', 'Phrase', 'Connector', 'Nuance'] as const
export const LEVEL_OPTIONS = ['Basic', 'Core', 'Advanced'] as const

export interface EnrichInput {
  en: string
  /** ストックに和訳があれば渡す。ある項目は生成させず、この値をそのまま使う。 */
  ja?: string
}

export interface EnrichDraft {
  en: string
  ja: string
  kana: string
  exampleEn: string
  exampleJa: string
  exampleKana: string
  type: string
  category: string
  level: string
  /** 生成直後の kanaLint 結果。編集で変わるため UI 側で再計算してよい。 */
  kanaIssues: { kana: KanaIssue[]; exampleKana: KanaIssue[] }
  /** この項目だけ生成に失敗した場合の理由（再生成の対象）。 */
  error?: string
}

const RETRY_SUFFIX = '\n\nIMPORTANT: Reply with ONLY the raw JSON array, starting with "[".'

export function buildEnrichPrompt(items: EnrichInput[], categories: string[]): string {
  const catList = [...new Set(categories.filter(Boolean))].join(', ') || 'Daily Status'
  const inputLines = items
    .map(
      (it, i) =>
        `${i + 1}. en: "${it.en}"${it.ja ? ` (ja: given "${it.ja}")` : ' (ja: MISSING)'}`,
    )
    .join('\n')
  return `You are a data generator for a Japanese learner's English phrase app. For each input item, produce a complete flashcard entry.

## Output format (STRICT)
Reply with ONLY a JSON array. No markdown fences, no explanations, no <thought>.
Each element must have exactly these keys:
{"n": 1, "en": "...", "ja": "...", "kana": "...", "example_en": "...", "example_ja": "...", "example_kana": "...", "type": "...", "category": "...", "level": "..."}

## Rules
- "n": copy the input item number. Output exactly ${items.length} element(s), in the same order as the input.
- If a field is marked as given, copy it unchanged. Generate ONLY missing fields.
- "ja": natural, concise Japanese translation of the phrase.
- "example_en": ONE short everyday sentence (max 12 words) that uses the phrase naturally.
- "example_ja": natural Japanese translation of example_en.
- "type": one of ${TYPE_OPTIONS.join(' / ')}.
- "category": choose the closest from: ${catList}. If none fits, invent a short English category name.
- "level": one of ${LEVEL_OPTIONS.join(' / ')}.

## Kana notation for "kana" and "example_kana" (American-English syllable katakana)
- 「・」 = syllable break inside a word. Half-width space = word break.
- 「‿」 = linking (word-final consonant flows into the next word's initial vowel).
- (…) = swallowed / barely audible sound such as word-final t/d: ナッ(ト), クッ(ド).
- *…* = stressed syllable, asterisks always in pairs. Stress content words. Weak function words (to, the, a, of, and, can) are reduced and not stressed.
- Reflect linking, reduction and flap-t: better → ベ・ラ.
Examples:
- still → *ス・ティル*
- I still have a headache. → アイ ス・*ティル* ハ・ヴァ *ヘッ*・デイク
- focus on → *フォウ*・カ‿*ソン*

## Example
Input:
1. en: "No worries." (ja: given "気にしないで")
Output:
[{"n":1,"en":"No worries.","ja":"気にしないで","kana":"ノウ *ワ*・リーズ","example_en":"No worries, I can wait.","example_ja":"気にしないで、待てるから。","example_kana":"ノウ *ワ*・リーズ アイ ク(ン) *ウェイ(ト)*","type":"Phrase","category":"Daily Status","level":"Basic"}]

## Input
${inputLines}`
}

function errorDraft(input: EnrichInput, message: string): EnrichDraft {
  return {
    en: input.en,
    ja: input.ja ?? '',
    kana: '',
    exampleEn: '',
    exampleJa: '',
    exampleKana: '',
    type: 'Chunk',
    category: '',
    level: 'Core',
    kanaIssues: { kana: [], exampleKana: [] },
    error: message,
  }
}

/**
 * 応答を入力と突き合わせてドラフトに変換する。
 * 応答全体が JSON として読めない場合は null（呼び出し側が1回だけリトライ）。
 * 個別項目の欠落・不備は error 付きドラフトにして、バッチ全体は捨てない。
 */
export function parseEnrichResponse(
  text: string,
  inputs: EnrichInput[],
): EnrichDraft[] | null {
  let data: unknown
  try {
    data = extractJson(text)
  } catch {
    return null
  }
  const arr = Array.isArray(data) ? data : [data]
  const byN = new Map<number, Record<string, unknown>>()
  arr.forEach((el, idx) => {
    if (el && typeof el === 'object' && !Array.isArray(el)) {
      const o = el as Record<string, unknown>
      const n = typeof o.n === 'number' ? o.n : idx + 1
      if (!byN.has(n)) byN.set(n, o)
    }
  })
  return inputs.map((input, i) => {
    const o = byN.get(i + 1)
    if (!o) return errorDraft(input, '生成結果にこの項目がありませんでした')
    const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '')
    const type = str('type')
    const level = str('level')
    const draft: EnrichDraft = {
      // given のフィールドはモデル出力を信用せず入力値を採用する（防御）。
      en: input.en,
      ja: input.ja?.trim() || str('ja'),
      kana: str('kana'),
      exampleEn: str('example_en'),
      exampleJa: str('example_ja'),
      exampleKana: str('example_kana'),
      type: (TYPE_OPTIONS as readonly string[]).includes(type) ? type : 'Chunk',
      category: str('category'),
      level: (LEVEL_OPTIONS as readonly string[]).includes(level) ? level : 'Core',
      kanaIssues: { kana: [], exampleKana: [] },
    }
    if (!draft.ja) return { ...draft, error: '訳を生成できませんでした' }
    draft.kanaIssues = {
      kana: draft.kana ? lintKana(draft.kana, draft.en) : [],
      exampleKana:
        draft.exampleKana && draft.exampleEn
          ? lintKana(draft.exampleKana, draft.exampleEn)
          : [],
    }
    return draft
  })
}

export interface EnrichRunOptions {
  apiKey: string
  model: string
  categories: string[]
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface EnrichRunResult {
  drafts: EnrichDraft[]
  /** 途中で API エラーになった場合。drafts には成功済みバッチ分だけ入る。 */
  error?: ChatApiError
}

/** 5件ずつ直列でバッチ生成する。JSONが読めないバッチは1回だけリトライ。 */
export async function enrichAll(
  inputs: EnrichInput[],
  opts: EnrichRunOptions,
): Promise<EnrichRunResult> {
  const drafts: EnrichDraft[] = []
  for (let i = 0; i < inputs.length; i += ENRICH_BATCH_SIZE) {
    const batch = inputs.slice(i, i + ENRICH_BATCH_SIZE)
    try {
      drafts.push(...(await enrichBatch(batch, opts)))
    } catch (e) {
      if (e instanceof ChatApiError) return { drafts, error: e }
      throw e // AbortError などはそのまま呼び出し側へ
    }
    opts.onProgress?.(Math.min(i + ENRICH_BATCH_SIZE, inputs.length), inputs.length)
  }
  return { drafts }
}

async function enrichBatch(
  batch: EnrichInput[],
  opts: EnrichRunOptions,
): Promise<EnrichDraft[]> {
  const prompt = buildEnrichPrompt(batch, opts.categories)
  const run = (p: string) =>
    streamChat({
      apiKey: opts.apiKey,
      model: opts.model,
      messages: [{ role: 'user', content: p }],
      temperature: 0.2,
      signal: opts.signal,
    })
  let drafts = parseEnrichResponse(await run(prompt), batch)
  if (!drafts) drafts = parseEnrichResponse(await run(prompt + RETRY_SUFFIX), batch)
  return drafts ?? batch.map((b) => errorDraft(b, 'AIの応答を解析できませんでした'))
}

/** 確認済みドラフトをデッキ追加用の Phrase に組み立てる。 */
export function draftToPhrase(d: EnrichDraft): Phrase {
  const kanaWarnings: string[] = []
  if (d.kana && d.kanaIssues.kana.length) kanaWarnings.push('音節')
  if (d.exampleKana && d.kanaIssues.exampleKana.length) kanaWarnings.push('音節1')
  return {
    id: stableId(d.en),
    en: d.en,
    ja: d.ja,
    ...(d.kana ? { kana: d.kana } : {}),
    ...(kanaWarnings.length ? { kanaWarnings } : {}),
    examples: d.exampleEn
      ? [
          {
            en: d.exampleEn,
            ja: d.exampleJa,
            ...(d.exampleKana ? { kana: d.exampleKana } : {}),
          },
        ]
      : [],
    type: d.type,
    category: d.category,
    level: d.level,
    priority: '',
    note: '',
    status: '未着手',
    // アプリ内追加の印であり、デッキ先頭に並べるためのキーでもある。
    createdTime: new Date().toISOString(),
  }
}
