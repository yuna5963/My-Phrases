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

/**
 * 出題列を Type → Category でまとめ直す（瞬間英作文用）。
 * 同じタイプ・同じカテゴリのチャンクが続けて出るので、表現のまとまりで練習できる。
 * グループの順序は元の並び（弱い順）での初出順、グループ内も元の並びを保つ。
 */
export function clusterByTypeCategory(list: Phrase[]): Phrase[] {
  // Map は挿入順を保持するので、初出順のグループ化にそのまま使える。
  const byType = new Map<string, Map<string, Phrase[]>>()
  for (const p of list) {
    const catMap = byType.get(p.type) ?? new Map<string, Phrase[]>()
    if (!byType.has(p.type)) byType.set(p.type, catMap)
    const arr = catMap.get(p.category) ?? []
    if (!catMap.has(p.category)) catMap.set(p.category, arr)
    arr.push(p)
  }
  const out: Phrase[] = []
  for (const catMap of byType.values()) for (const arr of catMap.values()) out.push(...arr)
  return out
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
