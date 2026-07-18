// 連続再生中の経過時間を学習ログへ流す配線フック。
// active（=playing）の間だけトラッカーを生かし、停止・アンマウントで残りを flush する。
import { useEffect } from 'react'
import { createPlayTracker } from '../lib/playTracker'
import { useDeck } from '../store/useDeck'

export function usePlayTracking(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const tracker = createPlayTracker((seconds) => {
      void useDeck.getState().notePlayback(seconds)
    })
    return () => tracker.stop()
  }, [active])
}
