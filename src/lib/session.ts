import type { Phrase, Progress } from '../types'
import { isDue, isMastered, isNew, todayStr } from './srs'
import { isLongReading } from './longReading'

export interface DeckStats {
  total: number
  due: number
  newCount: number
  mastered: number
  studiedToday: number
}

function included(p: Phrase, statuses: string[]): boolean {
  return statuses.length === 0 || statuses.includes(p.status)
}

/**
 * Build today's practice queue: due cards (incl. new), filtered by status,
 * ordered by box (lower = weaker first) then due date, capped at `size`.
 */
export function buildSession(
  phrases: Phrase[],
  progress: Record<string, Progress>,
  statuses: string[],
  size: number,
  opts: { onlyUnsure?: boolean } = {},
): Phrase[] {
  const { onlyUnsure = false } = opts
  const ref = todayStr()
  const due = phrases.filter((p) => {
    const pr = progress[p.id]
    if (!pr || !included(p, statuses)) return false
    // 「自信なし」=「覚えた」未チェックのみを対象にする。
    if (onlyUnsure && pr.learned) return false
    return isDue(pr, ref) && !isMastered(pr)
  })
  due.sort((a, b) => {
    const pa = progress[a.id]
    const pb = progress[b.id]
    if (pa.box !== pb.box) return pa.box - pb.box
    return pa.due < pb.due ? -1 : 1
  })
  return due.slice(0, size)
}

export function computeStats(
  phrases: Phrase[],
  progress: Record<string, Progress>,
  statuses: string[],
): DeckStats {
  const ref = todayStr()
  let due = 0
  let newCount = 0
  let mastered = 0
  let studiedToday = 0
  let total = 0
  for (const p of phrases) {
    if (isLongReading(p) || !included(p, statuses)) continue
    const pr = progress[p.id]
    if (!pr) continue
    total++
    if (isMastered(pr)) mastered++
    else if (isDue(pr, ref)) due++
    if (isNew(pr)) newCount++
    if (pr.lastSeen.slice(0, 10) === ref) studiedToday++
  }
  return { total, due, newCount, mastered, studiedToday }
}
