// Thin wrapper around the Web Speech API SpeechSynthesis.
// Voices load asynchronously on some browsers (notably iOS Safari / Chrome),
// so we resolve them via onvoiceschanged.

let voicesCache: SpeechSynthesisVoice[] = []

export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isTTSAvailable()) {
      resolve([])
      return
    }
    const synth = window.speechSynthesis
    const existing = synth.getVoices()
    if (existing.length) {
      voicesCache = existing
      resolve(existing)
      return
    }
    const handler = () => {
      voicesCache = synth.getVoices()
      synth.onvoiceschanged = null
      resolve(voicesCache)
    }
    synth.onvoiceschanged = handler
    // Safety: some browsers never fire the event; poll briefly.
    setTimeout(() => {
      const v = synth.getVoices()
      if (v.length && voicesCache.length === 0) {
        voicesCache = v
        resolve(v)
      }
    }, 500)
  })
}

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  return voicesCache.filter((v) => v.lang.toLowerCase().startsWith('en'))
}

function pickEnglishVoice(): SpeechSynthesisVoice | undefined {
  const en = getEnglishVoices()
  return (
    en.find((v) => v.lang.toLowerCase() === 'en-us') ||
    en.find((v) => v.default) ||
    en[0]
  )
}

export interface VoiceStatus {
  supported: boolean
  total: number
  english: number
}

/** Quick diagnostic of the device's TTS capability (for the Settings panel). */
export function getVoiceStatus(): VoiceStatus {
  if (!isTTSAvailable()) return { supported: false, total: 0, english: 0 }
  if (!voicesCache.length) voicesCache = window.speechSynthesis.getVoices()
  return { supported: true, total: voicesCache.length, english: getEnglishVoices().length }
}

let unlocked = false

/**
 * iOS Safari blocks speech until it has been triggered once inside a real user
 * gesture. Call this from the first tap/click to "unlock" audio, so later
 * playback (incl. auto-play in effects) works. Safe to call repeatedly.
 */
export function primeTTS(): void {
  if (!isTTSAvailable() || unlocked) return
  try {
    const synth = window.speechSynthesis
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    synth.speak(u)
    synth.resume()
    unlocked = true
  } catch {
    /* ignore */
  }
}

export interface SpeakOptions {
  voiceURI?: string | null
  rate?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (message: string) => void
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text) return
  if (!isTTSAvailable()) {
    opts.onError?.('この端末は読み上げに対応していません')
    return
  }
  const synth = window.speechSynthesis

  // Refresh the voice cache lazily (voices are often ready only later).
  if (!voicesCache.length) voicesCache = synth.getVoices()

  // Some engines get stuck in a paused state; nudge before/after speaking.
  if (synth.paused) synth.resume()
  if (synth.speaking || synth.pending) synth.cancel()

  const u = new SpeechSynthesisUtterance(text)
  u.rate = opts.rate ?? 1
  u.lang = 'en-US'

  // Explicitly assign a voice object. On Android, setting only `lang` often
  // fails to select an English voice, producing silence — so auto-pick one.
  let chosen: SpeechSynthesisVoice | undefined
  if (opts.voiceURI) chosen = voicesCache.find((x) => x.voiceURI === opts.voiceURI)
  if (!chosen) chosen = pickEnglishVoice()
  if (chosen) {
    u.voice = chosen
    u.lang = chosen.lang
  }

  if (opts.onStart) u.onstart = () => opts.onStart!()
  if (opts.onEnd) u.onend = () => opts.onEnd!()
  u.onerror = (e) => opts.onError?.(e.error || '再生に失敗しました')

  unlocked = true
  synth.speak(u)
  // Some engines start the queue paused — kick it.
  setTimeout(() => {
    try {
      if (synth.paused) synth.resume()
    } catch {
      /* ignore */
    }
  }, 60)
}

export function stopSpeaking(): void {
  if (isTTSAvailable()) window.speechSynthesis.cancel()
}
