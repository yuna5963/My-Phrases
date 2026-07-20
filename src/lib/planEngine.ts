// 「今日のプラン」= 開始摩擦をなくすための当日メニュー編成（学習OS化フェーズ1）。
// 体調（3択）から、今日やる候補アクションをルールベースで組む純関数。強制ではなく提案。
// IndexedDB・UIには触れない（テスト容易・画面から独立）。
import type { LearningEvent } from './events'
import { MIN_LINE_PLAY_SECONDS, playSeconds } from './kpi'

/** 当日の体調。プランの重さを決める唯一の入力。 */
export type Energy = 'tired' | 'normal' | 'fresh'

export const ENERGIES: { id: Energy; icon: string; label: string }[] = [
  { id: 'tired', icon: '😴', label: '疲れてる' },
  { id: 'normal', icon: '🙂', label: '普通' },
  { id: 'fresh', icon: '💪', label: '余裕あり' },
]

/** プランを構成する1アクション。route はタップ時の遷移先。 */
export interface PlanItem {
  id: string
  icon: string
  label: string
  detail: string
  route: string
  /** 実施済み判定に使う種別（当日の学習ログと突き合わせる）。 */
  kind: 'play' | 'daily' | 'chat' | 'compose' | 'structure' | 'message'
}

export interface DailyPlan {
  energy: Energy
  /** 方針・励ましの一言（強制しない文言）。 */
  note: string
  items: PlanItem[]
}

export interface PlanContext {
  /** 今日の期日到来カード数（0なら追加練習の案内に切り替える）。 */
  due: number
  /** チャットAPIキーが設定済みか（未設定なら会話の代わりに瞬間英作文を勧める）。 */
  hasChatKey: boolean
}

function dailyItem(due: number): PlanItem {
  return {
    id: 'daily',
    icon: '▶',
    label: '今日の練習',
    detail: due > 0 ? `期日の${due}枚を習熟度に合わせて出題` : '追加練習（今日の期日は完了）',
    route: '/daily',
    kind: 'daily',
  }
}

function playItem(): PlanItem {
  return {
    id: 'play',
    icon: '🎧',
    label: '連続再生で流し聞き',
    detail: '5分でも今日の最低ラインに届きます',
    route: '/browse',
    kind: 'play',
  }
}

function structureItem(): PlanItem {
  return {
    id: 'structure',
    icon: '🧱',
    label: '構文ドリル',
    detail: '構造の反射化。まず組立ラインから',
    route: '/structure',
    kind: 'structure',
  }
}

function messageItem(): PlanItem {
  return {
    id: 'message',
    icon: '🧠',
    label: '意味ノード生成',
    detail: '意味の骨子から英文を組み立てる',
    route: '/message',
    kind: 'message',
  }
}

function chatItem(): PlanItem {
  return {
    id: 'chat',
    icon: '💬',
    label: 'チャット練習を1本',
    detail: '覚えたチャンクを会話で実際に使う',
    route: '/chat',
    kind: 'chat',
  }
}

/**
 * 体調から当日メニューを編成する（Sentence Engine 導入後は「構造優先」に）。
 * - tired: 流し聞きだけ（ゼロの日を作らせない最低ライン）
 * - normal: 構文ドリル → 今日の練習（まず型の反射化、そのあと期日ぶん）
 * - fresh: 構文ドリル → 今日の練習 → 意味ノード生成 →（キーあれば）会話
 *   キー無しの fresh は意味ノード生成までの3項目。
 */
export function buildPlan(energy: Energy, ctx: PlanContext): DailyPlan {
  if (energy === 'tired') {
    return { energy, note: '今日は無理しない日。これだけでも続いています。', items: [playItem()] }
  }
  if (energy === 'normal') {
    return {
      energy,
      note: 'まず構文の反射化から。そのあと期日ぶんを。',
      items: [structureItem(), dailyItem(ctx.due)],
    }
  }
  const items = [structureItem(), dailyItem(ctx.due), messageItem()]
  if (ctx.hasChatKey) items.push(chatItem())
  return {
    energy,
    note: '余裕がある日。構造から意味の組み立て、実戦投入まで一気に。',
    items,
  }
}

/**
 * プラン項目が「今日すでに実施済み」か（当日の学習ログから判定）。
 * daily / compose は**そのモードでの採点**が1件でもあれば達成（採点ログの mode で区別する。
 * 今日の練習だけをやっても瞬間英作文は未達成のまま）。chat は会話完了、play は再生5分以上。
 */
export function planItemDone(kind: PlanItem['kind'], todayEvents: LearningEvent[]): boolean {
  switch (kind) {
    case 'daily':
      return todayEvents.some((e) => e.type === 'grade' && e.mode === 'daily')
    case 'compose':
      return todayEvents.some((e) => e.type === 'grade' && e.mode === 'compose')
    case 'structure':
      return todayEvents.some((e) => e.type === 'grade' && e.mode === 'structure')
    case 'message':
      return todayEvents.some((e) => e.type === 'grade' && e.mode === 'message')
    case 'chat':
      return todayEvents.some((e) => e.type === 'chat')
    case 'play':
      return playSeconds(todayEvents) >= MIN_LINE_PLAY_SECONDS
    default:
      return false
  }
}
