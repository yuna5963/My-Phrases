// ゴール設定（北極星＝最終ゴール → 中間ゴールの梯子 → 小さな達成体験）。
// フェーズ0はアプリ内蔵プリセット。ユーザーはトラックを選ぶだけ。
// 各ステップの達成度は「今の状態（progress）＋学習ログ（events）」から算出する純粋関数で測る。
//
// 設計意図（v1.5.0 で構造優先へ改訂）: ボトルネックはチャンクの「量」でなく構造の「自動化」。
// よって序盤に構文の反射化（retainedStructures）と英語思考の起動速度（fastLaunchPct）を置き、
// チャンク量（retainedChunks）は土台として中盤に据える＝「量」から「速さ」への KPI 転換。
import type { Phrase, Progress } from '../types'
import type { LearningEvent } from './events'
import { RETAINED_BOX, chatUsedRate, eventsInRange } from './kpi'
import { isMastered, addDays, todayStr, MAX_BOX } from './srs'
import { isStructure, isSentenceEngine } from './sentenceEngine'
import { isLongReading } from './longReading'

/** ステップの達成度をどの指標で測るか。 */
export type GoalMetricKind =
  | 'retainedChunks' // box>=RETAINED_BOX の純チャンク数（Sentence Engine・長文音読を除外した土台）
  | 'retainedInCategory' // 特定カテゴリの定着チャンク数（例: Work）
  | 'retainedStructures' // box>=RETAINED_BOX の構文カード（type='Structure'）数＝反射化した型の数
  | 'masteredChunks' // box=MAX_BOX の習得済み純チャンク数（Sentence Engine・長文音読を除外）
  | 'fastLaunchPct' // 直近7日の起動レイテンシ付き採点のうち thresholdMs 以内だった割合（%）
  | 'totalOutputs' // 累計アウトプット数（採点＋チャット送信）
  | 'chatUsedRatePct' // 全チャットの平均実戦投入率（%）
  | 'chatSessions' // 完了したチャットセッション数

