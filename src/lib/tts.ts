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
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!isTTSAvailable() || !text) return
  const synth = window.speechSynthesis

  // Refresh the voice cache lazily (iOS often has voices ready only later).
  if (!voicesCache.length) voicesCache = synth.getVoices()

  // iOS can get stuck in a paused state; nudge it before/after speaking.
  if (synth.paused) synth.resume()
  if (synth.speaking || synth.pending) synth.cancel()

  const u = new SpeechSynthesisUtterance(text)
  u.rate = opts.rate ?? 1
  u.lang = 'en-US'
  if (opts.voiceURI) {
    const v = voicesCache.find((x) => x.voiceURI === opts.voiceURI)
    if (v) {
      u.voice = v
      u.lang = v.lang
    }
  }

  unlocked = true
  synth.speak(u)
  // Some iOS versions start the queue paused — kick it.
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
