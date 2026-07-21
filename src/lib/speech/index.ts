// 音声認識の公開窓口。内部をエンジン差し替え式にする: Web = Web Speech API
// （webSpeech.ts）、ネイティブアプリ = Android の音声認識（capacitorSpeech.ts）。
// lib/tts/index.ts と同じ dynamic import の作法で、プラグインを Web バンドルに
// 混入させない（isNativeApp は実行時判定だが Vite が別チャンクに分割するので、
// Web ユーザーがこのチャンクを取得することはない）。
import { isNativeApp } from '../platform'
import type { SpeechEngine, SpeechListeners } from './types'
import { webSpeechEngine } from './webSpeech'

export type { SpeechEngine, SpeechListeners }
export { messageFor } from './messages'

let engine: SpeechEngine = webSpeechEngine

/** エンジンが確定するまでの待ち合わせ。Web では即解決する。 */
export const engineReady: Promise<void> = isNativeApp
  ? import('./capacitorSpeech')
      .then((m) => {
        engine = m.capacitorSpeechEngine
      })
      .catch(() => {
        /* 読み込み失敗時はWebエンジンのまま（開始時にエラー表示される） */
      })
  : Promise.resolve()

/** 現在のエンジン。engineReady の解決後に呼ぶこと。 */
export function speechEngine(): SpeechEngine {
  return engine
}
