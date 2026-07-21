import { useEffect, useRef, useState } from 'react'

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

/** 認識エラーコードを、利用者が次の行動を取れる日本語にする。 */
function messageFor(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'マイクの使用が許可されていません。端末の設定を確認してください'
    case 'no-speech':
      return '音声が聞き取れませんでした'
    case 'audio-capture':
      return 'マイクが見つかりませんでした'
    default:
      return '音声入力でエラーが発生しました'
  }
}

export interface SpeechInput {
  /** この端末・ブラウザで音声認識を使えるか。false のときUIは出さない。 */
  supported: boolean
  listening: boolean
  /** 認識途中の暫定テキスト（確定前のプレビュー表示用）。 */
  interim: string
  error: string | null
  start: () => void
  stop: () => void
}

/**
 * Web Speech API による日本語ディクテーション。
 *
 * Android の WebView（Capacitor ネイティブアプリ）では Web Speech API が使えないことが
 * 多い。その場合は supported=false になり、呼び出し側はボタンを静かに隠す設計にしている
 * （使えない端末でエラーを見せない）。
 */
export function useSpeechInput(opts: {
  lang?: string
  /** 確定した断片ごとに呼ばれる。呼び出し側が既存テキストへの足し方を決める。 */
  onFinal: (text: string) => void
}): SpeechInput {
  const { lang = 'ja-JP' } = opts
  const [supported] = useState(() => getCtor() != null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 親の再レンダーごとに認識インスタンスを作り直さないよう、コールバックは ref 経由で読む。
  const onFinalRef = useRef(opts.onFinal)
  onFinalRef.current = opts.onFinal
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0]?.transcript ?? ''
        if (r.isFinal) onFinalRef.current(text)
        else pending += text
      }
      setInterim(pending)
    }
    rec.onerror = (e) => {
      setError(messageFor(e.error))
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
    }
    recRef.current = rec
    return () => {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      try {
        rec.abort()
      } catch {
        // 開始前の abort は無視してよい
      }
      recRef.current = null
    }
  }, [lang])

  const start = () => {
    const rec = recRef.current
    if (!rec || listening) return
    setError(null)
    setInterim('')
    try {
      rec.start()
      setListening(true)
    } catch {
      // すでに開始済みのときに throw する実装があるため握りつぶす
    }
  }

  const stop = () => {
    recRef.current?.stop()
    setListening(false)
  }

  return { supported, listening, interim, error, start, stop }
}
