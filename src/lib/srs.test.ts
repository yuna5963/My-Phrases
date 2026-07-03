import { describe, expect, it } from 'vitest'
import { addDays, applyGrade, isDue, isMastered, isNew, newProgress, todayStr } from './srs'

describe('applyGrade', () => {
  it('good で box が1つ上がり、間隔が伸びる', () => {
    const next = applyGrade(newProgress('a'), 'good')
    expect(next.box).toBe(1)
    expect(next.correct).toBe(1)
    expect(next.due).toBe(addDays(todayStr(), 1))
    expect(isNew(next)).toBe(false)
  })

  it('good を重ねても box は 5 で頭打ち（習得済み）', () => {
    let p = newProgress('a')
    for (let i = 0; i < 8; i++) p = applyGrade(p, 'good')
    expect(p.box).toBe(5)
    expect(isMastered(p)).toBe(true)
    expect(p.due).toBe(addDays(todayStr(), 45))
  })

  it('vague は box を維持して翌日に再出題', () => {
    const p = { ...newProgress('a'), box: 3 }
    const next = applyGrade(p, 'vague')
    expect(next.box).toBe(3)
    expect(next.correct).toBe(0)
    expect(next.wrong).toBe(0)
    expect(next.due).toBe(addDays(todayStr(), 1))
  })

  it('bad は box 0 に戻して今日再出題', () => {
    const p = { ...newProgress('a'), box: 4 }
    const next = applyGrade(p, 'bad')
    expect(next.box).toBe(0)
    expect(next.wrong).toBe(1)
    expect(next.due).toBe(todayStr())
    expect(isDue(next)).toBe(true)
  })
})
