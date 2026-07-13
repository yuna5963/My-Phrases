// Gemini API 無料枠の「残り目安」表示のための、端末内リクエストカウンタ。
// Google の API は残クォータを返さないため、このアプリから送った回数を
// localStorage で日次集計して目安を出す（他端末・AI Studio での消費は含まれない）。
// 無料枠の1日上限は太平洋時間の深夜（日本時間の夕方ごろ）にリセットされる。
import { create } from 'zustand'

/** 無料枠リセットの基準となる、太平洋時間での今日の日付（YYYY-MM-DD）。 */
export function pacificToday(now = new Date()): string {
  try {
    // en-CA ロケールは YYYY-MM-DD 形式を返す。
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now)
  } catch {
    // タイムゾーンDBが無い環境ではローカル日付で代用（目安表示なので許容）。
    return now.toISOString().slice(0, 10)
  }
}

/**
 * モデルの無料枠 RPD（1日あたりリクエスト数）の目安。
 * Google が予告なく変更するため、あくまで参考値。未知のモデルは undefined。
 */
export function freeTierDailyLimit(model: string): number | undefined {
  const m = model.toLowerCase()
  if (m.includes('gemma')) return 14400
  if (m.includes('flash') && m.includes('lite')) return 1000
  if (m.includes('flash')) return 250
  if (m.includes('pro')) return 100
  return undefined
}

interface UsageState {
  /** counts を集計した日（太平洋時間）。日付が変わったら 0 から数え直す。 */
  date: string
  /** モデル名 → 今日送ったリクエスト数。 */
  counts: Record<string, number>
  record: (model: string) => void
}

const STORAGE_KEY = 'my-phrases-usage'

function loadInitial(): Pick<UsageState, 'date' | 'counts'> {
  const empty = { date: pacificToday(), counts: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as { date?: unknown; counts?: unknown }
    if (parsed.date !== pacificToday() || typeof parsed.counts !== 'object' || !parsed.counts)
      return empty
    return { date: parsed.date, counts: parsed.counts as Record<string, number> }
  } catch {
    // localStorage が無い環境（テスト等）や壊れたデータはメモリ内カウントのみ。
    return empty
  }
}

function save(state: Pick<UsageState, 'date' | 'counts'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 保存できなくても致命的ではない（目安表示のため）。
  }
}

export const useUsage = create<UsageState>()((set) => ({
  ...loadInitial(),
  record: (model) =>
    set((s) => {
      const today = pacificToday()
      const counts = s.date === today ? { ...s.counts } : {}
      counts[model] = (counts[model] ?? 0) + 1
      const next = { date: today, counts }
      save(next)
      return next
    }),
}))

/** 今日このアプリから送ったリクエスト数（日付が変わっていれば 0）。 */
export function todayCountOf(state: Pick<UsageState, 'date' | 'counts'>, model: string): number {
  return state.date === pacificToday() ? (state.counts[model] ?? 0) : 0
}
