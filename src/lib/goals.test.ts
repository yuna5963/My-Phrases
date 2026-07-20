import { describe, it, expect } from 'vitest'
import type { Phrase, Progress } from '../types'
import { makeEvent, type LearningEvent } from './events'
import { GOAL_TRACKS, computeTrackProgress, getTrack, measureStep } from './goals'
import { addDays, newProgress, todayStr } from './srs'

function phrase(id: string, category: string, type: string = 'Chunk'): Phrase {
  return {
    id,
    en: id,
    ja: id,
    examples: [],
    type,
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

  // 構造優先の梯子（v1.5.0）: 序盤に構文の反射化と起動速度、量は中盤。
  it('business ladder is structure-first (id order + target)', () => {
    const biz = getTrack('business')!
    expect(biz.steps.map((s) => s.id)).toEqual([
      'biz-structure',
      'biz-launch5',
      'biz-foundation',
      'biz-launch3',
      'biz-chat',
      'biz-domain',
    ])
    expect(biz.steps.map((s) => s.target)).toEqual([12, 70, 50, 60, 60, 20])
    expect(biz.steps.map((s) => s.metric.kind)).toEqual([
      'retainedStructures',
      'fastLaunchPct',
      'retainedChunks',
      'fastLaunchPct',
      'chatUsedRatePct',
      'retainedInCategory',
    ])
    // 起動レイテンシしきい値: 序盤5秒 → 後段3秒。
    expect(biz.steps[1].metric.thresholdMs).toBe(5000)
    expect(biz.steps[3].metric.thresholdMs).toBe(3000)
  })
  it('study ladder is structure-first (id order + target)', () => {
    const study = getTrack('study')!
    expect(study.steps.map((s) => s.id)).toEqual([
      'study-structure',
      'study-launch5',
      'study-foundation',
      'study-chat',
      'study-mastered',
    ])
    expect(study.steps.map((s) => s.target)).toEqual([10, 60, 50, 10, 100])
  })
  it('daily ladder is structure-first (id order + target)', () => {
    const daily = getTrack('daily')!
    expect(daily.steps.map((s) => s.id)).toEqual([
      'daily-structure',
      'daily-launch5',
      'daily-foundation',
      'daily-chat',
    ])
    expect(daily.steps.map((s) => s.target)).toEqual([8, 60, 30, 50])
  })
  it('no track uses the retired totalOutputs metric', () => {
    for (const t of GOAL_TRACKS)
      for (const s of t.steps) expect(s.metric.kind).not.toBe('totalOutputs')
  })
  it('retainedStructures targets never exceed the built-in 16 structure cards', () => {
    for (const t of GOAL_TRACKS)
      for (const s of t.steps)
        if (s.metric.kind === 'retainedStructures') expect(s.target).toBeLessThanOrEqual(16)
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

  it('retainedChunks excludes Structure / Message / Long Reading', () => {
    // 4種すべて box>=4。純チャンクは1枚だけ。
    const mixed = [
      phrase('c1', 'Work', 'Chunk'),
      phrase('s1', 'Work', 'Structure'),
      phrase('m1', 'Work', 'Message'),
      phrase('l1', 'Work', 'Long Reading'),
    ]
    const progress = toMap([prog('c1', 4), prog('s1', 4), prog('m1', 4), prog('l1', 4)])
    const ctx = { phrases: mixed, progress, events: [] }
    expect(measureStep({ kind: 'retainedChunks' }, ctx)).toBe(1)
    expect(measureStep({ kind: 'masteredChunks' }, ctx)).toBe(0)
  })

  it('retainedStructures counts only Structure cards, not chunks', () => {
    const mixed = [
      phrase('s1', 'Work', 'Structure'),
      phrase('s2', 'Work', 'Structure'),
      phrase('c1', 'Work', 'Chunk'),
      phrase('m1', 'Work', 'Message'),
    ]
    // s2 は box3（未定着）→ 数えない。s1 のみ定着。
    const progress = toMap([prog('s1', 4), prog('s2', 3), prog('c1', 5), prog('m1', 5)])
    const ctx = { phrases: mixed, progress, events: [] }
    expect(measureStep({ kind: 'retainedStructures' }, ctx)).toBe(1)
  })
})

describe('measureStep fastLaunchPct', () => {
  // 直近7日の起動レイテンシ付き採点のうち threshold 以内の割合（%）。
  const today = new Date()
  const old = new Date(Date.now() - 10 * 86400000) // 10日前＝窓の外
  const grade = (latencyMs: number | undefined, when: Date) =>
    makeEvent('grade', { chunkId: 'x', grade: 'good', boxFrom: 0, boxTo: 1, latencyMs }, when)
  const events: LearningEvent[] = [
    grade(2000, today),
    grade(4000, today),
    grade(8000, today),
    grade(3000, today),
    makeEvent('grade', { chunkId: 'x', grade: 'good', boxFrom: 0, boxTo: 1 }, today), // latency 無し→分母外
    grade(1000, old), // 窓の外→対象外
  ]
  const ctx = { phrases: [], progress: {}, events }

  it('5秒しきい値: 4件中3件が速い→75%', () => {
    expect(measureStep({ kind: 'fastLaunchPct', thresholdMs: 5000 }, ctx)).toBe(75)
  })
  it('3秒しきい値: 4件中2件が速い→50%', () => {
    expect(measureStep({ kind: 'fastLaunchPct', thresholdMs: 3000 }, ctx)).toBe(50)
  })
  it('対象イベント0件なら0', () => {
    expect(
      measureStep({ kind: 'fastLaunchPct', thresholdMs: 5000 }, { phrases: [], progress: {}, events: [] }),
    ).toBe(0)
  })
  it('latencyMs 無しの grade は分母に入らない', () => {
    // latency 付きは1件（速い）だけ→100%。latency 無しの grade が分母に入るなら 50% になるはず。
    const only: LearningEvent[] = [
      grade(1000, today),
      makeEvent('grade', { chunkId: 'y', grade: 'good', boxFrom: 0, boxTo: 1 }, today),
    ]
    expect(
      measureStep({ kind: 'fastLaunchPct', thresholdMs: 5000 }, { phrases: [], progress: {}, events: only }),
    ).toBe(100)
  })
  it('窓の外（7日より前）の採点は数えない', () => {
    const onlyOld: LearningEvent[] = [grade(1000, old)]
    expect(
      measureStep(
        { kind: 'fastLaunchPct', thresholdMs: 5000 },
        { phrases: [], progress: {}, events: onlyOld },
      ),
    ).toBe(0)
  })
})

describe('computeTrackProgress', () => {
  const track = getTrack('daily')!
  it('is 0 with no data and points at the first step', () => {
    const ctx = { phrases: [], progress: {}, events: [] }
    const tp = computeTrackProgress(track, ctx)
    expect(tp.doneCount).toBe(0)
    expect(tp.ratio).toBe(0)
    expect(tp.currentStep?.step.id).toBe('daily-structure')
  })
  it('counts a completed step and partial progress on the next', () => {
    // daily-structure(target 8 構文定着) を満たし、daily-launch5(target 60) を部分達成にする。
    const phrases = Array.from({ length: 8 }, (_, i) => phrase(`s${i}`, 'Work', 'Structure'))
    const progress = toMap(Array.from({ length: 8 }, (_, i) => prog(`s${i}`, 4)))
    // 直近の grade 10件: 3件だけ速い(2000ms) → fastLaunchPct=30% < 60 → 部分 0.5。
    const events: LearningEvent[] = Array.from({ length: 10 }, (_, i) =>
      makeEvent('grade', {
        chunkId: 'x',
        grade: 'good',
        boxFrom: 0,
        boxTo: 1,
        latencyMs: i < 3 ? 2000 : 8000,
      }),
    )
    const tp = computeTrackProgress(track, { phrases, progress, events })
    expect(tp.steps[0].done).toBe(true) // structure met
    expect(tp.currentStep?.step.id).toBe('daily-launch5') // next: 起動5秒 60%
    expect(tp.steps[1].current).toBe(30)
    // 1 done of 4 steps + 30/60 partial = (1 + 0.5)/4 = 0.375
    expect(tp.ratio).toBeCloseTo(0.375)
  })
})

// todayStr / addDays を使う窓計算が実時間に依存しないことの軽い保証（回帰用の目印）。
describe('date window sanity', () => {
  it('7日窓は今日を含み6日前から', () => {
    const to = todayStr()
    expect(addDays(to, -6) <= to).toBe(true)
  })
})
