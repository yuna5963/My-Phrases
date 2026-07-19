import { describe, it, expect } from 'vitest'
import { makeEvent, type LearningEvent } from './events'
import {
  chatUsedRate,
  computeDailySummary,
  computeWeeklyStats,
  eventsInRange,
  eventsOn,
  gradeCount,
  minimumLineMet,
  outputCount,
  playSeconds,
  retainedPromotions,
} from './kpi'

const D = (s: string) => new Date(`${s}T09:00:00`)

function grade(date: string, chunkId: string, boxFrom: number, boxTo: number): LearningEvent {
  return makeEvent('grade', { chunkId, grade: 'good', boxFrom, boxTo }, D(date))
}
function chat(date: string, targets: string[], used: string[], msgs: number): LearningEvent {
  return makeEvent(
    'chat',
    { targetChunkIds: targets, usedChunkIds: used, userMessageCount: msgs },
    D(date),
  )
}
function play(date: string, seconds: number): LearningEvent {
  return makeEvent('play', { seconds }, D(date))
}

describe('eventsOn / eventsInRange', () => {
  const evs = [grade('2026-07-15', 'a', 0, 1), grade('2026-07-17', 'b', 0, 1)]
  it('filters by exact date', () => {
    expect(eventsOn(evs, '2026-07-15')).toHaveLength(1)
  })
  it('filters inclusive range', () => {
    expect(eventsInRange(evs, '2026-07-15', '2026-07-17')).toHaveLength(2)
    expect(eventsInRange(evs, '2026-07-16', '2026-07-17')).toHaveLength(1)
  })
})

describe('counts', () => {
  const evs = [
    grade('2026-07-17', 'a', 0, 1),
    grade('2026-07-17', 'b', 1, 2),
    chat('2026-07-17', ['a', 'b'], ['a'], 4),
    play('2026-07-17', 120),
  ]
  it('gradeCount counts grade events', () => {
    expect(gradeCount(evs)).toBe(2)
  })
  it('outputCount = grades + chat messages', () => {
    expect(outputCount(evs)).toBe(2 + 4)
  })
  it('playSeconds sums play events', () => {
    expect(playSeconds(evs)).toBe(120)
  })
})

describe('retainedPromotions', () => {
  it('counts unique chunks crossing into box>=4', () => {
    const evs = [
      grade('2026-07-17', 'a', 3, 4), // promoted
      grade('2026-07-17', 'a', 4, 5), // already retained, not counted again
      grade('2026-07-17', 'b', 2, 3), // not yet retained
      grade('2026-07-17', 'c', 3, 4), // promoted
    ]
    expect(retainedPromotions(evs)).toBe(2)
  })
})

describe('chatUsedRate', () => {
  it('aggregates used/target across sessions', () => {
    const evs = [chat('2026-07-17', ['a', 'b'], ['a'], 3), chat('2026-07-17', ['c', 'd'], ['c', 'd'], 5)]
    const r = chatUsedRate(evs)
    expect(r.used).toBe(3)
    expect(r.target).toBe(4)
    expect(r.rate).toBeCloseTo(0.75)
  })
  it('returns rate 0 when no targets', () => {
    expect(chatUsedRate([]).rate).toBe(0)
  })
})

describe('minimumLineMet', () => {
  it('met when a grade exists', () => {
    expect(minimumLineMet([grade('2026-07-17', 'a', 0, 1)])).toBe(true)
  })
  it('met when a chat session was completed (even 0 chunks used)', () => {
    expect(minimumLineMet([chat('2026-07-17', ['a'], [], 1)])).toBe(true)
  })
  it('met when play >= 5min even without grading', () => {
    expect(minimumLineMet([play('2026-07-17', 300)])).toBe(true)
  })
  it('not met with only short playback', () => {
    expect(minimumLineMet([play('2026-07-17', 299)])).toBe(false)
  })
  it('not met on empty day', () => {
    expect(minimumLineMet([])).toBe(false)
  })
})

describe('computeDailySummary', () => {
  it('summarizes a single day', () => {
    const evs = [
      grade('2026-07-17', 'a', 3, 4),
      chat('2026-07-17', ['a'], ['a'], 2),
      play('2026-07-17', 60),
      grade('2026-07-16', 'z', 0, 1), // other day, ignored
    ]
    const s = computeDailySummary(evs, '2026-07-17')
    expect(s.graded).toBe(1)
    expect(s.outputs).toBe(1 + 2)
    expect(s.playSeconds).toBe(60)
    expect(s.retained).toBe(1)
    expect(s.minimumMet).toBe(true)
  })
})

describe('computeWeeklyStats', () => {
  it('covers the 7-day window inclusive of `to`', () => {
    const evs = [
      grade('2026-07-11', 'old', 3, 4), // 8 days before -> outside
      grade('2026-07-12', 'a', 3, 4), // exactly 7th day back (to-6) -> inside
      chat('2026-07-17', ['a', 'b'], ['a'], 3),
    ]
    const w = computeWeeklyStats(evs, '2026-07-18')
    expect(w.from).toBe('2026-07-12')
    expect(w.to).toBe('2026-07-18')
    expect(w.retained).toBe(1) // only 'a' on 07-12
    expect(w.activeDays).toBe(2) // 07-12 and 07-17
    expect(w.chatUsedRate).toBeCloseTo(0.5)
  })
})
