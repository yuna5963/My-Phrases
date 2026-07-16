// 実行プラットフォームの判定。ネイティブアプリ（Capacitor）ではブリッジが
// バンドル実行前に window.Capacitor を注入する。@capacitor/core は import しない
// （Webバンドルに Capacitor を混入させないため、注入済みグローバルだけを見る）。
export const isNativeApp: boolean =
  typeof window !== 'undefined' &&
  !!(
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor?.isNativePlatform?.()
