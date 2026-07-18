// ゴール設定（北極星＝最終ゴール → 中間ゴールの梯子 → 小さな達成体験）。
// フェーズ0はアプリ内蔵プリセット。ユーザーはトラックを選ぶだけ。
// 各ステップの達成度は「今の状態（progress）＋学習ログ（events）」から算出する純粋関数で測る。
import type { Phrase, Progress } from '../types'
import type { LearningEvent } from './events'
import { RETAINED_BOX, chatUsedRate } from './kpi'
import { isMastered } from './srs'

/** ステップの達成度をどの指標で測るか。 */
export type GoalMetricKind =
  | 'retainedChunks' // box>=RETAINED_BOX のチャンク数（無意識に出せる土台）
  | 'retainedInCategory' // 特定カテゴリの定着チャンク数（例: Work）
  | 'masteredChunks' // box=MAX_BOX の習得済みチャンク数
  | 'totalOutputs' // 累計アウトプット数（採点＋チャット送信）
  | 'chatUsedRatePct' // 全チャットの平均実戦投入率（%）
  | 'chatSessions' // 完了したチャットセッション数

export interface GoalMetric {
  kind: GoalMetricKind
  /** retainedInCategory のときの対象カテゴリ（Phrase.category と一致）。 */
  category?: string
}

export interface GoalStep {
  id: string
  title: string
  /** 達成したときに「近づいた」と実感させる一言。 */
  desc: string
  metric: GoalMetric
  target: number
}

export interface GoalTrack {
  id: 'business' | 'study' | 'daily'
  emoji: string
  title: string
  /** 最終ゴール（北極星）。 */
  northStar: string
  steps: GoalStep[]
}

// 注: target 値・カテゴリ名は暫定ドラフト。実データ（phrases.json のカテゴリ分布）に合わせて要調整。
export const GOAL_TRACKS: GoalTrack[] = [
  {
    id: 'business',
    emoji: '💼',
    title: 'ビジネス英会話',
    northStar: 'ビジネスの場で、詰まらず自然に会話ができる',
    steps: [
      {
        id: 'biz-foundation',
        title: 'チャンクを無意識に組み立てる土台',
        desc: '考えなくても口から出るチャンクが50個そろった',
        metric: { kind: 'retainedChunks' },
        target: 50,
      },
      {
        id: 'biz-output',
        title: '瞬間英作文で止まらない',
        desc: '英語を能動的に組み立てた回数が300回を超えた',
        metric: { kind: 'totalOutputs' },
        target: 300,
      },
      {
        id: 'biz-chat',
        title: '会話で実際に使える',
        desc: '覚えたチャンクを会話で使える率が6割に達した',
        metric: { kind: 'chatUsedRatePct' },
        target: 60,
      },
      {
        id: 'biz-work',
        title: '仕事の話題で戦える',
        desc: 'Work分野の定着チャンクが80個そろった',
        metric: { kind: 'retainedInCategory', category: 'Work' },
        target: 80,
      },
    ],
  },
  {
    id: 'study',
    emoji: '🎓',
    title: '留学・アカデミック',
    northStar: '留学先で授業・生活の英語に不自由しない',
    steps: [
      {
        id: 'study-foundation',
        title: 'チャンクを無意識に組み立てる土台',
        desc: '考えなくても口から出るチャンクが50個そろった',
        metric: { kind: 'retainedChunks' },
        target: 50,
      },
      {
        id: 'study-output',
        title: '言いたいことを英語にできる',
        desc: '英語を能動的に組み立てた回数が250回を超えた',
        metric: { kind: 'totalOutputs' },
        target: 250,
      },
      {
        id: 'study-chat',
        title: '会話のキャッチボールが続く',
        desc: 'チャット練習を10セッション完走した',
        metric: { kind: 'chatSessions' },
        target: 10,
      },
      {
        id: 'study-mastered',
        title: '幅広い話題に対応',
        desc: '完全習得したチャンクが100個そろった',
        metric: { kind: 'masteredChunks' },
        target: 100,
      },
    ],
  },
  {
    id: 'daily',
    emoji: '🗣️',
    title: '日常会話',
    northStar: '日常のやりとりを気負わず英語でこなせる',
    steps: [
      {
        id: 'daily-foundation',
        title: 'よく使うチャンクが口をつく',
        desc: '考えなくても出るチャンクが30個そろった',
        metric: { kind: 'retainedChunks' },
        target: 30,
      },
      {
        id: 'daily-output',
        title: '短い文をどんどん作れる',
        desc: '英語を能動的に組み立てた回数が150回を超えた',
        metric: { kind: 'totalOutputs' },
        target: 150,
      },
      {
        id: 'daily-chat',
        title: 'あいさつ・雑談ができる',
        desc: '覚えたチャンクを会話で使える率が5割に達した',
        metric: { kind: 'chatUsedRatePct' },
        target: 50,
      },
    ],
  },
]

export function getTrack(id: string): GoalTrack | undefined {
  return GOAL_TRACKS.find((t) => t.id === id)
}

/** 1ステップの実測値を、現状（progress）と学習ログ（events）から算出する。 */
export function measureStep(
  metric: GoalMetric,
  ctx: { phrases: Phrase[]; progress: Record<string, Progress>; events: LearningEvent[] },
): number {
  const { phrases, progress, events } = ctx
  switch (metric.kind) {
    case 'retainedChunks':
      return Object.values(progress).filter((p) => p.box >= RETAINED_BOX).length
    case 'masteredChunks':
      return Object.values(progress).filter((p) => isMastered(p)).length
    case 'retainedInCategory': {
      const ids = new Set(phrases.filter((p) => p.category === metric.category).map((p) => p.id))
      return Object.values(progress).filter((p) => ids.has(p.id) && p.box >= RETAINED_BOX).length
    }
    case 'totalOutputs':
      return events.reduce(
        (n, e) =>
          e.type === 'grade' ? n + 1 : e.type === 'chat' ? n + e.userMessageCount : n,
        0,
      )
    case 'chatSessions':
      return events.filter((e) => e.type === 'chat').length
    case 'chatUsedRatePct':
      return Math.round(chatUsedRate(events).rate * 100)
    default:
      return 0
  }
}

export interface StepProgress {
  step: GoalStep
  current: number
  done: boolean
}

export interface TrackProgress {
  track: GoalTrack
  steps: StepProgress[]
  /** 現在挑戦中（未達の最初の）ステップ。全達成なら null。 */
  currentStep: StepProgress | null
  doneCount: number
  /** ゴール全体の達成率 0..1（達成ステップ数 ＋ 挑戦中ステップの部分進捗）。 */
  ratio: number
}

/**
 * トラック全体の進捗を計算する。ホームの一等地（進捗バー）に出す主データ。
 * ratio は「達成済みステップ数 ＋ 挑戦中ステップの部分進捗」を総ステップ数で割った値。
 */
export function computeTrackProgress(
  track: GoalTrack,
  ctx: { phrases: Phrase[]; progress: Record<string, Progress>; events: LearningEvent[] },
): TrackProgress {
  const steps: StepProgress[] = track.steps.map((step) => {
    const current = measureStep(step.metric, ctx)
    return { step, current, done: current >= step.target }
  })
  const doneCount = steps.filter((s) => s.done).length
  const currentStep = steps.find((s) => !s.done) ?? null
  const partial = currentStep
    ? Math.min(1, currentStep.step.target === 0 ? 1 : currentStep.current / currentStep.step.target)
    : 0
  const ratio = steps.length === 0 ? 0 : (doneCount + partial) / steps.length
  return { track, steps, currentStep, doneCount, ratio }
}
