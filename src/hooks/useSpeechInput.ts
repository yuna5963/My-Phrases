import { useEffect, useRef, useState } from 'react'
import { engineReady, speechEngine } from '../lib/speech'
import type { SpeechListeners } from '../lib/speech'

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
 * 日本語ディクテーション。
 *
 * Web は Web Speech API、ネイティブアプリ（Capacitor）は Android の音声認識を
 * Capacitor プラグイン経由で使う（Android の WebView は Web Speech API の認識を
 * 実装していないため）。どちらも使えない環境でのみ supported=false になり、
 * 呼び出し側はボタンを静かに隠す。
 */
export function useSpeechInput(opts: {
  lang?: string
  /** 確定した断片ごとに呼ばれる。呼び出し側が既存テキストへの足し方を決める。 */
  onFinal: (text: string) => void
}): SpeechInput {
  const { lang = 'ja-JP' } = opts
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 親の再レンダーごとにエンジンへ渡すコールバックを作り直さないよう、ref 経由で読む。
  const onFinalRef = useRef(opts.onFinal)
  onFinalRef.current = opts.onFinal

  // ネイティブはプラグイン照会が要るので、対応可否は非同期に決まる。
  useEffect(() => {
    let alive = true
    void engineReady
      .then(() => speechEngine().isAvailable())
      .then((ok) => {
        if (alive) setSupported(ok)
      })
      .catch(() => {
        /* 判定できない場合は非対応扱い（ボタンを出さない） */
      })
    return () => {
      alive = false
    }
  }, [])

  // アンマウント時に聞き取りを止める（画面を離れてもマイクが残らないように）。
  useEffect(() => {
    return () => {
      void engineReady.then(() => speechEngine().stop())
    }
  }, [])

  const start = () => {
    if (listening) return
    setError(null)
    setInterim('')
    void (async () => {
      await engineReady
      const engine = speechEngine()
      const allowed = await engine.ensurePermission()
      if (!allowed) {
        setError('マイクの使用が許可されていません。端末の設定を確認してください')
        return
      }
      const listeners: SpeechListeners = {
        onPartial: (text) => setInterim(text),
        onFinal: (text) => onFinalRef.current(text),
        onError: (message) => {
          setError(message)
          setListening(false)
        },
        onEnd: () => {
          setListening(false)
          setInterim('')
        },
      }
      setListening(true)
      await engine.start(lang, listeners)
    })()
  }

  const stop = () => {
    setListening(false)
    void engineReady.then(() => speechEngine().stop())
  }

  return { supported, listening, interim, error, start, stop }
}
