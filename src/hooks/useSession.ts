import { useEffect, useMemo, useRef, useState } from 'react'
import type { Grade, Phrase } from '../types'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { buildSession, clusterByTypeCategory } from '../lib/session'
import { isLongReading } from '../lib/longReading'
import type { PracticeMode } from '../lib/events'

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

export interface SessionOptions {
  /** Restrict the practice pool, e.g. by sentence count. */
  filter?: (p: Phrase) => boolean
  /** ランダム順で出題する。 */
  shuffle?: boolean
  /** 「自信なし」=「覚えた」未チェックのみを対象にする。 */
  onlyUnsure?: boolean
  /**
   * 期日到来カードが0件のときのランダム出題（fallback）を行わない。
   * 「今日の練習」用: 0件なら空のまま返し、画面側で完了表示を出す。
   */
  noFallback?: boolean
  /**
   * 出題列を Type → Category でまとめ直す（瞬間英作文用）。
   * 同じタイプ・同じカテゴリのチャンクへ優先的に遷移する。
   */
  clusterByFacet?: boolean
  /** 採点ログに残す練習モード（KPIの内訳把握用）。 */
  mode?: PracticeMode
}

/**
 * Drives a practice run: holds the card queue, current position and tally.
 * Re-queues cards the user didn't fully nail so they reappear this session.
 * The queue is built once (from a deck snapshot) so grading mid-session
 * doesn't reshuffle the cards under the user.
 */
export function useSession(options: SessionOptions = {}) {
  const {
    filter,
    shuffle: shuffleOpt = false,
    onlyUnsure = false,
    noFallback = false,
    clusterByFacet = false,
    mode,
  } = options
  const phrases = useDeck((s) => s.phrases)
  const grade = useDeck((s) => s.grade)
  const includeStatuses = useSettings((s) => s.includeStatuses)
  const sessionSize = useSettings((s) => s.sessionSize)

  // 長文音読は専用モードでのみ扱うので、通常の練習プールからは常に除外する。
  const pool = useMemo(() => {
    const base = phrases.filter((p) => !isLongReading(p))
    return filter ? base.filter(filter) : base
  }, [phrases, filter])

  const phraseById = useMemo(
    () => Object.fromEntries(pool.map((p) => [p.id, p])) as Record<string, Phrase>,
    [pool],
  )

  const buildQueue = () => {
    const progress = useDeck.getState().progress
    let picked = buildSession(pool, progress, includeStatuses, sessionSize, {
      onlyUnsure,
    })
    if (picked.length === 0 && !noFallback) {
      const fallback = pool.filter(
        (p) =>
          (includeStatuses.length === 0 || includeStatuses.includes(p.status)) &&
          (!onlyUnsure || !progress[p.id]?.learned),
      )
      picked = shuffle(fallback).slice(0, sessionSize)
    }
    if (clusterByFacet) picked = clusterByTypeCategory(picked)
    let ids = picked.map((p) => p.id)
    if (shuffleOpt) ids = shuffle(ids)
    return ids
  }

  const [queue, setQueue] = useState<string[]>(buildQueue)
  const [pos, setPos] = useState(0)
  const [tally, setTally] = useState<Tally>({ good: 0, vague: 0, bad: 0 })

  // シャッフル / 自信なし の切り替えで出題を組み直す（初回マウントは初期化済みなので除外）。
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    setQueue(buildQueue())
    setPos(0)
    setTally({ good: 0, vague: 0, bad: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffleOpt, onlyUnsure])

  const current = queue[pos] ? phraseById[queue[pos]] : null
  const empty = queue.length === 0
  const done = !empty && pos >= queue.length

  // 採点せずにカードを前後に送る（フレーズ再生と同じ「← 戻る / 進む →」用）。
  // 末尾を越えて done には進めない（採点でのみセッションを終える）。
  const canPrev = pos > 0
  const canNext = pos < queue.length - 1
  const goPrev = () => setPos((p) => Math.max(0, p - 1))
  const goNext = () => setPos((p) => Math.min(queue.length - 1, p + 1))

  async function answer(g: Grade) {
    const id = queue[pos]
    if (!id) return
    await grade(id, g, mode)
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
    canPrev,
    canNext,
    goPrev,
    goNext,
  }
}
