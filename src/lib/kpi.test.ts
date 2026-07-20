import { describe, it, expect } from 'vitest'
import { makeEvent, type LearningEvent } from './events'
import {
  chatUsedRate,
  computeDailySummary,
  computeWeeklyStats,
  eventsInRange,
  eventsOn,
  gradeCount,
  launchLatencyMedian,
  minimumLineMet,
  outputCount,
  playSeconds,
  retainedPromotions,
} from './kpi'

const D = (s: string) => new Date(`${s}T09:00:00`)

function grade(date: string, chunkId: string, boxFrom: number, boxTo: number): LearningEvent {
  return makeEvent('grade', { chunkId, grade: 'good', boxFrom, boxTo }, D(date))
}
function gradeLatency(date: string, chunkId: string, latencyMs: number): LearningEvent {
  return makeEvent(
    'grade',
    { chunkId, grade: 'good', boxFrom: 0, boxTo: 1, mode: 'structure', latencyMs },
    D(date),
  )
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
function think(date: string, nodeCount: number, sentenceCount: number, savedCard: boolean): LearningEvent {
  return makeEvent('think', { nodeCount, sentenceCount, savedCard }, D(date))
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
  it('outputCount also adds think sentence counts', () => {
    const withThink = [...evs, think('2026-07-17', 3, 3, true)]
    expect(outputCount(withThink)).toBe(2 + 4 + 3)
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
  it('met when an English-thinking session was completed', () => {
    expect(minimumLineMet([think('2026-07-17', 2, 2, false)])).toBe(true)
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

describe('launchLatencyMedian', () => {
  it('returns null when there are no latency-tagged grades', () => {
    expect(launchLatencyMedian([])).toBeNull()
    // latencyMs の無い grade は対象外
    expect(launchLatencyMedian([grade('2026-07-17', 'a', 0, 1)])).toBeNull()
  })
  it('takes the middle value for an odd count', () => {
    const evs = [
      gradeLatency('2026-07-17', 'a', 5000),
      gradeLatency('2026-07-17', 'b', 2000),
      gradeLatency('2026-07-17', 'c', 3000),
    ]
    expect(launchLatencyMedian(evs)).toBe(3000)
  })
  it('averages the middle two for an even count', () => {
    const evs = [
      gradeLatency('2026-07-17', 'a', 2000),
      gradeLatency('2026-07-17', 'b', 4000),
      gradeLatency('2026-07-17', 'c', 6000),
      gradeLatency('2026-07-17', 'd', 8000),
    ]
    expect(launchLatencyMedian(evs)).toBe(5000) // (4000+6000)/2
  })
  it('ignores grades without latencyMs mixed in', () => {
    const evs = [
      grade('2026-07-17', 'x', 0, 1), // latencyMs 無し → 除外
      gradeLatency('2026-07-17', 'a', 3000),
      gradeLatency('2026-07-17', 'b', 5000),
    ]
    expect(launchLatencyMedian(evs)).toBe(4000) // (3000+5000)/2、除外後は2件
  })
})

describe('computeDailySummary', () => {
  it('summarizes a single day', () => {
    const evs = [
      grade('2026-07-17', 'a', 3, 4),
      chat('2026-07-17', ['a'], ['a'], 2),
      play('2026-07-17', 60),
      gradeLatency('2026-07-17', 'q', 4000),
      grade('2026-07-16', 'z', 0, 1), // other day, ignored
    ]
    const s = computeDailySummary(evs, '2026-07-17')
    expect(s.graded).toBe(2) // grade + gradeLatency
    expect(s.outputs).toBe(2 + 2)
    expect(s.playSeconds).toBe(60)
    expect(s.retained).toBe(1)
    expect(s.minimumMet).toBe(true)
    expect(s.latencyMedianMs).toBe(4000)
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
