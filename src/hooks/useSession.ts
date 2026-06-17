import { useMemo, useState } from 'react'
import type { Grade, Phrase } from '../types'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { buildSession } from '../lib/session'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface Tally {
  good: number
  vague: number
  bad: number
}

/**
 * Drives a practice run: holds the card queue, current position and tally.
 * Re-queues cards the user didn't fully nail so they reappear this session.
 * The queue is built once (from a deck snapshot) so grading mid-session
 * doesn't reshuffle the cards under the user.
 */
export function useSession() {
  const phrases = useDeck((s) => s.phrases)
  const grade = useDeck((s) => s.grade)
  const includeStatuses = useSettings((s) => s.includeStatuses)
  const sessionSize = useSettings((s) => s.sessionSize)

  const phraseById = useMemo(
    () => Object.fromEntries(phrases.map((p) => [p.id, p])) as Record<string, Phrase>,
    [phrases],
  )

  const buildQueue = () => {
    const progress = useDeck.getState().progress
    let ids = buildSession(phrases, progress, includeStatuses, sessionSize).map((p) => p.id)
    if (ids.length === 0) {
      const pool = phrases.filter(
        (p) => includeStatuses.length === 0 || includeStatuses.includes(p.status),
      )
      ids = shuffle(pool)
        .slice(0, sessionSize)
        .map((p) => p.id)
    }
    return ids
  }

  const [queue, setQueue] = useState<string[]>(buildQueue)
  const [pos, setPos] = useState(0)
  const [tally, setTally] = useState<Tally>({ good: 0, vague: 0, bad: 0 })

  const current = queue[pos] ? phraseById[queue[pos]] : null
  const empty = queue.length === 0
  const done = !empty && pos >= queue.length

  async function answer(g: Grade) {
    const id = queue[pos]
    if (!id) return
    await grade(id, g)
    setTally((t) => ({ ...t, [g]: t[g] + 1 }))
    if (g !== 'good') setQueue((q) => [...q, id]) // re-show weak cards
    setPos((p) => p + 1)
  }

  function restart() {
    setQueue(buildQueue())
    setPos(0)
    setTally({ good: 0, vague: 0, bad: 0 })
  }

  return {
    current,
    pos,
    total: queue.length,
    tally,
    done,
    empty,
    answer,
    restart,
  }
}
