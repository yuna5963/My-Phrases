// Web Speech API（SpeechSynthesis）エンジン。従来 lib/tts.ts にあったロジックを
// TtsEngine 化したもので、挙動は不変。Voices load asynchronously on some
// browsers (notably iOS Safari / Chrome), so we resolve them via onvoiceschanged.
import type { SpeakOptions, TtsEngine, TtsVoice } from './types'

function available(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

let unlocked = false

export const webSpeechEngine: TtsEngine = {
  isAvailable: available,

  loadVoices(): Promise<TtsVoice[]> {
    return new Promise((resolve) => {
      if (!available()) {
        resolve([])
        return
      }
      const synth = window.speechSynthesis
      const existing = synth.getVoices()
      if (existing.length) {
        resolve(existing)
        return
      }
      let done = false
      const finish = (v: SpeechSynthesisVoice[]) => {
        if (done) return
        done = true
        resolve(v)
      }
      synth.onvoiceschanged = () => {
        synth.onvoiceschanged = null
        finish(synth.getVoices())
      }
      // Safety: some browsers never fire the event; poll briefly.
      setTimeout(() => {
        const v = synth.getVoices()
        if (v.length) finish(v)
      }, 500)
    })
  },

  voicesNow(): TtsVoice[] {
    return available() ? window.speechSynthesis.getVoices() : []
  },

  /**
   * iOS Safari blocks speech until it has been triggered once inside a real user
   * gesture. Call this from the first tap/click to "unlock" audio, so later
   * playback (incl. auto-play in effects) works. Safe to call repeatedly.
   */
  prime(): void {
    if (!available() || unlocked) return
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
  },

  speak(text: string, opts: SpeakOptions, voice?: TtsVoice): void {
    if (!available()) {
      opts.onError?.('この端末は読み上げに対応していません')
      return
    }
    const synth = window.speechSynthesis

    const lang = opts.lang ?? 'en-US'
    const u = new SpeechSynthesisUtterance(text)
    // 再生速度の設定は英語読み上げのみ対象。日本語訳は常に等倍で再生する。
    const isJa = lang.toLowerCase().startsWith('ja')
    u.rate = isJa ? 1 : opts.rate ?? 1
    u.lang = lang

    // Explicitly assign a voice object. On Android, setting only `lang` often
    // fails to select a voice, producing silence — so index.ts auto-picks one.
    // （キャッシュは Web では実 SpeechSynthesisVoice を保持しているのでそのまま使える）
    if (voice) {
      u.voice = voice as SpeechSynthesisVoice
      u.lang = voice.lang
    }

    if (opts.onStart) u.onstart = () => opts.onStart!()
    if (opts.onEnd) u.onend = () => opts.onEnd!()
    u.onerror = (e) => opts.onError?.(e.error || '再生に失敗しました')
    if (opts.onBoundary) {
      u.onboundary = (e) => {
        // 文境界は無視し、単語境界（エンジンにより name='word' または空）だけ通知する。
        if (e.name === 'sentence') return
        opts.onBoundary!(e.charIndex)
      }
    }

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
  },

  stop(): void {
    if (available()) window.speechSynthesis.cancel()
  },
}
