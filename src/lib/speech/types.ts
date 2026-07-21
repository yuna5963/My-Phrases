// 音声認識エンジン共通の型。Web Speech API とネイティブ（Capacitorプラグイン）を
// 同じ形で扱う。lib/tts と同じ構成（types / webSpeech / capacitorSpeech / index）。

/** 認識中に呼ばれるコールバック群。エンジンはこれを呼ぶだけで、状態は持たない。 */
export interface SpeechListeners {
  /** 1発話が確定した。呼び出し側が既存テキストへの足し方を決める。 */
  onFinal: (text: string) => void
  /** 認識途中の暫定テキスト（確定前のプレビュー用）。 */
  onPartial: (text: string) => void
  /** 利用者向け日本語メッセージ。これが呼ばれたら自動再開はしない。 */
  onError: (message: string) => void
  /** 聞き取りが完全に終わった（自動再開もしない状態）。 */
  onEnd: () => void
}

/** 音声認識エンジンの差し替え点。Web=Web Speech API / ネイティブ=Androidの音声認識。 */
export interface SpeechEngine {
  /** この環境で使えるか。ネイティブはプラグイン照会が要るので非同期。 */
  isAvailable(): Promise<boolean>
  /** マイク権限を確認・要求する。許可されなければ false。 */
  ensurePermission(): Promise<boolean>
  /** 聞き取り開始。stop() が呼ばれるまで、連続して onFinal を出し続ける。 */
  start(lang: string, listeners: SpeechListeners): Promise<void>
  stop(): Promise<void>
}
