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
  kind: 'play' | 'daily' | 'chat' | 'compose'
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

function chatOrComposeItem(hasChatKey: boolean): PlanItem {
  return hasChatKey
    ? {
        id: 'chat',
        icon: '💬',
        label: 'チャット練習を1本',
        detail: '覚えたチャンクを会話で実際に使う',
        route: '/chat',
        kind: 'chat',
      }
    : {
        id: 'compose',
        icon: '⚡',
        label: '瞬間英作文',
        detail: '日本語→英語で即アウトプット（チャットはAPIキー設定後）',
        route: '/compose',
        kind: 'compose',
      }
}

/**
 * 体調から当日メニューを編成する。
 * - tired: 流し聞きだけ（ゼロの日を作らせない最低ライン）
 * - normal: 今日の練習
 * - fresh: 今日の練習 ＋ 会話（キーが無ければ瞬間英作文）
 */
export function buildPlan(energy: Energy, ctx: PlanContext): DailyPlan {
  if (energy === 'tired') {
    return { energy, note: '今日は無理しない日。これだけでも続いています。', items: [playItem()] }
  }
  if (energy === 'normal') {
    return { energy, note: '今日の期日ぶんをこなしましょう。', items: [dailyItem(ctx.due)] }
  }
  return {
    energy,
    note: '余裕がある日。アウトプットまで一気に。',
    items: [dailyItem(ctx.due), chatOrComposeItem(ctx.hasChatKey)],
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
    case 'chat':
      return todayEvents.some((e) => e.type === 'chat')
    case 'play':
      return playSeconds(todayEvents) >= MIN_LINE_PLAY_SECONDS
    default:
      return false
  }
}
