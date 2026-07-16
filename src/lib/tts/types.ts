// TTSエンジン共通の型。Web Speech API とネイティブ（Capacitorプラグイン）を
// 同じ形で扱うため、SpeechSynthesisVoice の構造的サブセットを声の型にする
// （Webの実オブジェクトも、プラグインの返す voice もこの形を満たす）。

export interface TtsVoice {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
  default: boolean
}

export interface SpeakOptions {
  voiceURI?: string | null
  rate?: number
  /** BCP-47 tag, e.g. 'en-US' (default) or 'ja-JP' for the translation. */
  lang?: string
  onStart?: () => void
  onEnd?: () => void
  onError?: (message: string) => void
  /**
   * 単語境界ごとに文字位置（charIndex）を通知する（Word Spark ハイライト用）。
   * 対応エンジンのみ発火し、Android Chrome の Google TTS 等では発火しないことがある。
   * 発火しない環境は呼び出し側で推定タイミングにフォールバックする。
   */
  onBoundary?: (charIndex: number) => void
}

export interface SeqPart {
  text: string
  /** BCP-47 tag; defaults to 'en-US'. */
  lang?: string
  /** Pause (ms) after this part before the next one. Overrides `gapMs`. */
  gapAfter?: number
}

export interface VoiceStatus {
  supported: boolean
  total: number
  english: number
}

/** 読み上げエンジンの差し替え点。声の解決・キャッシュ・連続再生は index.ts 側が持つ。 */
export interface TtsEngine {
  isAvailable(): boolean
  /** 声の一覧を非同期に解決する（Webは onvoiceschanged 待ち、ネイティブはプラグイン照会）。 */
  loadVoices(): Promise<TtsVoice[]>
  /** 今この瞬間に同期取得できる声（未ロードなら空でよい）。キャッシュの遅延補充に使う。 */
  voicesNow(): TtsVoice[]
  /** 最初のユーザージェスチャでの音声アンロック（不要なエンジンは no-op）。 */
  prime(): void
  /** 1発話。voice は index.ts が解決済みのものを渡す（無ければ lang 任せ）。 */
  speak(text: string, opts: SpeakOptions, voice?: TtsVoice): void
  stop(): void
}
