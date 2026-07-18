import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayTracker } from './playTracker'

describe('createPlayTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes the elapsed seconds on stop', () => {
    const flush = vi.fn()
    const t = createPlayTracker(flush)
    vi.advanceTimersByTime(12_000)
    t.stop()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(12)
  })

  it('drops segments shorter than minSeconds on stop (誤タップの数秒)', () => {
    const flush = vi.fn()
    const t = createPlayTracker(flush)
    vi.advanceTimersByTime(3_000) // < 5s default
    t.stop()
    expect(flush).not.toHaveBeenCalled()
  })

  it('flushes periodically so long sessions are not lost', () => {
    const flush = vi.fn()
    const t = createPlayTracker(flush)
    vi.advanceTimersByTime(60_000)
    expect(flush).toHaveBeenCalledWith(60)
    vi.advanceTimersByTime(60_000)
    expect(flush).toHaveBeenCalledTimes(2)
    // 途中 flush 後の残り30秒は stop で flush される。
    vi.advanceTimersByTime(30_000)
    t.stop()
    expect(flush).toHaveBeenCalledTimes(3)
    expect(flush).toHaveBeenLastCalledWith(30)
  })

  it('ignores repeated stop calls', () => {
    const flush = vi.fn()
    const t = createPlayTracker(flush)
    vi.advanceTimersByTime(10_000)
    t.stop()
    t.stop()
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('does not flush after stop even if timers fire', () => {
    const flush = vi.fn()
    const t = createPlayTracker(flush)
    vi.advanceTimersByTime(10_000)
    t.stop()
    vi.advanceTimersByTime(120_000)
    expect(flush).toHaveBeenCalledTimes(1)
  })
})
