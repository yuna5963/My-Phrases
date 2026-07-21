import { useEffect, useMemo, useRef, useState } from 'react'
import type { Grade, Phrase } from '../types'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { buildSession, clusterByTypeCategory } from '../lib/session'
import { isLongReading } from '../lib/longReading'
import { isSentenceEngine } from '../lib/sentenceEngine'
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
  /**
   * 1セットの出題数。指定するとこの枚数ちょうど（プールが足りなければ全部）で列を作る。
   * 未指定なら従来どおり設定の sessionSize に従う。
   */
  setSize?: number
  /**
   * 弱かったカードを列末尾へ積み直すか（既定 true）。
   * セット制ドリルでは false にして枚数を固定する（弱いカードはSRSが当日再出題する）。
   */
  requeueWeak?: boolean
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
    setSize,
    requeueWeak = true,
  } = options
  const phrases = useDeck((s) => s.phrases)
  const grade = useDeck((s) => s.grade)
  const includeStatuses = useSettings((s) => s.includeStatuses)
  const sessionSize = useSettings((s) => s.sessionSize)

  // 長文音読・Sentence Engine（構文/意味ノード）は専用モードでのみ扱う。
  // ただし構文ドリル等は filter に isStructure などを渡して「あえて」出題する。
  // そのため base では長文音読だけを常時除外し、Sentence Engine は
  // filter 未指定（＝通常の既定プール）のときだけ除外する。
  const pool = useMemo(() => {
    const base = phrases.filter((p) => !isLongReading(p))
    return filter ? base.filter(filter) : base.filter((p) => !isSentenceEngine(p))
  }, [phrases, filter])

  const phraseById = useMemo(
    () => Object.fromEntries(pool.map((p) => [p.id, p])) as Record<string, Phrase>,
    [pool],
  )

  const buildQueue = () => {
    const progress = useDeck.getState().progress
    // セット制ドリルは setSize ちょうどで区切る（設定の sessionSize より優先）。
    const size = setSize ?? sessionSize
    let picked = buildSession(pool, progress, includeStatuses, size, {
      onlyUnsure,
    })
    if (picked.length === 0 && !noFallback) {
      const fallback = pool.filter(
        (p) =>
          (includeStatuses.length === 0 || includeStatuses.includes(p.status)) &&
          (!onlyUnsure || !progress[p.id]?.learned),
      )
      picked = shuffle(fallback).slice(0, size)
    }
    // セット制は「毎回きっちり setSize 枚」が達成感の土台。期日到来だけでは足りない
    // ときも、まだ選ばれていないカードからランダムに埋めて1セットの枚数を揃える。
    if (setSize != null && picked.length < size) {
      const chosen = new Set(picked.map((p) => p.id))
      const rest = pool.filter(
        (p) =>
          !chosen.has(p.id) &&
          (includeStatuses.length === 0 || includeStatuses.includes(p.status)) &&
          (!onlyUnsure || !progress[p.id]?.learned),
      )
      picked = [...picked, ...shuffle(rest).slice(0, size - picked.length)]
    }
    if (clusterByFacet) picked = clusterByTypeCategory(picked)
    let ids = picked.map((p) => p.id)
    if (shuffleOpt) ids = shuffle(ids)
    return ids.slice(0, size)
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

  async function answer(g: Grade, latencyMs?: number) {
    const id = queue[pos]
    if (!id) return
    await grade(id, g, mode, latencyMs)
    setTally((t) => ({ ...t, [g]: t[g] + 1 }))
    // re-show weak cards（セット制ドリルでは積み直さず、枚数を固定したままセットを終える）
    if (g !== 'good' && requeueWeak) setQueue((q) => [...q, id])
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
