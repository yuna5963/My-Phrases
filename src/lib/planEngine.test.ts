import { describe, it, expect } from 'vitest'
import { buildPlan, planItemDone } from './planEngine'
import { makeEvent } from './events'

describe('buildPlan', () => {
  it('tired = 流し聞きだけ（最低ラインの入口）', () => {
    const p = buildPlan('tired', { due: 12, hasChatKey: true })
    expect(p.items.map((i) => i.kind)).toEqual(['play'])
  })

  it('normal = 構文ドリル → 今日の練習（構造優先）、期日件数を文面に反映', () => {
    const p = buildPlan('normal', { due: 8, hasChatKey: true })
    expect(p.items.map((i) => i.kind)).toEqual(['structure', 'daily'])
    expect(p.items[0].route).toBe('/structure')
    expect(p.items[1].detail).toContain('8枚')
  })

  it('期日0なら今日の練習は追加練習の案内に切り替わる', () => {
    const p = buildPlan('normal', { due: 0, hasChatKey: true })
    const daily = p.items.find((i) => i.kind === 'daily')!
    expect(daily.detail).toContain('追加練習')
  })

  it('fresh = 構文ドリル → 今日の練習 → 意味ノード生成 → チャット（キーあり）', () => {
    const p = buildPlan('fresh', { due: 5, hasChatKey: true })
    expect(p.items.map((i) => i.kind)).toEqual(['structure', 'daily', 'message', 'chat'])
  })

  it('fresh でキー未設定なら意味ノード生成まで（3項目・チャット無し）', () => {
    const p = buildPlan('fresh', { due: 5, hasChatKey: false })
    expect(p.items.map((i) => i.kind)).toEqual(['structure', 'daily', 'message'])
    expect(p.items[2].route).toBe('/message')
  })
})

const D = (s: string) => new Date(`${s}T09:00:00`)

describe('planItemDone', () => {
  const gradeDaily = makeEvent(
    'grade',
    { chunkId: 'a', grade: 'good', boxFrom: 0, boxTo: 1, mode: 'daily' },
    D('2026-07-19'),
  )
  const gradeCompose = makeEvent(
    'grade',
    { chunkId: 'b', grade: 'good', boxFrom: 0, boxTo: 1, mode: 'compose' },
    D('2026-07-19'),
  )
  const gradeStructure = makeEvent(
    'grade',
    { chunkId: 'str-01', grade: 'good', boxFrom: 0, boxTo: 1, mode: 'structure' },
    D('2026-07-19'),
  )
  const gradeMessage = makeEvent(
    'grade',
    { chunkId: 'msg-01', grade: 'good', boxFrom: 0, boxTo: 1, mode: 'message' },
    D('2026-07-19'),
  )
  const chat = makeEvent(
    'chat',
    { targetChunkIds: ['a'], usedChunkIds: ['a'], userMessageCount: 3 },
    D('2026-07-19'),
  )
  const play4 = makeEvent('play', { seconds: 240 }, D('2026-07-19'))
  const play6 = makeEvent('play', { seconds: 360 }, D('2026-07-19'))

  it('daily/compose は該当モードの採点だけで達成（相互に独立）', () => {
    expect(planItemDone('daily', [gradeDaily])).toBe(true)
    expect(planItemDone('compose', [gradeDaily])).toBe(false) // 今日の練習だけでは瞬間英作文は未達成
    expect(planItemDone('compose', [gradeCompose])).toBe(true)
    expect(planItemDone('daily', [gradeCompose])).toBe(false)
    expect(planItemDone('daily', [])).toBe(false)
  })

  it('structure/message は該当モードの採点だけで達成（相互に独立）', () => {
    expect(planItemDone('structure', [gradeStructure])).toBe(true)
    expect(planItemDone('structure', [gradeMessage])).toBe(false)
    expect(planItemDone('structure', [gradeDaily])).toBe(false)
    expect(planItemDone('message', [gradeMessage])).toBe(true)
    expect(planItemDone('message', [gradeStructure])).toBe(false)
    expect(planItemDone('message', [])).toBe(false)
  })

  it('chat は会話完了イベントがあれば達成', () => {
    expect(planItemDone('chat', [chat])).toBe(true)
    expect(planItemDone('chat', [gradeDaily])).toBe(false)
  })

  it('play は再生5分以上で達成（未満は未達成）', () => {
    expect(planItemDone('play', [play6])).toBe(true)
    expect(planItemDone('play', [play4])).toBe(false)
    expect(planItemDone('play', [play4, play4])).toBe(true) // 合算 480s
  })
})
