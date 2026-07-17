import type { CapacitorConfig } from '@capacitor/cli'

// Android ネイティブアプリ（WebView シェル）の設定。
// appId と androidScheme は IndexedDB / localStorage のオリジンを決めるため、
// 一度リリースしたら変更しないこと（変更するとユーザーデータが見えなくなる）。
const config: CapacitorConfig = {
  appId: 'com.yuna5963.myphrases',
  appName: 'My Phrases',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
