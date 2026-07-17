// ローカルCapacitorプラグイン（android/…/BackgroundPlaybackPlugin.java）のJS側定義。
// ネイティブアプリ専用。isNativeApp のときのみ dynamic import される。
import { registerPlugin } from '@capacitor/core'

export interface BackgroundPlaybackPlugin {
  /** フォアグラウンドサービスを開始（通知許可が未取得なら先に要求。拒否でも開始する）。 */
  start(options: { title: string; body?: string }): Promise<void>
  /** 通知の表示内容を差し替える。 */
  update(options: { title: string; body?: string }): Promise<void>
  stop(): Promise<void>
}

export const BackgroundPlayback =
  registerPlugin<BackgroundPlaybackPlugin>('BackgroundPlayback')
