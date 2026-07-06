import { useCallback, useEffect, useRef, useState } from 'react'
import {
  estimateWordTimings,
  recordSpokenDuration,
  wordAtChar,
  wordSpans,
  type WordSpan,
} from '../lib/spokenWords'

// boundary イベントの到着をこの時間だけ待ち、来なければ推定タイミングに切り替える。
const BOUNDARY_WAIT_MS = 350

/**
 * 読み上げ中の単語位置（Word Spark ハイライト）を追跡するフック。
 * `start(text, rate)` を speak() の直前に呼び、`onBoundary` / `onStart` / `onEnd` を
 * speak() に渡す。boundary イベント対応エンジン（PC Chrome・iOS Safari 等）は
 * イベントに同期し、発火しないエンジン（Android Chrome の Google TTS 等）は
 * 音節・強勢・実測速度ベースの推定タイミングで単語を送る。
 * `onStart` で推定タイマーを実際の発話開始に引き直し（speak() 内の遅延ぶんの
 * ズレを吸収）、`onEnd` で実測時間を記録して次回以降の速度推定を較正する。
 * `current` を SpokenText に渡して描画する。
 */
export function useSpokenWordTracker() {
  const [current, setCurrent] = useState(-1)
  const spansRef = useRef<WordSpan[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const gotBoundaryRef = useRef(false)
  // 現在の発話（実測記録用）。stop() や次の start() で破棄され、
  // キャンセルされた発話の遅延 onEnd が誤った時間を記録しないようにする。
  const utterRef = useRef<{ text: string; rate: number; startedAt: number | null } | null>(null)

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
  }

  // フォールバック: boundary が BOUNDARY_WAIT_MS 内に来なければ推定タイミングで単語を送る。
  const scheduleFallback = (text: string, rate: number, spans: WordSpan[]) => {
    const timings = estimateWordTimings(text, rate)
    timersRef.current.push(
      setTimeout(() => {
        if (gotBoundaryRef.current) return
        for (let i = 1; i < spans.length; i++) {
          timersRef.current.push(
            setTimeout(
              () => {
                if (!gotBoundaryRef.current) setCurrent(i)
              },
              Math.max(0, timings[i] - BOUNDARY_WAIT_MS),
            ),
          )
        }
      }, BOUNDARY_WAIT_MS),
    )
  }

  /** 追跡を止めてハイライトを消す（停止・カード切替・読み上げ終了時）。 */
  const stop = useCallback(() => {
    clearTimers()
    gotBoundaryRef.current = false
    spansRef.current = []
    utterRef.current = null
    setCurrent(-1)
  }, [])

  /** text の読み上げ開始直前に呼ぶ。先頭の単語を即ハイライトする。 */
  const start = useCallback((text: string, rate: number) => {
    clearTimers()
    gotBoundaryRef.current = false
    const spans = wordSpans(text)
    spansRef.current = spans
    utterRef.current = { text, rate, startedAt: null }
    setCurrent(spans.length ? 0 : -1)
    // onstart を発火しないエンジンへの保険としてここでも仮スケジュールする
    // （onstart が来たら実際の開始時刻で引き直す）。
    scheduleFallback(text, rate, spans)
  }, [])

  /** speak() の onStart に渡す。推定タイマーを実際の発話開始時刻で引き直す。 */
  const onStart = useCallback(() => {
    const u = utterRef.current
    if (!u) return
    u.startedAt = performance.now()
    if (gotBoundaryRef.current) return
    clearTimers()
    scheduleFallback(u.text, u.rate, spansRef.current)
  }, [])

  /**
   * speak() の onEnd に渡す（呼び出し側の終了処理と併用してよい）。
   * 実測の発話時間を記録し、次回以降の推定速度を較正する。ハイライトは消さない
   * （消すのは従来どおり呼び出し側の stop()）。
   */
  const onEnd = useCallback(() => {
    const u = utterRef.current
    utterRef.current = null
    if (u && u.startedAt !== null) {
      recordSpokenDuration(u.text, u.rate, performance.now() - u.startedAt)
    }
  }, [])

  /** speak() の onBoundary に渡すハンドラ。初回到着で推定タイマーを破棄する。 */
  const onBoundary = useCallback((charIndex: number) => {
    if (!gotBoundaryRef.current) {
      gotBoundaryRef.current = true
      clearTimers()
    }
    setCurrent(wordAtChar(spansRef.current, charIndex))
  }, [])

  // アンマウント時にタイマーを残さない。
  useEffect(() => () => clearTimers(), [])

  return { current, start, stop, onStart, onEnd, onBoundary }
}
