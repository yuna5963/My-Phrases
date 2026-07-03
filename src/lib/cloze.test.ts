import { describe, expect, it } from 'vitest'
import { clozeItems, findChunkSpan, hasCloze, maskChunk } from './cloze'
import type { Phrase } from '../types'

function phrase(en: string, examples: { en: string; ja?: string }[]): Phrase {
  return {
    id: 'p1',
    en,
    ja: '日本語訳',
    examples: examples.map((e) => ({ en: e.en, ja: e.ja ?? '' })),
    type: 'Chunk',
    category: '',
    level: '',
    priority: '',
    note: '',
    status: '未着手',
    createdTime: '',
  }
}

describe('findChunkSpan', () => {
  it('大文字小文字を無視して見つける', () => {
    const span = findChunkSpan('Still, I went home.', 'still')
    expect(span).toEqual({ start: 0, end: 5 })
  })

  it('複数語のチャンクも見つける', () => {
    const span = findChunkSpan('It does not make sense to me.', 'make sense')
    expect(span).toEqual({ start: 12, end: 22 })
  })

  it('単語途中のヒットは除外する（in が going に一致しない）', () => {
    expect(findChunkSpan('I am going home.', 'in')).toBeNull()
  })

  it('単語途中で始まるヒットも除外する（still が stillness に一致しない）', () => {
    expect(findChunkSpan('The stillness was calming.', 'still')).toBeNull()
  })

  it('単語境界を満たす2つ目の出現を拾う', () => {
    // "instill" は境界NG、その後の " still " が正解。
    const s = 'They instill calm, still waters.'
    const span = findChunkSpan(s, 'still')
    expect(span).not.toBeNull()
    expect(s.slice(span!.start, span!.end)).toBe('still')
  })

  it('活用形は探さない（go は going に一致しない）', () => {
    expect(findChunkSpan('I am going home.', 'go')).toBeNull()
  })

  it('アポストロフィの違い（’ と \'）を吸収する', () => {
    const span = findChunkSpan('I don’t mind at all.', "don't mind")
    expect(span).toEqual({ start: 2, end: 12 })
  })

  it('空のチャンクは null', () => {
    expect(findChunkSpan('Anything here.', '  ')).toBeNull()
  })
})

describe('maskChunk', () => {
  it('チャンク部分を固定の伏せ字1つに置き換える', () => {
    const s = 'It does not make sense to me.'
    const span = findChunkSpan(s, 'make sense')!
    expect(maskChunk(s, span)).toBe('It does not ____ to me.')
  })
})

describe('clozeItems / hasCloze', () => {
  it('チャンクが見つかる例文だけを問題にする', () => {
    const p = phrase('still', [
      { en: 'I still have a headache.', ja: 'まだ頭痛があります。' },
      { en: 'The stillness was calming.' }, // 境界NG → 対象外
      { en: '' }, // 空 → 対象外
    ])
    const items = clozeItems(p)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      exampleIndex: 0,
      before: 'I ',
      chunk: 'still',
      after: ' have a headache.',
      ja: 'まだ頭痛があります。',
    })
    expect(hasCloze(p)).toBe(true)
  })

  it('1つも見つからなければ hasCloze は false', () => {
    const p = phrase('go', [{ en: 'I am going home.' }])
    expect(clozeItems(p)).toHaveLength(0)
    expect(hasCloze(p)).toBe(false)
  })
})
