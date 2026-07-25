// 学習ログ（LearningEvent[]）から KPI を集計する純粋関数群。
// IndexedDB には触れず、渡されたイベント配列だけで計算する（テスト容易・UIから独立）。
import type { LearningEvent, PlayEvent } from './events'
import { addDays, todayStr } from './srs'

/** 最低ライン達成に必要な連続再生の秒数（5分）。再生のみの日でもこの秒数を超えれば継続扱い。 */
export const MIN_LINE_PLAY_SECONDS = 300

/** box がこの値以上になったチャンクを「定着」とみなす（isMastered=MAX_BOX とは別の中間指標）。 */
export const RETAINED_BOX = 4

/** 指定日（YYYY-MM-DD）のイベントだけ抜き出す。 */
export function eventsOn(events: LearningEvent[], date: string): LearningEvent[] {
  return events.filter((e) => e.date === date)
}

/** from 以上 to 以下（両端含む）の日付のイベントを抜き出す。 */
export function eventsInRange(events: LearningEvent[], from: string, to: string): LearningEvent[] {
  return events.filter((e) => e.date >= from && e.date <= to)
}

/** 採点回数（Daily/瞬間英作文/穴埋め/再現の総回答数）。 */
export function gradeCount(events: LearningEvent[]): number {
  return events.filter((e) => e.type === 'grade').length
}

/** チャットで送信したメッセージ総数。 */
export function chatMessageCount(events: LearningEvent[]): number {
  let n = 0
  for (const e of events) if (e.type === 'chat') n += e.userMessageCount
  return n
}

/** 意味ノード英語思考で組み立てた英文の総数。 */
export function thinkSentenceCount(events: LearningEvent[]): number {
  let n = 0
  for (const e of events) if (e.type === 'think') n += e.sentenceCount
  return n
}

/**
 * アウトプット数 = 採点回答数 ＋ チャット送信数 ＋ 英語思考の英文数。
 * 「実際に発話した数」はマイク無しで測れないため、能動的に英語を作った回数の代理指標。
 */
export function outputCount(events: LearningEvent[]): number {
  return gradeCount(events) + chatMessageCount(events) + thinkSentenceCount(events)
}

/** 連続再生の合計秒数。 */
export function playSeconds(events: LearningEvent[]): number {
  let s = 0
  for (const e of events) if (e.type === 'play') s += (e as PlayEvent).seconds
  return s
}

/**
 * この期間に「定着（box>=RETAINED_BOX）」へ昇格したユニークなチャンク数。
 * 同じチャンクが複数回昇格イベントを出しても1として数える。
 */
export function retainedPromotions(events: LearningEvent[]): number {
  const ids = new Set<string>()
  for (const e of events) {
    if (e.type === 'grade' && e.boxFrom < RETAINED_BOX && e.boxTo >= RETAINED_BOX) {
      ids.add(e.chunkId)
    }
  }
  return ids.size
}

/**
 * チャット実戦投入率。対象チャンクのうち会話で実際に使えた割合（期間内の全チャットセッション合算）。
 * 対象が1つも無ければ rate=0 を返す。
 */
export function chatUsedRate(events: LearningEvent[]): { used: number; target: number; rate: number } {
  let used = 0
  let target = 0
  for (const e of events) {
    if (e.type === 'chat') {
      used += e.usedChunkIds.length
      target += e.targetChunkIds.length
    }
  }
  return { used, target, rate: target === 0 ? 0 : used / target }
}

/**
 * その日が「最低ライン」を満たしたか（ゼロの日を作らせないストリーク判定）。
 * 採点・チャット・英語思考が1件でもあれば達成。無くても連続再生が5分を超えていれば達成。
 */
export function minimumLineMet(dayEvents: LearningEvent[]): boolean {
  const active = dayEvents.some(
    (e) => e.type === 'grade' || e.type === 'chat' || e.type === 'think',
  )
  return active || playSeconds(dayEvents) >= MIN_LINE_PLAY_SECONDS
}

