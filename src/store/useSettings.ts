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
  showKana: boolean // 英文の下にシラブル音節カナを表示する
  // 【実験的】連続再生中にほぼ無音の音声をループ再生し、画面オフでも読み上げ継続を試みる
  bgPlayback: boolean
  // チャット練習（AI英語コーチ）
  chatApiKey: string // Gemini API キー（この端末の localStorage にのみ保存）
  chatModel: string // OpenAI互換エンドポイントに渡すモデル名
  chatFeedbackJa: boolean // コーチの解説・フィードバックを日本語にする
  chatTargetCount: number // 1セッションで狙うチャンク数
  /** ネイティブアプリで、アプリ内の🎤ボタンを使う（既定 false＝キーボードのマイクを案内する）。 */
  inAppMic: boolean
  /** 開示前に「言えた／あやしい」を申告させる（検索コミットゲート。既定 true）。 */
  commitGate: boolean
  /** 申告のかわりに英語を声に出して答える（コミットゲートON時のみ。既定 false）。 */
  voiceAnswer: boolean
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
  setShowKana: (b: boolean) => void
  setBgPlayback: (b: boolean) => void
  setChatApiKey: (v: string) => void
  setChatModel: (v: string) => void
  setChatFeedbackJa: (b: boolean) => void
  setChatTargetCount: (n: number) => void
  setInAppMic: (b: boolean) => void
  setCommitGate: (b: boolean) => void
  setVoiceAnswer: (b: boolean) => void
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
      showKana: true,
      bgPlayback: false,
      chatApiKey: '',
      chatModel: 'gemma-4-31b-it',
      chatFeedbackJa: true,
      chatTargetCount: 4,
      inAppMic: false,
      commitGate: true,
      voiceAnswer: false,
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
      setShowKana: (showKana) => set({ showKana }),
      setBgPlayback: (bgPlayback) => set({ bgPlayback }),
      setChatApiKey: (chatApiKey) => set({ chatApiKey }),
      setChatModel: (chatModel) => set({ chatModel }),
      setChatFeedbackJa: (chatFeedbackJa) => set({ chatFeedbackJa }),
      setChatTargetCount: (chatTargetCount) => set({ chatTargetCount }),
      setInAppMic: (inAppMic) => set({ inAppMic }),
      setCommitGate: (commitGate) => set({ commitGate }),
      setVoiceAnswer: (voiceAnswer) => set({ voiceAnswer }),
    }),
    { name: 'my-phrases-settings' },
  ),
)
