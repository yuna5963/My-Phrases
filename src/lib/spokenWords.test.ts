import { beforeEach, describe, expect, it } from 'vitest'
import {
  charsPerSecond,
  estimateSyllables,
  estimateWordTimings,
  recordSpokenDuration,
  resetCalibration,
  wordAtChar,
  wordSpans,
} from './spokenWords'

beforeEach(() => resetCalibration())

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

describe('estimateSyllables', () => {
  it('母音グループを数える', () => {
    expect(estimateSyllables('still')).toBe(1)
    expect(estimateSyllables('headache')).toBe(2)
    expect(estimateSyllables('important')).toBe(3)
  })

  it('サイレントe を除く（-le/-母音e は残す）', () => {
    expect(estimateSyllables('make')).toBe(1)
    expect(estimateSyllables('table')).toBe(2)
    expect(estimateSyllables('see')).toBe(1)
  })

  it('-es / -ed 語尾', () => {
    expect(estimateSyllables('makes')).toBe(1)
    expect(estimateSyllables('boxes')).toBe(2)
    expect(estimateSyllables('walked')).toBe(1)
    expect(estimateSyllables('needed')).toBe(2)
  })

  it('最低1音節', () => {
    expect(estimateSyllables('I')).toBe(1)
    expect(estimateSyllables('')).toBe(1)
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

  it('機能語（弱形）は内容語より短い', () => {
    // "I still have a headache." — "a"（機能語1音節）は "still"（内容語1音節）より短い
    const t = estimateWordTimings('I still have a headache.', 1)
    const durStill = t[2] - t[1]
    const durA = t[4] - t[3]
    expect(durA).toBeLessThan(durStill)
  })

  it('音節が多い単語ほど長い', () => {
    const t = estimateWordTimings('big important news today', 1)
    const durBig = t[1] - t[0]
    const durImportant = t[2] - t[1] // 3音節
    expect(durImportant).toBeGreaterThan(durBig)
  })

  it('カンマの後にポーズが入る', () => {
    const withComma = estimateWordTimings('Yes, sir now', 1)
    const without = estimateWordTimings('Yes sir now', 1)
    // 先頭語の占有時間（=2語目の開始）はカンマ付きのほうが長い
    expect(withComma[1]).toBeGreaterThan(without[1])
  })

  it('空文字は空配列', () => {
    expect(estimateWordTimings('', 1)).toEqual([])
  })
})

describe('速度キャリブレーション', () => {
  const text = 'The quick brown fox jumps over the lazy dog.'

  it('実測がなければ既定値（15文字/秒 × rate）', () => {
    expect(charsPerSecond(1)).toBe(15)
    expect(charsPerSecond(0.5)).toBe(7.5)
  })

  it('実測を記録するとその rate の速度が学習される', () => {
    // 44文字を4400msで読んだ → 10文字/秒（初回サンプルはそのまま採用）
    recordSpokenDuration(text, 0.9, 4400)
    expect(charsPerSecond(0.9)).toBeCloseTo(10, 1)
    // 学習後は同じ文の推定総時間も伸びる（タイミングが後ろへずれる）
    const t = estimateWordTimings(text, 0.9)
    const before = resetAndEstimate()
    expect(t[t.length - 1]).toBeGreaterThan(before[before.length - 1])

    function resetAndEstimate() {
      resetCalibration()
      return estimateWordTimings(text, 0.9)
    }
  })

  it('別の rate へは速度比で換算して流用する', () => {
    recordSpokenDuration(text, 1, 4400) // ≒10.23文字/秒 @1.0
    expect(charsPerSecond(0.5)).toBeCloseTo(charsPerSecond(1) * 0.5, 1)
  })

  it('外れ値（短すぎる・推定から乖離）は記録しない', () => {
    recordSpokenDuration(text, 1, 300) // 短すぎる
    recordSpokenDuration('Hi.', 1, 5000) // 文が短すぎる
    recordSpokenDuration(text, 1, 60000) // 0.73文字/秒 → 乖離しすぎ
    expect(charsPerSecond(1)).toBe(15)
  })

  it('繰り返し記録すると移動平均でならされる', () => {
    recordSpokenDuration(text, 1, 4400)
    const first = charsPerSecond(1)
    recordSpokenDuration(text, 1, 3000) // 速めのサンプル
    const second = charsPerSecond(1)
    expect(second).toBeGreaterThan(first)
    expect(second).toBeLessThan((44 / 3000) * 1000) // 一気には飛ばない
  })
})
