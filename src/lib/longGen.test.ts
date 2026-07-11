import { describe, expect, it } from 'vitest'
import {
  buildLongGenPrompt,
  draftToLongPhrase,
  parseLongGenResponse,
  type LongGenOptions,
} from './longGen'
import { LONG_READING_TYPE } from './longReading'
import type { Phrase } from '../types'

function chunk(id: string, en: string, ja = ''): Phrase {
  return {
    id,
    en,
    ja,
    examples: [],
    type: 'Chunk',
    category: '',
    level: '',
    priority: '',
    note: '',
    status: '未着手',
    createdTime: '',
  }
}

const OPTS: LongGenOptions = {
  theme: '仕事',
  level: 'Core',
  length: 'short',
  chunks: [
    chunk('a', 'It turned out', '結果として'),
    chunk('b', 'figure out'),
    chunk('c', 'in the long run'),
  ],
}

describe('buildLongGenPrompt', () => {
  it('テーマ・難易度・長さ・チャンク一覧を含む', () => {
    const p = buildLongGenPrompt(OPTS)
    expect(p).toContain('Theme: 仕事')
    expect(p).toContain('CEFR B1')
    expect(p).toContain('1 paragraph, 60-100 words')
    expect(p).toContain('- "It turned out" (結果として)')
    expect(p).toContain('- "figure out"')
    expect(p).toContain('title_en')
  })
})

describe('parseLongGenResponse', () => {
  const OK = {
    title_en: 'A Busy Monday',
    title_ja: '忙しい月曜日',
    en: 'This morning I had a lot to do.\n\nIt turned out fine.',
    ja: '今朝はやることが多かった。\n\n結局うまくいった。',
  }

  it('正常なJSONオブジェクトを読める', () => {
    expect(parseLongGenResponse(JSON.stringify(OK))).toEqual({
      titleEn: 'A Busy Monday',
      titleJa: '忙しい月曜日',
      en: OK.en,
      ja: OK.ja,
    })
  })

  it('フェンス・<thought>付きでも読める', () => {
    const text = `<thought>…</thought>\n\`\`\`json\n${JSON.stringify(OK)}\n\`\`\``
    expect(parseLongGenResponse(text)?.titleEn).toBe('A Busy Monday')
  })

  it('必須キーが欠けたら null', () => {
    expect(parseLongGenResponse(JSON.stringify({ title_en: 'x', en: 'y' }))).toBeNull()
    expect(parseLongGenResponse('できませんでした')).toBeNull()
  })
})

describe('draftToLongPhrase', () => {
  const draft = {
    titleEn: 'A Busy Monday',
    titleJa: '忙しい月曜日',
    en: 'Para one.\n\nPara two.',
    ja: '段落1。\n\n段落2。',
  }

  it('LongReading の表示規約（type / examples[0] / カナなし）に合う', () => {
    const p = draftToLongPhrase(draft, OPTS)
    expect(p.type).toBe(LONG_READING_TYPE)
    expect(p.en).toBe('A Busy Monday')
    expect(p.ja).toBe('忙しい月曜日')
    expect(p.kana).toBeUndefined()
    expect(p.examples).toEqual([{ en: 'Para one.\n\nPara two.', ja: '段落1。\n\n段落2。' }])
    expect(p.category).toBe('仕事')
    expect(p.note).toContain('It turned out')
    expect(p.createdTime).not.toBe('')
  })

  it('同タイトルでも本文が違えば別IDになる', () => {
    const a = draftToLongPhrase(draft, OPTS)
    const b = draftToLongPhrase({ ...draft, en: 'Different body text here.' }, OPTS)
    expect(a.id).not.toBe(b.id)
  })
})
