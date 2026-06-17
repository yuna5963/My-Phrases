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

export interface SpeakOptions {
  voiceURI?: string | null
  rate?: number
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!isTTSAvailable() || !text) return
  const synth = window.speechSynthesis
  synth.cancel() // stop anything currently playing
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
  synth.speak(u)
}

export function stopSpeaking(): void {
  if (isTTSAvailable()) window.speechSynthesis.cancel()
}
