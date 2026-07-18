// 連続再生の経過時間トラッカー（フェーズ0・最低ライン計測）。
// 再生開始で作り、停止で stop() する。計測結果は flush コールバックへ秒数で渡す。
// 長時間の画面オフ再生中にアプリが落ちても取りこぼしを最小にするため、
// 一定間隔（既定60秒）ごとに途中経過を flush する。
// IndexedDB・ストアには触れない（テスト容易・呼び出し側で配線する）。

export interface PlayTracker {
  /** 計測を終了し、残り秒数を flush する。多重呼び出しは無視。 */
  stop(): void
}

export interface PlayTrackerOptions {
  /** 途中経過を flush する間隔（ms）。既定 60000。 */
  flushIntervalMs?: number
  /** stop 時にこれ未満の残り秒数は捨てる（誤タップの数秒を記録しない）。既定 5。 */
  minSeconds?: number
  /** 現在時刻（ms）。テストで差し替える。既定 Date.now。 */
  now?: () => number
}

export function createPlayTracker(
  flush: (seconds: number) => void,
  opts: PlayTrackerOptions = {},
): PlayTracker {
  const { flushIntervalMs = 60_000, minSeconds = 5, now = Date.now } = opts
  let segmentStart = now()
  let stopped = false

  const flushSegment = (min: number) => {
    const seconds = Math.round((now() - segmentStart) / 1000)
    segmentStart = now()
    if (seconds >= min) flush(seconds)
  }

  const timer = setInterval(() => flushSegment(1), flushIntervalMs)

  return {
    stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      flushSegment(minSeconds)
    },
  }
}
