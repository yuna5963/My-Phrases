// Web Speech API（SpeechRecognition）エンジン。従来 hooks/useSpeechInput.ts に
// あったロジックを SpeechEngine 化したもので、挙動は不変。
import { messageFor } from './messages'
import type { SpeechEngine, SpeechListeners } from './types'

/**
 * Web Speech API の最小型定義。プロジェクトの TS 設定には SpeechRecognition の
 * 環境型が無いため、使う分だけここで宣言する（@types 追加や any を避ける）。
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionResultListLike {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorEventLike {
  error: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

let rec: SpeechRecognitionLike | null = null

function detach(): void {
  if (!rec) return
  rec.onresult = null
  rec.onerror = null
  rec.onend = null
  rec = null
}

export const webSpeechEngine: SpeechEngine = {
  isAvailable(): Promise<boolean> {
    return Promise.resolve(getCtor() != null)
  },

  // ブラウザは start() の時点で自らマイク許可を尋ねるので、事前要求は不要。
  ensurePermission(): Promise<boolean> {
    return Promise.resolve(true)
  },

  start(lang: string, listeners: SpeechListeners): Promise<void> {
    const Ctor = getCtor()
    if (!Ctor) {
      listeners.onError(messageFor('service-not-allowed'))
      return Promise.resolve()
    }
    detach()
    const r = new Ctor()
    rec = r
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) listeners.onFinal(text)
        else pending += text
      }
      listeners.onPartial(pending)
    }
    r.onerror = (e) => {
      listeners.onError(messageFor(e.error))
    }
    r.onend = () => {
      listeners.onEnd()
    }
    try {
      r.start()
    } catch {
      // すでに開始済みのときに throw する実装があるため握りつぶす
    }
    return Promise.resolve()
  },

  stop(): Promise<void> {
    try {
      rec?.stop()
    } catch {
      // 開始前の stop は無視してよい
    }
    return Promise.resolve()
  },
}
