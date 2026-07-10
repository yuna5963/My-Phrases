// チャット練習のまとめで気に入った「追加候補の表現」を端末に蓄積するストック。
// 数日分ためて PC でまとめて例文作成 → Notion へ、という運用のための一時置き場。
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalize } from '../lib/chunkMatch'
import { todayStr } from '../lib/srs'

export interface StockItem {
  en: string
  ja: string
  addedAt: string // YYYY-MM-DD
}

interface StockState {
  items: StockItem[]
  add: (s: { en: string; ja: string }) => void
  remove: (en: string) => void
  clear: () => void
}

/** 表記ゆれ（大文字小文字・記号）を吸収した重複判定キー。 */
export function stockKey(en: string): string {
  return normalize(en)
}

export const useStock = create<StockState>()(
  persist(
    (set) => ({
      items: [],
      add: (s) =>
        set((state) => {
          const key = stockKey(s.en)
          if (!key || state.items.some((i) => stockKey(i.en) === key)) return state
          return { items: [{ en: s.en, ja: s.ja, addedAt: todayStr() }, ...state.items] }
        }),
      remove: (en) =>
        set((state) => ({
          items: state.items.filter((i) => stockKey(i.en) !== stockKey(en)),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: 'my-phrases-stock' },
  ),
)
