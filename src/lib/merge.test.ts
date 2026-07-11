import { describe, expect, it } from 'vitest'
import { mergePhrases } from './import'
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
    priority: '',
    note: '',
    status: '未着手',
    createdTime: '',
    ...over,
  }
}

describe('mergePhrases', () => {
  it('ID一致は上書き、incoming にだけある行は追加、existing にだけある行は保持', () => {
    const existing = [
      phrase({ id: 'a', ja: '旧訳' }),
      phrase({ id: 'app-only', en: 'No worries.', ja: '気にしないで' }),
    ]
    const incoming = [
      phrase({ id: 'a', ja: '新訳' }),
      phrase({ id: 'b', en: 'brand new', ja: '新規' }),
    ]
    const r = mergePhrases(existing, incoming)
    expect(r.added).toBe(1)
    expect(r.updated).toBe(1)
    expect(r.kept).toBe(1)
    const byId = new Map(r.merged.map((p) => [p.id, p]))
    expect(byId.get('a')?.ja).toBe('新訳')
    expect(byId.get('app-only')?.ja).toBe('気にしないで')
    expect(byId.get('b')?.ja).toBe('新規')
    expect(r.merged).toHaveLength(3)
  })

  it('incoming の createdTime が空なら既存値を温存する（アプリ内追加時刻の保護）', () => {
    const existing = [phrase({ id: 'a', createdTime: '2026-07-11T00:00:00.000Z' })]
    const r = mergePhrases(existing, [phrase({ id: 'a', createdTime: '' })])
    expect(r.merged[0].createdTime).toBe('2026-07-11T00:00:00.000Z')
  })

  it('incoming が createdTime を持つならそれを使う', () => {
    const existing = [phrase({ id: 'a', createdTime: '2026-01-01T00:00:00.000Z' })]
    const r = mergePhrases(existing, [phrase({ id: 'a', createdTime: '2026-07-01T00:00:00.000Z' })])
    expect(r.merged[0].createdTime).toBe('2026-07-01T00:00:00.000Z')
  })

  it('incoming がカナを持ち込んだら既存の kanaWarnings を破棄（人手修正済みとみなす）', () => {
    const existing = [phrase({ id: 'a', kana: '*オールド*', kanaWarnings: ['音節'] })]
    const r = mergePhrases(existing, [phrase({ id: 'a', kana: '*ニュー*' })])
    expect(r.merged[0].kana).toBe('*ニュー*')
    expect(r.merged[0].kanaWarnings).toBeUndefined()
  })

  it('incoming にカナ列も要確認列も無ければ既存の kanaWarnings を維持する', () => {
    const existing = [phrase({ id: 'a', kana: '*カナ*', kanaWarnings: ['音節'] })]
    const r = mergePhrases(existing, [phrase({ id: 'a' })])
    expect(r.merged[0].kanaWarnings).toEqual(['音節'])
  })

  it('incoming が kanaWarnings を持つならそれを使う（CSV往復）', () => {
    const existing = [phrase({ id: 'a', kanaWarnings: ['音節'] })]
    const r = mergePhrases(existing, [phrase({ id: 'a', kana: '*カナ*', kanaWarnings: ['音節1'] })])
    expect(r.merged[0].kanaWarnings).toEqual(['音節1'])
  })

  it('例文カナだけでも「カナを持ち込んだ」扱いになる', () => {
    const existing = [phrase({ id: 'a', kanaWarnings: ['音節1'] })]
    const incoming = [phrase({ id: 'a', examples: [{ en: 'Hi.', ja: '', kana: 'ハイ' }] })]
    expect(mergePhrases(existing, incoming).merged[0].kanaWarnings).toBeUndefined()
  })

  it('existing が空なら全件追加', () => {
    const r = mergePhrases([], [phrase({ id: 'a' }), phrase({ id: 'b' })])
    expect(r.added).toBe(2)
    expect(r.updated).toBe(0)
    expect(r.kept).toBe(0)
  })
})
