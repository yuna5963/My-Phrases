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

/** True if the engine exposes at least one voice for the given language prefix. */
export function hasVoiceForLang(prefix: string): boolean {
  if (!voicesCache.length && isTTSAvailable()) voicesCache = window.speechSynthesis.getVoices()
  const p = prefix.toLowerCase()
  return voicesCache.some((v) => v.lang.toLowerCase().startsWith(p))
}

function pickVoiceForLang(prefix: string): SpeechSynthesisVoice | undefined {
  const p = prefix.toLowerCase()
  const matches = voicesCache.filter((v) => v.lang.toLowerCase().startsWith(p))
  // Prefer on-device (localService) voices so audio works offline; some Android
  // "online" voices stay silent when the app is offline.
  const local = matches.filter((v) => v.localService)
  const pool = local.length ? local : matches
  const preferred = p === 'en' ? 'en-us' : p === 'ja' ? 'ja-jp' : p
  return (
    pool.find((v) => v.lang.toLowerCase() === preferred) ||
    pool.find((v) => v.default) ||
    pool[0]
  )
}

/** The voice speak() would actually use for the given preference + language. */
export function resolveVoice(
  voiceURI?: string | null,
  lang = 'en-US',
): SpeechSynthesisVoice | undefined {
  if (!voicesCache.length && isTTSAvailable()) voicesCache = window.speechSynthesis.getVoices()
  const prefix = lang.slice(0, 2).toLowerCase()
  let v: SpeechSynthesisVoice | undefined
  if (voiceURI) {
    // Only honour the saved voice when it matches the requested language;
    // the user's stored preference is an English voice.
    const match = voicesCache.find((x) => x.voiceURI === voiceURI)
    if (match && match.lang.toLowerCase().startsWith(prefix)) v = match
  }
  if (!v) v = pickVoiceForLang(prefix)
  return v
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
  /** BCP-47 tag, e.g. 'en-US' (default) or 'ja-JP' for the translation. */
  lang?: string
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

  const lang = opts.lang ?? 'en-US'
  const u = new SpeechSynthesisUtterance(text)
  u.rate = opts.rate ?? 1
  u.lang = lang

  // Explicitly assign a voice object. On Android, setting only `lang` often
  // fails to select a voice, producing silence — so auto-pick one.
  const chosen = resolveVoice(opts.voiceURI, lang)
  if (chosen) {
    u.voice = chosen
    u.lang = chosen.lang
  }

  if (opts.onStart) u.onstart = () => opts.onStart!()
  if (opts.onEnd) u.onend = () => opts.onEnd!()
  u.onerror = (e) => opts.onError?.(e.error || '再生に失敗しました')

  const start = () => {
    unlocked = true
    if (synth.paused) synth.resume()
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

  // Chrome (esp. Android) can drop an utterance spoken immediately after
  // cancel(); when something is already queued, cancel then start on a delay.
  if (synth.speaking || synth.pending) {
    synth.cancel()
    setTimeout(start, 120)
  } else {
    start()
  }
}

export function stopSpeaking(): void {
  if (isTTSAvailable()) window.speechSynthesis.cancel()
}
