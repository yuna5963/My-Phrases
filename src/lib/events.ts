// 学習ログの追記型イベント。フェーズ0の土台。
// 「いつ・どのモードで・何をしたか」を時系列で記録し、KPI・ゴール進捗・PDCAの材料にする。
// SRS進捗（progress）が「今の状態」なのに対し、events は「行動の履歴」。両者は補完関係。
import type { Grade } from '../types'

/** 記録するアクションの種類。 */
export type EventType = 'grade' | 'chat' | 'play' | 'materialize'

/** 採点が発生したモード（瞬間英作文・穴埋め等の内訳把握用）。 */
export type PracticeMode = 'daily' | 'compose' | 'cloze' | 'repro' | 'structure' | 'message'

interface BaseEvent {
  /** 一意ID（衝突しないランダム）。 */
  id: string
  /** 発生時刻（ISO datetime）。 */
  ts: string
  /** 発生日 YYYY-MM-DD（ローカル時刻）。日次集計のインデックスに使う。 */
  date: string
  type: EventType
}

/** 1チャンクを採点した（Daily/瞬間英作文/穴埋め/再現の唯一の関門 useDeck.grade から発火）。 */
export interface GradeEvent extends BaseEvent {
  type: 'grade'
  chunkId: string
  grade: Grade
  /** 採点前後の Leitner box。boxTo>=4 かつ boxFrom<4 なら「定着」に昇格した瞬間。 */
  boxFrom: number
  boxTo: number
  /** どのモードでの採点か（分からなければ省略）。 */
  mode?: PracticeMode
  /** 和訳表示→英文開示の中央値ms。Sentence Engine の起動レイテンシKPI
   *  （Clause launch latency）の材料。計測できた採点のみ持つ。 */
  latencyMs?: number
}

/** チャット練習を1セッション終えた（usedChunkIds はここで初めて永続化される）。 */
export interface ChatEvent extends BaseEvent {
  type: 'chat'
  targetChunkIds: string[]
  usedChunkIds: string[]
  /** ユーザーが送信したメッセージ数（アウトプット量の代理指標）。 */
  userMessageCount: number
}

/** 連続再生・長文音読で音声を再生した（最低ライン＝5分の判定材料）。 */
export interface PlayEvent extends BaseEvent {
  type: 'play'
  /** その再生セグメントの累計秒数。 */
  seconds: number
}

/** 表現ストックを教材化してデッキに追加した。 */
export interface MaterializeEvent extends BaseEvent {
  type: 'materialize'
  addedCount: number
}

export type LearningEvent = GradeEvent | ChatEvent | PlayEvent | MaterializeEvent

/** ランダムID（crypto.randomUUID があれば使い、無ければフォールバック）。 */
function newId(): string {
  const c = globalThis.crypto
  if (c && 'randomUUID' in c) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * イベント本体（type ごとのペイロード）から、id/ts/date を補って完成させる。
 * date は渡された ts を優先し、テスト時に固定できるよう now を引数化する。
 */
export function makeEvent<T extends LearningEvent['type']>(
  type: T,
  payload: Omit<Extract<LearningEvent, { type: T }>, 'id' | 'ts' | 'date' | 'type'>,
  now: Date = new Date(),
): Extract<LearningEvent, { type: T }> {
  const ts = now.toISOString()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return {
    id: newId(),
    ts,
    date: `${y}-${m}-${d}`,
    type,
    ...payload,
  } as Extract<LearningEvent, { type: T }>
}
