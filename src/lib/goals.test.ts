import { describe, it, expect } from 'vitest'
import type { Phrase, Progress } from '../types'
import { makeEvent, type LearningEvent } from './events'
import { GOAL_TRACKS, computeTrackProgress, getTrack, measureStep } from './goals'
import { newProgress } from './srs'

function phrase(id: string, category: string): Phrase {
  return {
    id,
    en: id,
    ja: id,
    examples: [],
    type: 'Chunk',
    category,
    level: 'Core',
    priority: '★★★',
    note: '',
    status: '進行中',
    createdTime: '',
  }
}
function prog(id: string, box: number): Progress {
  return { ...newProgress(id), box }
}
function toMap(list: Progress[]): Record<string, Progress> {
  return Object.fromEntries(list.map((p) => [p.id, p]))
}

describe('GOAL_TRACKS presets', () => {
  it('has the three tracks with non-empty ladders', () => {
    expect(GOAL_TRACKS.map((t) => t.id)).toEqual(['business', 'study', 'daily'])
    for (const t of GOAL_TRACKS) expect(t.steps.length).toBeGreaterThan(0)
  })
  it('getTrack finds by id', () => {
    expect(getTrack('business')?.title).toBe('ビジネス英会話')
    expect(getTrack('nope')).toBeUndefined()
  })
})

describe('measureStep', () => {
  const phrases = [phrase('a', 'Work'), phrase('b', 'Work'), phrase('c', 'Health')]
  const progress = toMap([prog('a', 4), prog('b', 5), prog('c', 4)])
  const events: LearningEvent[] = [
    makeEvent('grade', { chunkId: 'a', grade: 'good', boxFrom: 3, boxTo: 4 }),
    makeEvent('chat', { targetChunkIds: ['a', 'b'], usedChunkIds: ['a'], userMessageCount: 5 }),
  ]
  const ctx = { phrases, progress, events }

  it('retainedChunks counts box>=4', () => {
    expect(measureStep({ kind: 'retainedChunks' }, ctx)).toBe(3)
  })
  it('masteredChunks counts box=MAX', () => {
    expect(measureStep({ kind: 'masteredChunks' }, ctx)).toBe(1)
  })
  it('retainedInCategory scopes to category', () => {
    expect(measureStep({ kind: 'retainedInCategory', category: 'Work' }, ctx)).toBe(2)
  })
  it('totalOutputs = grades + chat messages', () => {
    expect(measureStep({ kind: 'totalOutputs' }, ctx)).toBe(1 + 5)
  })
  it('chatSessions counts chat events', () => {
    expect(measureStep({ kind: 'chatSessions' }, ctx)).toBe(1)
  })
  it('chatUsedRatePct rounds the ratio', () => {
    expect(measureStep({ kind: 'chatUsedRatePct' }, ctx)).toBe(50)
  })
})

describe('computeTrackProgress', () => {
  const track = getTrack('daily')!
  it('is 0 with no data and points at the first step', () => {
    const ctx = { phrases: [], progress: {}, events: [] }
    const tp = computeTrackProgress(track, ctx)
    expect(tp.doneCount).toBe(0)
    expect(tp.ratio).toBe(0)
    expect(tp.currentStep?.step.id).toBe('daily-foundation')
  })
  it('counts a completed step and partial progress on the next', () => {
    // daily-foundation target is 30 retained chunks -> give 30, plus some outputs.
    const progress = toMap(Array.from({ length: 30 }, (_, i) => prog(`p${i}`, 4)))
    const events: LearningEvent[] = Array.from({ length: 75 }, () =>
      makeEvent('grade', { chunkId: 'x', grade: 'good', boxFrom: 0, boxTo: 1 }),
    )
    const tp = computeTrackProgress(track, { phrases: [], progress, events })
    expect(tp.steps[0].done).toBe(true) // foundation met
    expect(tp.currentStep?.step.id).toBe('daily-output') // next: 150 outputs
    // 1 done of 3 steps + 75/150 partial = (1 + 0.5)/3 = 0.5
    expect(tp.ratio).toBeCloseTo(0.5)
  })
})
