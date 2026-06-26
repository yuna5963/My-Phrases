import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SettingsState {
  voiceURI: string | null
  rate: number
  autoPlay: boolean
  sessionSize: number
  includeStatuses: string[] // Notion statuses to include in practice
  // フレーズ一覧の連続再生プレイヤー設定
  repeat: boolean // 最後まで再生したら先頭へ戻る
  shuffle: boolean // ランダム順で再生
  speakPhrase: boolean // フレーズ（英語）を読み上げる
  speakExample: boolean // 例文（英語）を読み上げる
  speakJa: boolean // 日本語訳も読み上げる
  setVoiceURI: (v: string | null) => void
  setRate: (r: number) => void
  setAutoPlay: (b: boolean) => void
  setSessionSize: (n: number) => void
  toggleStatus: (s: string) => void
  setRepeat: (b: boolean) => void
  setShuffle: (b: boolean) => void
  setSpeakPhrase: (b: boolean) => void
  setSpeakExample: (b: boolean) => void
  setSpeakJa: (b: boolean) => void
}

export const ALL_STATUSES = ['未着手', '進行中', '完了']

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      voiceURI: null,
      rate: 0.9,
      autoPlay: true,
      sessionSize: 20,
      includeStatuses: [...ALL_STATUSES],
      repeat: false,
      shuffle: false,
      speakPhrase: true,
      speakExample: true,
      speakJa: false,
      setVoiceURI: (voiceURI) => set({ voiceURI }),
      setRate: (rate) => set({ rate }),
      setAutoPlay: (autoPlay) => set({ autoPlay }),
      setSessionSize: (sessionSize) => set({ sessionSize }),
      toggleStatus: (s) =>
        set((state) => ({
          includeStatuses: state.includeStatuses.includes(s)
            ? state.includeStatuses.filter((x) => x !== s)
            : [...state.includeStatuses, s],
        })),
      setRepeat: (repeat) => set({ repeat }),
      setShuffle: (shuffle) => set({ shuffle }),
      setSpeakPhrase: (speakPhrase) => set({ speakPhrase }),
      setSpeakExample: (speakExample) => set({ speakExample }),
      setSpeakJa: (speakJa) => set({ speakJa }),
    }),
    { name: 'my-phrases-settings' },
  ),
)
