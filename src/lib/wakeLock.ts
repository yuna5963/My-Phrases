// Screen Wake Lock helper.
//
// スマホはブラウザの読み上げ（Web Speech API）を画面消灯と同時に止めてしまう。
// 連続再生の間だけ画面のスリープを抑止して、再生が途切れないようにする。
// （ブラウザでは「画面を完全に消したまま」音声を鳴らし続ける確実な方法が無いため、
//  画面を点けたままにするこの方式が現実的な対策。）
import { useEffect } from 'react'

// 古い DOM 型定義には WakeLock が無い環境があるので最小限の型を補う。
interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', cb: () => void) => void
}
interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

function getWakeLock(): WakeLockLike | null {
  const nav = navigator as unknown as { wakeLock?: WakeLockLike }
  return nav.wakeLock ?? null
}

let sentinel: WakeLockSentinelLike | null = null

export async function requestWakeLock(): Promise<void> {
  const wl = getWakeLock()
  if (!wl || sentinel) return
  try {
    sentinel = await wl.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    // ユーザー操作外・非対応など。黙って諦める（再生自体は続行）。
    sentinel = null
  }
}

export async function releaseWakeLock(): Promise<void> {
  const s = sentinel
  sentinel = null
  try {
    await s?.release()
  } catch {
    /* ignore */
  }
}

/**
 * `active` の間だけ画面スリープを抑止する。タブが裏に回ると Wake Lock は
 * 自動解放されるので、復帰時（visibilitychange）に取り直す。
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    requestWakeLock()
    const onVisible = () => {
      if (document.visibilityState === 'visible') requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      releaseWakeLock()
    }
  }, [active])
}
