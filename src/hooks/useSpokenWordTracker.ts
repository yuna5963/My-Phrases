import { useCallback, useEffect, useRef, useState } from 'react'
import { estimateWordTimings, wordAtChar, wordSpans, type WordSpan } from '../lib/spokenWords'

// boundary イベントの到着をこの時間だけ待ち、来なければ推定タイミングに切り替える。
const BOUNDARY_WAIT_MS = 350

/**
 * 読み上げ中の単語位置（カラオケ式ハイライト）を追跡するフック。
 * `start(text, rate)` を speak() の直前に呼び、`onBoundary` を speak() に渡す。
 * boundary イベント対応エンジン（PC Chrome・iOS Safari 等）はイベントに同期し、
 * 発火しないエンジン（Android Chrome の Google TTS 等）は文字数×再生速度の
 * 推定タイミングで単語を送る。`current` を SpokenText に渡して描画する。
 */
export function useSpokenWordTracker() {
  const [current, setCurrent] = useState(-1)
  const spansRef = useRef<WordSpan[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const gotBoundaryRef = useRef(false)

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
  }

  /** 追跡を止めてハイライトを消す（停止・カード切替・読み上げ終了時）。 */
  const stop = useCallback(() => {
    clearTimers()
    gotBoundaryRef.current = false
    spansRef.current = []
    setCurrent(-1)
  }, [])

  /** text の読み上げ開始直前に呼ぶ。先頭の単語を即ハイライトする。 */
  const start = useCallback((text: string, rate: number) => {
    clearTimers()
    gotBoundaryRef.current = false
    const spans = wordSpans(text)
    spansRef.current = spans
    setCurrent(spans.length ? 0 : -1)

    // フォールバック: boundary が来なければ推定タイミングで単語を送る。
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

  return { current, start, stop, onBoundary }
}
