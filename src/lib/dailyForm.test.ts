import { describe, it, expect } from 'vitest'
import { formFor } from './dailyForm'
import { newProgress } from './srs'
import type { Phrase, Progress } from '../types'

// 穴埋めにできるチャンク（例文中にチャンクがそのまま単語境界で現れる）。
const clozeable: Phrase = {
  id: 'p_still',
  en: 'still',
  ja: 'まだ・依然として',
  examples: [{ en: 'I still have a headache.', ja: 'まだ頭痛があります。' }],
  type: 'Nuance',
  category: 'Daily Status',
  level: 'Basic',
  priority: '★★★★★',
  note: '',
  status: '進行中',
  createdTime: '2026-01-01T00:00:00.000Z',
}

// 例文にチャンクが現れないので穴埋めにできない。
const notClozeable: Phrase = {
  ...clozeable,
  id: 'p_nocloze',
  en: 'make sense',
  examples: [{ en: 'That is reasonable.', ja: '筋が通っています。' }],
}

/** lastSeen を埋めて「新規ではない」progress を作る。 */
function seen(box: number): Progress {
  return { ...newProgress('p_still'), box, lastSeen: '2026-07-20T00:00:00.000Z' }
}

describe('formFor', () => {
  it('新規（progress 未作成・未学習）はモデリング', () => {
    expect(formFor(undefined, clozeable)).toBe('model')
    expect(formFor(newProgress('p_still'), clozeable)).toBe('model')
  })

  it('box 0-1 は再現練習', () => {
    expect(formFor(seen(0), clozeable)).toBe('repro')
    expect(formFor(seen(1), clozeable)).toBe('repro')
  })

  it('box 2-3 は瞬間英作文', () => {
    expect(formFor(seen(2), clozeable)).toBe('compose')
    expect(formFor(seen(3), clozeable)).toBe('compose')
  })

  // 穴埋めは専用ページを廃し「今日の練習」に統合したので、ここが唯一の入口になる。
  it('box 4 以上かつ穴埋め可能なら穴埋め', () => {
    expect(formFor(seen(4), clozeable)).toBe('cloze')
    expect(formFor(seen(5), clozeable)).toBe('cloze')
  })

  it('box 4 以上でも穴埋めにできない例文しか無ければ瞬間英作文のまま', () => {
    expect(formFor(seen(4), notClozeable)).toBe('compose')
  })
})
