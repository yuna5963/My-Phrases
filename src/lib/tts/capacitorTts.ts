// ネイティブアプリ用TTSエンジン。Android の WebView には speechSynthesis が
// 存在しないため、Capacitor プラグイン経由で Android システムTTS（Chrome と
// 同じエンジン・同じ声）を呼ぶ。このファイルだけがプラグインを import し、
// isNativeApp のときのみ index.ts から dynamic import される（Webバンドル非混入）。
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import type { SpeakOptions, TtsEngine, TtsVoice } from './types'

let voicesCache: TtsVoice[] = []

// stop() や新しい speak() の後に、古い発話のコールバックが speakSequence の
// 連鎖を進めてしまわないよう、世代カウンタで無効化する（Webの cancel() 相当）。
let generation = 0

// Word Spark 用の単語境界。プラグインのリスナーはグローバルに1本だけ張り、
// 現在の発話のコールバックへ中継する。イベントが来ない端末では呼び出し側の
// 推定タイミングフォールバックがそのまま効く。
let boundaryCallback: ((charIndex: number) => void) | null = null
let boundaryListenerAttached = false

function ensureBoundaryListener(): void {
  if (boundaryListenerAttached) return
  boundaryListenerAttached = true
  void TextToSpeech.addListener('onRangeStart', (info: { start: number }) => {
    boundaryCallback?.(info.start)
  }).catch(() => {
    /* リスナー非対応でも推定フォールバックで動く */
  })
}

export const capacitorTtsEngine: TtsEngine = {
  // Android は必ずシステムTTSサービスを持つ。実際に使えるかは声の数で判定される
  // （App.tsx が loadVoices() の結果でサポートバナーを出し分ける）。
  isAvailable: () => true,

  async loadVoices(): Promise<TtsVoice[]> {
    try {
      const { voices } = await TextToSpeech.getSupportedVoices()
      voicesCache = voices.map((v) => ({
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        localService: v.localService,
        default: v.default,
      }))
    } catch {
      voicesCache = []
    }
    return voicesCache
  },

  voicesNow(): TtsVoice[] {
    return voicesCache
  },

  // ネイティブTTSはジェスチャによるアンロック不要。
  prime(): void {},

  speak(text: string, opts: SpeakOptions, voice?: TtsVoice): void {
    const my = ++generation
    const lang = opts.lang ?? 'en-US'
    // 再生速度の設定は英語読み上げのみ対象。日本語訳は常に等倍で再生する（Webと同じ規則）。
    const isJa = lang.toLowerCase().startsWith('ja')
    // 声の個別指定はプラグイン仕様で「getSupportedVoices の index」。
    // Android で index 指定が効かない端末でも、選択声の lang を渡すので
    // 言語（アクセント）としては必ず反映される。
    const voiceIndex = voice ? voicesCache.findIndex((v) => v.voiceURI === voice.voiceURI) : -1

    if (opts.onBoundary) {
      ensureBoundaryListener()
      boundaryCallback = opts.onBoundary
    } else {
      boundaryCallback = null
    }

    // プラグインには開始イベントが無いので、発話依頼と同時に通知する
    // （Word Spark の推定タイマーはこの時刻を起点に再アンカーされる）。
    opts.onStart?.()
    TextToSpeech.speak({
      text,
      lang: voice?.lang ?? lang,
      rate: isJa ? 1 : opts.rate ?? 1,
      ...(voiceIndex >= 0 ? { voice: voiceIndex } : {}),
      queueStrategy: 0, // Flush（Webエンジンの cancel→speak と同じ意味論）
    })
      .then(() => {
        if (my === generation) opts.onEnd?.()
      })
      .catch(() => {
        // stop()・新しい発話による中断は世代ガードで無視される。
        if (my === generation) opts.onError?.('再生に失敗しました')
      })
  },

  stop(): void {
    generation++
    boundaryCallback = null
    void TextToSpeech.stop().catch(() => {
      /* ignore */
    })
  },
}
