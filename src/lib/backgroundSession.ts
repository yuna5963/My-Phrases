// バックグラウンド再生セッションのプラットフォーム別ファサード。
// - Web(PWA): キープアライブ音声＋Media Session（keepAlive.ts、実験的・保証なし）
// - ネイティブアプリ: フォアグラウンドサービス＋部分ウェイクロック（PR3で追加予定。
//   Androidが公式にサポートする方式なので画面オフでも再生が続く）
// 呼び出し側（連続再生・長文音読）はこのファサードだけを見る。
import { isNativeApp } from './platform'
import { startKeepAlive, stopKeepAlive, updateKeepAliveMetadata } from './keepAlive'

export interface SessionMeta {
  title: string
  artist?: string
  /** 通知の⏸・イヤホン抜去などアプリ外から停止されたとき（再生全体を止める用）。 */
  onExternalPause?: () => void
}

/**
 * バックグラウンド再生セッションを開始する。**ユーザージェスチャのハンドラ内で
 * 同期的に呼ぶこと**（Webのautoplay制限。ネイティブに制限はない）。
 * 開始できなければ false（再生自体は続行してよい）。
 */
export async function startBackgroundSession(meta: SessionMeta): Promise<boolean> {
  if (isNativeApp) {
    try {
      const { BackgroundPlayback } = await import('./native/backgroundPlayback')
      await BackgroundPlayback.start({ title: meta.title, body: meta.artist ?? '' })
      return true
    } catch {
      return false
    }
  }
  return startKeepAlive(meta)
}

/** 通知/ロック画面の表示を今のカードに合わせる（セッション停止中は no-op）。 */
export function updateBackgroundSession(meta: { title: string; artist?: string }): void {
  if (isNativeApp) {
    void import('./native/backgroundPlayback')
      .then(({ BackgroundPlayback }) =>
        BackgroundPlayback.update({ title: meta.title, body: meta.artist ?? '' }),
      )
      .catch(() => {})
    return
  }
  updateKeepAliveMetadata(meta)
}

/** セッションを止める（冪等・例外を投げない）。 */
export function stopBackgroundSession(): void {
  if (isNativeApp) {
    void import('./native/backgroundPlayback')
      .then(({ BackgroundPlayback }) => BackgroundPlayback.stop())
      .catch(() => {})
    return
  }
  stopKeepAlive()
}