export interface GoalMetric {
  kind: GoalMetricKind
  /** retainedInCategory のときの対象カテゴリ（Phrase.category と一致）。 */
  category?: string
  /** fastLaunchPct のときの起動レイテンシしきい値（ms）。これ以内を「速い」と数える。 */
  thresholdMs?: number
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

// target 値・カテゴリ名は実デッキ（2026-07-18 エクスポート・488チャンク）の分布に合わせて較正した。
// 参考分布: Level=Basic 297 / Core 151 / Intermediate 33 / Advanced 7。
//   ビジネス系カテゴリ= Business transformation 29 / Work 23 / Business 11 / Career・Booth 10 …。
// retainedInCategory の target は「そのカテゴリの実在数」を超えないこと（超えると到達不能になる）。
// retainedStructures の target は内蔵 Sentence Engine デッキの構文16枚を超えないこと（同上）。
export const GOAL_TRACKS: GoalTrack[] = [
  {
    id: 'business',
    emoji: '💼',
    title: 'ビジネス英会話',
    northStar: 'ビジネスの場で、詰まらず自然に会話ができる',
    steps: [
      {
        id: 'biz-structure',
        title: '構文を反射で組み立てる',
        desc: '8系統の生成構文が考えずに出るようになった（16枚中12枚定着）',
        metric: { kind: 'retainedStructures' },
        target: 12,
      },
      {
        id: 'biz-launch5',
        title: '英語思考を5秒で起動',
        desc: '和訳や意味の骨子を見て5秒以内に英文を起動できた（直近7日の7割）',
        metric: { kind: 'fastLaunchPct', thresholdMs: 5000 },
        target: 70,
      },
      {
        id: 'biz-foundation',
        title: 'チャンクを無意識に組み立てる土台',
        desc: '考えなくても口から出るチャンクが50個そろった',
        metric: { kind: 'retainedChunks' },
        target: 50,
      },
      {
        id: 'biz-launch3',
        title: '反射を3秒に縮める',
        desc: '起動3秒以内が直近7日の6割に達した',
        metric: { kind: 'fastLaunchPct', thresholdMs: 3000 },
        target: 60,
      },
      {
        id: 'biz-chat',
        title: '会話で実際に使える',
        desc: '覚えたチャンクを会話で使える率が6割に達した',
        metric: { kind: 'chatUsedRatePct' },
        target: 60,
      },
      {
        id: 'biz-domain',
        title: 'ビジネス領域で戦える',
        // Business transformation はデッキ最大のビジネス系カテゴリ（29件）。20件=約7割の定着を狙う。
        desc: 'ビジネス変革の話題で定着したチャンクが20個そろった',
        metric: { kind: 'retainedInCategory', category: 'Business transformation' },
        target: 20,
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
        id: 'study-structure',
        title: '構文を反射で組み立てる',
        desc: '考えずに出る生成構文が10枚定着した',
        metric: { kind: 'retainedStructures' },
        target: 10,
      },
      {
        id: 'study-launch5',
        title: '英語思考を5秒で起動',
        desc: '和訳を見て5秒以内に英文を起動できた（直近7日の6割）',
        metric: { kind: 'fastLaunchPct', thresholdMs: 5000 },
        target: 60,
      },
      {
        id: 'study-foundation',
        title: 'チャンクを無意識に組み立てる土台',
        desc: '考えなくても口から出るチャンクが50個そろった',
        metric: { kind: 'retainedChunks' },
        target: 50,
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
        id: 'daily-structure',
        title: '基本の構文を反射で組み立てる',
        desc: '基本の生成構文が8枚定着した',
        metric: { kind: 'retainedStructures' },
        target: 8,
      },
      {
        id: 'daily-launch5',
        title: '英語思考を5秒で起動',
        desc: '和訳を見て5秒以内に英文を起動できた（直近7日の6割）',
        metric: { kind: 'fastLaunchPct', thresholdMs: 5000 },
        target: 60,
      },
      {
        id: 'daily-foundation',
        title: 'よく使うチャンクが口をつく',
        desc: '考えなくても出るチャンクが30個そろった',
        metric: { kind: 'retainedChunks' },
        target: 30,
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

/**
 * 直近7日（今日を含む）の、起動レイテンシを測れた採点のレイテンシ列。
 * fastLaunchPct の実測（measureStep）と次の一手の見積り（nextActions）で
 * 窓の定義がずれないよう、1か所に寄せている。
 */
export function recentLatencies(events: LearningEvent[]): number[] {
  const to = todayStr()
  const window = eventsInRange(events, addDays(to, -6), to)
  const lats: number[] = []
  for (const e of window) {
    if (e.type === 'grade' && typeof e.latencyMs === 'number') lats.push(e.latencyMs)
  }
  return lats
}

/** 1ステップの実測値を、現状（progress）と学習ログ（events）から算出する。 */
export function measureStep(
  metric: GoalMetric,
  ctx: { phrases: Phrase[]; progress: Record<string, Progress>; events: LearningEvent[] },
): number {
  const { phrases, progress, events } = ctx
  switch (metric.kind) {
    case 'retainedChunks': {
      // 純チャンクのみ（Sentence Engine の構文/意味ノード・長文音読を除外）。
      const ids = new Set(
        phrases.filter((p) => !isSentenceEngine(p) && !isLongReading(p)).map((p) => p.id),
      )
      return Object.values(progress).filter((p) => ids.has(p.id) && p.box >= RETAINED_BOX).length
    }
    case 'masteredChunks': {
      const ids = new Set(
        phrases.filter((p) => !isSentenceEngine(p) && !isLongReading(p)).map((p) => p.id),
      )
      return Object.values(progress).filter((p) => ids.has(p.id) && isMastered(p)).length
    }
    case 'retainedStructures': {
      const ids = new Set(phrases.filter(isStructure).map((p) => p.id))
      return Object.values(progress).filter((p) => ids.has(p.id) && p.box >= RETAINED_BOX).length
    }
    case 'retainedInCategory': {
      const ids = new Set(phrases.filter((p) => p.category === metric.category).map((p) => p.id))
      return Object.values(progress).filter((p) => ids.has(p.id) && p.box >= RETAINED_BOX).length
    }
    case 'fastLaunchPct': {
      // 直近7日（今日を含む）の、起動レイテンシを測れた採点のうち threshold 以内の割合。
      const threshold = metric.thresholdMs
      if (threshold === undefined) return 0
      const lats = recentLatencies(events)
      if (lats.length === 0) return 0
      const fast = lats.filter((ms) => ms <= threshold).length
      return Math.round((fast / lats.length) * 100)
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

export interface NextAction {
  emoji: string
  /** 「構文ドリルで『できた』をあと18回」のような、いま押せる具体的な一手。 */
  label: string
  /** 遷移先ルート。 */
  to: string
}

/**
 * 「あと何回『できた』を積めば、目標枚数だけ定着（box>=threshold）するか」の見積り。
 * 定着に近いカードから埋めるほうが現実的なので box の高い順に needCards 枚を選ぶ。
 * デッキに足りない分は満額（threshold）かかる想定で上乗せする。
 */
export function gradesToRetain(
  ids: Set<string>,
  progress: Record<string, Progress>,
  needCards: number,
  threshold: number = RETAINED_BOX,
): number {
  if (needCards <= 0) return 0
  const boxes: number[] = []
  for (const id of ids) {
    // progress 未登録＝一度も採点していない＝box 0 とみなす。
    const box = progress[id]?.box ?? 0
    if (box < threshold) boxes.push(box)
  }
  boxes.sort((a, b) => b - a)
  const picked = boxes.slice(0, needCards)
  const sum = picked.reduce((n, box) => n + (threshold - box), 0)
  const missing = needCards - picked.length
  return Math.max(needCards, sum + missing * threshold)
}

/**
 * 直近7日の「速い採点 fast / 計測できた採点 total」から、目標割合に届くまでに
 * あと何回速い採点を積めばよいかを求める。分母も一緒に増える点を織り込んだ式。
 * 測定データが無い（total=0）／目標100%以上のときは見積り不能で null。
 */
export function fastLaunchGradesNeeded(
  fast: number,
  total: number,
  targetPct: number,
): number | null {
  if (total === 0 || targetPct >= 100) return null
  if (total > 0 && (fast / total) * 100 >= targetPct) return 0
  const n = Math.ceil((targetPct * total - 100 * fast) / (100 - targetPct))
  return Math.max(1, n)
}

/**
 * 挑戦中のステップを進めるために「どの練習を何回やればいいか」を具体化する。
 * 進捗バーの数字（0/12）だけでは次の行動が分からないので、ホームの青枠の一番下に出す。
 */
export function nextActions(
  step: GoalStep,
  ctx: { phrases: Phrase[]; progress: Record<string, Progress>; events: LearningEvent[] },
): NextAction[] {
  const { phrases, progress, events } = ctx
  const metric = step.metric
  const current = measureStep(metric, ctx)
  const remaining = step.target - current
  if (remaining <= 0) return []

  // 純チャンク＝Sentence Engine・長文音読を除いた土台（measureStep と同じ集合）。
  const pureChunkIds = () =>
    new Set(phrases.filter((p) => !isSentenceEngine(p) && !isLongReading(p)).map((p) => p.id))

  switch (metric.kind) {
    case 'retainedStructures': {
      const ids = new Set(phrases.filter(isStructure).map((p) => p.id))
      const n = gradesToRetain(ids, progress, remaining)
      return [{ emoji: '🧱', label: `構文ドリルで「できた」をあと ${n} 回`, to: '/structure' }]
    }
    case 'retainedChunks': {
      const n = gradesToRetain(pureChunkIds(), progress, remaining)
      return [
        { emoji: '▶', label: `「今日の練習」で「できた」をあと ${n} 回`, to: '/daily' },
        { emoji: '⚡', label: '瞬間英作文でも同じチャンクを進められます', to: '/compose' },
      ]
    }
    case 'masteredChunks': {
      const n = gradesToRetain(pureChunkIds(), progress, remaining, MAX_BOX)
      return [{ emoji: '▶', label: `「今日の練習」で「できた」をあと ${n} 回`, to: '/daily' }]
    }
    case 'retainedInCategory': {
      const ids = new Set(phrases.filter((p) => p.category === metric.category).map((p) => p.id))
      const n = gradesToRetain(ids, progress, remaining)
      return [
        {
          emoji: '⚡',
          label: `${metric.category} のチャンクを瞬間英作文であと ${n} 回`,
          to: '/compose',
        },
      ]
    }
    case 'fastLaunchPct': {
      const thresholdMs = metric.thresholdMs ?? 5000
      const sec = thresholdMs / 1000
      const lats = recentLatencies(events)
      const n = fastLaunchGradesNeeded(
        lats.filter((ms) => ms <= thresholdMs).length,
        lats.length,
        step.target,
      )
      if (n === null)
        return [
          { emoji: '🧱', label: '構文ドリルで時間を測って練習（まずは10回）', to: '/structure' },
          { emoji: '🧠', label: '意味ノード生成でも計測されます', to: '/message' },
        ]
      return [
        { emoji: '🧱', label: `構文ドリルで${sec}秒以内の起動をあと ${n} 回`, to: '/structure' },
        { emoji: '🧠', label: '意味ノード生成でも同じくカウントされます', to: '/message' },
      ]
    }
    case 'chatSessions':
      return [{ emoji: '💬', label: `チャット練習をあと ${remaining} セッション`, to: '/chat' }]
    case 'chatUsedRatePct':
      return [
        {
          emoji: '💬',
          label: `チャット練習で狙ったチャンクを使う（いま ${current}% → 目標 ${step.target}%）`,
          to: '/chat',
        },
      ]
    case 'totalOutputs':
      return [{ emoji: '▶', label: `アウトプットをあと ${remaining} 回`, to: '/daily' }]
    default:
      return []
  }
}
