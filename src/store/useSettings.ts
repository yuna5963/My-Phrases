import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SettingsState {
  voiceURI: string | null
  rate: number
  autoPlay: boolean
  sessionSize: number
  includeStatuses: string[] // Notion statuses to include in practice
  setVoiceURI: (v: string | null) => void
  setRate: (r: number) => void
  setAutoPlay: (b: boolean) => void
  setSessionSize: (n: number) => void
  toggleStatus: (s: string) => void
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
    }),
    { name: 'my-phrases-settings' },
  ),
)
