import { describe, expect, it } from 'vitest'
import { freeTierDailyLimit, pacificToday, todayCountOf, useUsage } from './usage'

describe('pacificToday', () => {
  it('YYYY-MM-DD 形式を返す', () => {
    expect(pacificToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('太平洋時間基準で日付を出す（UTC朝5時はまだ前日）', () => {
    // 2026-07-13 05:00 UTC = 太平洋時間（PDT, UTC-7）では 07-12 22:00
    expect(pacificToday(new Date('2026-07-13T05:00:00Z'))).toBe('2026-07-12')
    // 2026-07-13 08:00 UTC = PDT 01:00 → 日付が変わっている
    expect(pacificToday(new Date('2026-07-13T08:00:00Z'))).toBe('2026-07-13')
  })
})

describe('freeTierDailyLimit', () => {
  it('既知モデルの RPD 目安を返す', () => {
    expect(freeTierDailyLimit('gemma-4-31b-it')).toBe(14400)
    expect(freeTierDailyLimit('gemini-flash-latest')).toBe(250)
    expect(freeTierDailyLimit('gemini-2.5-flash-lite')).toBe(1000)
    expect(freeTierDailyLimit('gemini-2.5-pro')).toBe(100)
  })

  it('未知のモデルは undefined', () => {
    expect(freeTierDailyLimit('my-local-model')).toBeUndefined()
  })
})

describe('useUsage / todayCountOf', () => {
  it('record でモデルごとに今日の回数が増える', () => {
    const model = 'test-model'
    const before = todayCountOf(useUsage.getState(), model)
    useUsage.getState().record(model)
    useUsage.getState().record(model)
    expect(todayCountOf(useUsage.getState(), model)).toBe(before + 2)
    expect(useUsage.getState().date).toBe(pacificToday())
  })

  it('日付が変わっていたら 0 から数え直す', () => {
    expect(todayCountOf({ date: '2000-01-01', counts: { m: 42 } }, 'm')).toBe(0)
    expect(todayCountOf({ date: pacificToday(), counts: { m: 42 } }, 'm')).toBe(42)
  })
})
