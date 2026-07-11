import { describe, expect, it } from 'vitest'
import { csvEscape, csvFilename, phrasesToCsv, stockToCsv } from './export'
import { fromCsv, parseCsvRows } from './import'
import type { Phrase } from '../types'

function phrase(over: Partial<Phrase> = {}): Phrase {
  return {
    id: 'p_1',
    en: 'It turned out',
    ja: '結果として〜になった',
    examples: [],
    type: 'Chunk',
    category: 'Reflection',
    level: 'Core',
    priority: '★★★',
    note: '',
    status: '進行中',
    createdTime: '',
    ...over,
  }
}

describe('csvEscape', () => {
  it('カンマ・引用符・改行を含むときだけクォートする', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape('')).toBe('')
  })
})

describe('phrasesToCsv → 再インポートのラウンドトリップ', () => {
  it('ID・分類・ステータス・カナ・例文が往復で保持される', () => {
    const p = phrase({
      kana: '*ス・ティル*',
      kanaWarnings: ['音節', '音節1'],
      examples: [
        { en: 'The meeting turned out fine.', ja: '会議はうまくいった。', kana: 'ザ *ミー*・ティン' },
        { en: 'No kana here', ja: '' },
      ],
      note: 'メモ, カンマ入り',
    })
    const csv = phrasesToCsv([p])
    expect(csv.startsWith('\uFEFF')).toBe(true)

    const back = fromCsv(csv)
    expect(back).toHaveLength(1)
    const b = back[0]
    expect(b.id).toBe(p.id)
    expect(b.en).toBe(p.en)
    expect(b.ja).toBe(p.ja)
    expect(b.kana).toBe(p.kana)
    expect(b.kanaWarnings).toEqual(['音節', '音節1'])
    expect(b.type).toBe(p.type)
    expect(b.category).toBe(p.category)
    expect(b.level).toBe(p.level)
    expect(b.priority).toBe(p.priority)
    expect(b.note).toBe(p.note)
    expect(b.status).toBe('進行中')
    expect(b.examples).toEqual([
      { en: 'The meeting turned out fine.', ja: '会議はうまくいった。', kana: 'ザ *ミー*・ティン' },
      { en: 'No kana here', ja: '' },
    ])
  })

  it('例文5件と空欄・改行入りフィールドも往復できる', () => {
    const examples = Array.from({ length: 5 }, (_, i) => ({
      en: `Example sentence ${i + 1}`,
      ja: `例文 ${i + 1}`,
    }))
    const p = phrase({ examples, ja: '一行目\n二行目' })
    const back = fromCsv(phrasesToCsv([p]))
    expect(back[0].examples).toHaveLength(5)
    expect(back[0].ja).toBe('一行目\n二行目')
  })

  it('kanaWarnings が無い行は列が空になり undefined に戻る', () => {
    const back = fromCsv(phrasesToCsv([phrase()]))
    expect(back[0].kanaWarnings).toBeUndefined()
    expect(back[0].kana).toBeUndefined()
  })
})

describe('stockToCsv', () => {
  it('Chunk/日本語 列名なのでインポータでも読める', () => {
    const csv = stockToCsv([
      { en: 'No worries.', ja: '気にしないで', addedAt: '2026-07-11' },
    ])
    const rows = parseCsvRows(csv)
    expect(rows[0][0].replace(/^\uFEFF/, '')).toBe('Chunk')
    const back = fromCsv(csv)
    expect(back).toHaveLength(1)
    expect(back[0].en).toBe('No worries.')
    expect(back[0].ja).toBe('気にしないで')
  })
})

describe('csvFilename', () => {
  it('日付入りの .csv 名を返す', () => {
    expect(csvFilename('deck')).toMatch(/^my-phrases-deck-\d{8}\.csv$/)
    expect(csvFilename('stock')).toMatch(/^my-phrases-stock-\d{8}\.csv$/)
  })
})