/**
 * 起動レイテンシ（Clause launch latency）の中央値ms。
 * latencyMs を持つ grade イベント（Sentence Engine の2ドリルが記録）の
 * latencyMs 群の中央値。偶数個なら中央2値の平均。1件も無ければ null。
 * 「和訳を見た瞬間に英語の骨格へ飛び込めるか」の反応速度を測る材料。
 */
export function launchLatencyMedian(events: LearningEvent[]): number | null {
  const xs: number[] = []
  for (const e of events) {
    if (e.type === 'grade' && typeof e.latencyMs === 'number') xs.push(e.latencyMs)
  }
  if (xs.length === 0) return null
  xs.sort((a, b) => a - b)
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid]
}

/** 予測（開示前のJOL）と結果（開示後の採点）のズレ。過信の度合いを測る。 */
export interface Calibration {
  /** 「言える」と予測した件数と、そのうち実際に good だった率（0..1）。 */
  can: { total: number; hit: number; rate: number }
  /** 「あやしい」と予測した件数と、そのうち実際に good だった率（0..1）。 */
  unsure: { total: number; hit: number; rate: number }
  /** 予測付きの採点の総数（これが少ないうちは率を信用しない）。 */
  sample: number
}

/**
 * 較正（calibration）＝「言える」という自己予測が実際どれだけ当たっているか。
 *
 * 自己採点は答えを見た後に押すので、後知恵バイアスで甘くなる。開示**前**の予測と
 * 開示後の結果を突き合わせれば、その甘さを外から数値化できる。
 * can.rate が低い＝過信。can.rate が 1.0 に張り付く＝出題が簡単すぎる。
 * predicted を持たない採点（コミットゲートOFF時）は母数から除外する。
 */
export function calibration(events: LearningEvent[]): Calibration {
  let canTotal = 0
  let canHit = 0
  let unsureTotal = 0
  let unsureHit = 0
  for (const e of events) {
    if (e.type !== 'grade' || !e.predicted) continue
    const hit = e.grade === 'good'
    if (e.predicted === 'can') {
      canTotal++
      if (hit) canHit++
    } else {
      unsureTotal++
      if (hit) unsureHit++
    }
  }
  // 0件のときは率を 0 で返す（呼び出し側は sample を見て表示可否を決める）。
  return {
    can: { total: canTotal, hit: canHit, rate: canTotal === 0 ? 0 : canHit / canTotal },
    unsure: {
      total: unsureTotal,
      hit: unsureHit,
      rate: unsureTotal === 0 ? 0 : unsureHit / unsureTotal,
    },
    sample: canTotal + unsureTotal,
  }
}

export interface DailySummary {
  date: string
  graded: number
  outputs: number
  playSeconds: number
  retained: number
  minimumMet: boolean
  /** 当日の起動レイテンシ中央値ms（計測付き採点が無ければ null）。 */
  latencyMedianMs: number | null
}

/** ホーム「今日のあゆみ」用の日次サマリー。 */
export function computeDailySummary(events: LearningEvent[], date: string = todayStr()): DailySummary {
  const today = eventsOn(events, date)
  return {
    date,
    graded: gradeCount(today),
    outputs: outputCount(today),
    playSeconds: playSeconds(today),
    retained: retainedPromotions(today),
    minimumMet: minimumLineMet(today),
    latencyMedianMs: launchLatencyMedian(today),
  }
}

export interface WeeklyStats {
  from: string
  to: string
  retained: number
  outputs: number
  chatUsedRate: number
  activeDays: number
}

/** 直近7日（to を含む）の週次サマリー。 */
export function computeWeeklyStats(events: LearningEvent[], to: string = todayStr()): WeeklyStats {
  const from = addDays(to, -6)
  const window = eventsInRange(events, from, to)
  const days = new Set<string>()
  for (const e of window) if (minimumLineMet(eventsOn(window, e.date))) days.add(e.date)
  return {
    from,
    to,
    retained: retainedPromotions(window),
    outputs: outputCount(window),
    chatUsedRate: chatUsedRate(window).rate,
    activeDays: days.size,
  }
}
