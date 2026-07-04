import { describe, expect, it } from 'vitest'
import { estimateWordTimings, wordAtChar, wordSpans } from './spokenWords'

describe('wordSpans', () => {
  it('空白区切りでオフセット付きの単語を列挙する', () => {
    const spans = wordSpans('I still have a headache.')
    expect(spans).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 7 },
      { start: 8, end: 12 },
      { start: 13, end: 14 },
      { start: 15, end: 24 },
    ])
  })

  it('空文字は空配列', () => {
    expect(wordSpans('')).toEqual([])
  })
})

describe('wordAtChar', () => {
  const spans = wordSpans('I still have a headache.')

  it('単語の先頭位置でその単語番号を返す', () => {
    expect(wordAtChar(spans, 0)).toBe(0)
    expect(wordAtChar(spans, 2)).toBe(1)
    expect(wordAtChar(spans, 15)).toBe(4)
  })

  it('単語の途中位置でもその単語番号を返す', () => {
    expect(wordAtChar(spans, 4)).toBe(1) // "still" の途中
  })

  it('末尾を超えた位置は最後の単語', () => {
    expect(wordAtChar(spans, 999)).toBe(4)
  })

  it('スパンが無いときは -1', () => {
    expect(wordAtChar([], 0)).toBe(-1)
  })
})

describe('estimateWordTimings', () => {
  it('先頭は0ms、単調増加', () => {
    const t = estimateWordTimings('I still have a headache.', 1)
    expect(t[0]).toBe(0)
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1])
  })

  it('rate を上げると各タイミングが前倒しになる', () => {
    const slow = estimateWordTimings('I still have a headache.', 0.5)
    const fast = estimateWordTimings('I still have a headache.', 1.2)
    expect(fast[2]).toBeLessThan(slow[2])
  })

  it('空文字は空配列', () => {
    expect(estimateWordTimings('', 1)).toEqual([])
  })
})
