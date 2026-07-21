// ネイティブアプリ用の音声認識エンジン。Android の WebView は Web Speech API の
// 認識（webkitSpeechRecognition）を実装しておらず、コンストラクタは存在するのに
// start() すると必ずエラーになる。そのため Capacitor プラグイン経由で Android の
// 音声認識（SpeechRecognizer）を呼ぶ。このファイルだけがプラグインを import し、
// isNativeApp のときのみ index.ts から dynamic import される（Webバンドル非混入）。
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { messageFor } from './messages'
import type { SpeechEngine, SpeechListeners } from './types'

/** 自動再開の待ち時間。直前のセッション終了とぶつからない程度に空ける。 */
const RESTART_DELAY_MS = 300
/** 部分結果が1度も来ないまま再開し続けたときに諦める回数。 */
const MAX_EMPTY_RESTARTS = 3

// 利用者の意図（停止ボタンを押すまで true）。Android の SpeechRecognizer は
// 無音でひとりでに終了するので、この意図が残っている限り自動で再開する。
let wantListening = false
let lastPartial = ''
let emptyRestarts = 0
let currentLang = 'ja-JP'
let current: SpeechListeners | null = null
let listenersAttached = false

function ensureListeners(): void {
  if (listenersAttached) return
  listenersAttached = true

  void SpeechRecognition.addListener('partialResults', (d: { matches: string[] }) => {
    const text = d.matches?.[0] ?? ''
    if (!text) return
    // 部分結果が来た＝認識は生きている。再開ループの検出カウンタを戻す。
    emptyRestarts = 0
    lastPartial = text
    current?.onPartial(text)
  }).catch(() => {
    /* リスナー登録失敗時は listeningState 側だけで動く */
  })

  void SpeechRecognition.addListener(
    'listeningState',
    (d: { status: 'started' | 'stopped' }) => {
      if (d.status !== 'stopped') return
      // Android は無音で1発話ごとに終了する。直前の部分結果を確定扱いにする
      // （STEP2 の「1発話=1ノード（1行）」とも噛み合う）。
      if (lastPartial) {
        current?.onFinal(lastPartial)
        lastPartial = ''
      }
      current?.onPartial('')
      if (!wantListening) {
        current?.onEnd()
        return
      }
      emptyRestarts++
      if (emptyRestarts > MAX_EMPTY_RESTARTS) {
        // 一度も認識できないまま再開を繰り返している＝開始できていない。
        wantListening = false
        current?.onError('音声入力を開始できませんでした')
        current?.onEnd()
        return
      }
      setTimeout(() => {
        if (!wantListening) return
        void beginSession()
      }, RESTART_DELAY_MS)
    },
  ).catch(() => {
    /* ignore */
  })
}

async function beginSession(): Promise<void> {
  try {
    await SpeechRecognition.start({
      language: currentLang,
      partialResults: true,
      popup: false,
      maxResults: 1,
    })
  } catch {
    wantListening = false
    // 開始失敗の理由はプラグインからコード化されて返らないので汎用メッセージにする
    // （マイク未検出と断定しない）。
    current?.onError(messageFor('start-failed'))
    current?.onEnd()
  }
}

export const capacitorSpeechEngine: SpeechEngine = {
  async isAvailable(): Promise<boolean> {
    try {
      const { available } = await SpeechRecognition.available()
      return available
    } catch {
      return false
    }
  },

  // このメソッドが Android のマイク権限ダイアログを出し、アプリを権限マネージャに
  // 登録させる。最初の start() より前に必ず呼ぶこと。
  async ensurePermission(): Promise<boolean> {
    try {
      let status = await SpeechRecognition.checkPermissions()
      if (status.speechRecognition !== 'granted') {
        status = await SpeechRecognition.requestPermissions()
      }
      return status.speechRecognition === 'granted'
    } catch {
      return false
    }
  },

  async start(lang: string, listeners: SpeechListeners): Promise<void> {
    ensureListeners()
    current = listeners
    currentLang = lang
    lastPartial = ''
    emptyRestarts = 0
    wantListening = true
    await beginSession()
  },

  async stop(): Promise<void> {
    // 先に意図を落とす。これで 'stopped' イベントが再開を起こさない。
    wantListening = false
    try {
      await SpeechRecognition.stop()
    } catch {
      /* 開始前の stop は無視してよい */
    }
    if (lastPartial) {
      current?.onFinal(lastPartial)
      lastPartial = ''
    }
    current?.onEnd()
  },
}
