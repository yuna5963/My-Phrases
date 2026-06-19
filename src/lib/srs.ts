import type { Grade, Progress } from '../types'

export const MAX_BOX = 5

// Days until a card is due again, indexed by Leitner box (0..MAX_BOX).
const INTERVALS = [0, 1, 3, 7, 16, 45]

/** Local-time date string YYYY-MM-DD. */
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayStr(d)
}

export function newProgress(id: string): Progress {
  return { id, box: 0, due: todayStr(), correct: 0, wrong: 0, lastSeen: '', learned: false }
}

/** Apply a self-grade and return the updated progress (SRS scheduling). */
export function applyGrade(p: Progress, grade: Grade): Progress {
  let box = p.box
  let { correct, wrong } = p
  let intervalDays: number

  if (grade === 'good') {
    box = Math.min(MAX_BOX, box + 1)
    correct += 1
    intervalDays = INTERVALS[box]
  } else if (grade === 'vague') {
    // Keep the box but re-show soon.
    intervalDays = 1
  } else {
    box = 0
    wrong += 1
    intervalDays = INTERVALS[0] // due today again
  }

  return {
    ...p,
    box,
    correct,
    wrong,
    due: addDays(todayStr(), intervalDays),
    lastSeen: new Date().toISOString(),
  }
}

export function isDue(p: Progress, ref: string = todayStr()): boolean {
  return p.due <= ref
}

export function isMastered(p: Progress): boolean {
  return p.box >= MAX_BOX
}

export function isNew(p: Progress): boolean {
  return p.lastSeen === ''
}
