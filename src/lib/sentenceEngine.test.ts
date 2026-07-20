import { describe, expect, it } from 'vitest'
import { createLatencyMeter, STRUCTURE_TYPE, MESSAGE_TYPE } from './sentenceEngine'
import seedData from '../../public/data/sentence-engine.json'
import type { Phrase } from '../types'

const seed = seedData as unknown as Phrase[]

describe('createLatencyMeter', () => {
  it('shown→revealed の各区間から中央値を出す（奇数個）', () => {
    const m = createLatencyMeter()
    m.shown(0)
    m.revealed(100) // 100
    m.shown(200)
    m.revealed(500) // 300
    m.shown(1000)
    m.revealed(1200) // 200
    // [100, 200, 300] の中央値
    expect(m.median()).toBe(200)
  })

  it('開示せず shown が連続したら前の計測は破棄する', () => {
    const m = createLatencyMeter()
    m.shown(0)
    m.shown(50) // 前の shown(0) は破棄され、ここが基点になる
    m.revealed(100) // 50
    expect(m.median()).toBe(50)
  })

  it('shown を経ていない revealed は無視する', () => {
    const m = createLatencyMeter()
    m.revealed(100) // shown なし → 無視
    expect(m.median()).toBeUndefined()
    m.shown(0)
    m.revealed(30) // 30
    m.revealed(999) // 直前の revealed で基点が消えているので無視
    expect(m.median()).toBe(30)
  })

  it('reset で区間リストが空に戻る', () => {
    const m = createLatencyMeter()
    m.shown(0)
    m.revealed(100)
    expect(m.median()).toBe(100)
    m.reset()
    expect(m.median()).toBeUndefined()
  })

  it('偶数個なら中央2値の平均', () => {
    const m = createLatencyMeter()
    m.shown(0)
    m.revealed(10) // 10
    m.shown(0)
    m.revealed(20) // 20
    m.shown(0)
    m.revealed(30) // 30
    m.shown(0)
    m.revealed(40) // 40
    // [10, 20, 30, 40] → (20 + 30) / 2
    expect(m.median()).toBe(25)
  })

  it('0件なら undefined', () => {
    expect(createLatencyMeter().median()).toBeUndefined()
  })
})

describe('sentence-engine.json（seed 教材）', () => {
  it('全28枚・IDは一意', () => {
    expect(seed).toHaveLength(28)
    const ids = seed.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('type は Structure / Message のみ・内訳は 16 / 12', () => {
    const structures = seed.filter((p) => p.type === STRUCTURE_TYPE)
    const messages = seed.filter((p) => p.type === MESSAGE_TYPE)
    expect(structures).toHaveLength(16)
    expect(messages).toHaveLength(12)
    // Structure/Message 以外の type は存在しない
    expect(structures.length + messages.length).toBe(seed.length)
  })

  it('全カードが en / ja を持つ（非空）', () => {
    for (const p of seed) {
      expect(p.en.trim()).not.toBe('')
      expect(p.ja.trim()).not.toBe('')
    }
  })

  it('Structure: id は str-NN 形式・examples は 1〜5 個で各 en/ja 非空', () => {
    const structures = seed.filter((p) => p.type === STRUCTURE_TYPE)
    for (const p of structures) {
      expect(p.id).toMatch(/^str-\d{2}$/)
      expect(p.examples.length).toBeGreaterThanOrEqual(1)
      expect(p.examples.length).toBeLessThanOrEqual(5)
      for (const ex of p.examples) {
        expect(ex.en.trim()).not.toBe('')
        expect(ex.ja.trim()).not.toBe('')
      }
    }
  })

  it('Message: id は msg-NN 形式・examples は空配列', () => {
    const messages = seed.filter((p) => p.type === MESSAGE_TYPE)
    for (const p of messages) {
      expect(p.id).toMatch(/^msg-\d{2}$/)
      expect(p.examples).toEqual([])
    }
  })
})
