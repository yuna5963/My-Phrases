// 読み上げの公開窓口。従来 lib/tts.ts が持っていた13エクスポートを維持し、
// 内部をエンジン差し替え式にする: Web = Web Speech API（webSpeech.ts）、
// ネイティブアプリ = Android システムTTS（capacitorTts.ts、PR3で追加予定）。
// 声のキャッシュ・選択と speakSequence（連続再生の連鎖）はエンジン非依存で
// ここに置く。消費者側の import パス（'../lib/tts'）と挙動は従来と同一。
import { resolveVoiceFrom } from './pickVoice'
import type { SeqPart, SpeakOptions, TtsEngine, TtsVoice, VoiceStatus } from './types'
import { webSpeechEngine } from './webSpeech'

export type { SeqPart, SpeakOptions, TtsVoice, VoiceStatus }

// 現状は常にWebエンジン。ネイティブエンジンは PR3 で isNativeApp のとき
// dynamic import で差し替える（Webバンドルには混入させない）。
let engine: TtsEngine = webSpeechEngine

let voicesCache: TtsVoice[] = []

/** キャッシュが空なら、同期取得できる分だけ補充する（従来の遅延リフレッシュと同じ）。 */
function refreshCacheIfEmpty(): void {
  if (!voicesCache.length) voicesCache = engine.voicesNow()
}

export function isTTSAvailable(): boolean {
  return engine.isAvailable()
}

export async function loadVoices(): Promise<TtsVoice[]> {
  const v = await engine.loadVoices()
  if (v.length) voicesCache = v
  return voicesCache
}

export function getEnglishVoices(): TtsVoice[] {
  return voicesCache.filter((v) => v.lang.toLowerCase().startsWith('en'))
}

/** True if the engine exposes at least one voice for the given language prefix. */
export function hasVoiceForLang(prefix: string): boolean {
  refreshCacheIfEmpty()
  const p = prefix.toLowerCase()
  return voicesCache.some((v) => v.lang.toLowerCase().startsWith(p))
}

/** The voice speak() would actually use for the given preference + language. */
export function resolveVoice(voiceURI?: string | null, lang = 'en-US'): TtsVoice | undefined {
  refreshCacheIfEmpty()
  return resolveVoiceFrom(voicesCache, voiceURI, lang)
}

/** Quick diagnostic of the device's TTS capability (for the Settings panel). */
export function getVoiceStatus(): VoiceStatus {
  if (!engine.isAvailable()) return { supported: false, total: 0, english: 0 }
  refreshCacheIfEmpty()
  return { supported: true, total: voicesCache.length, english: getEnglishVoices().length }
}

/** 最初のユーザージェスチャでの音声アンロック（iOS Safari 対策。エンジンにより no-op）。 */
export function primeTTS(): void {
  engine.prime()
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text) return
  refreshCacheIfEmpty()
  engine.speak(text, opts, resolveVoiceFrom(voicesCache, opts.voiceURI, opts.lang ?? 'en-US'))
}

export function stopSpeaking(): void {
  engine.stop()
}

/**
 * Speak `parts` back-to-back (chunk → 例文 → 和訳 …). Bails out as soon as
 * `isCancelled()` returns true. The pause after each part is `part.gapAfter`
 * when set, otherwise the shared `gapMs`.
 */
export function speakSequence(
  parts: SeqPart[],
  opts: {
    voiceURI?: string | null
    rate?: number
    gapMs?: number
    isCancelled?: () => boolean
    onDone?: () => void
  } = {},
): void {
  const { gapMs = 0, isCancelled = () => false, onDone } = opts
  let i = 0
  const next = () => {
    if (isCancelled()) return
    if (i >= parts.length) {
      onDone?.()
      return
    }
    const part = parts[i++]
    const gap = part.gapAfter ?? gapMs
    const after = () => {
      if (gap > 0) setTimeout(() => !isCancelled() && next(), gap)
      else next()
    }
    speak(part.text, {
      voiceURI: opts.voiceURI,
      rate: opts.rate,
      lang: part.lang ?? 'en-US',
      onEnd: after,
      onError: after,
    })
  }
  next()
}
