import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateKeepAliveWav,
  isKeepAliveActive,
  stopKeepAlive,
  updateKeepAliveMetadata,
} from './keepAlive'

/** リトルエンディアンでサンプル列（Int16）を取り出す。 */
function samplesOf(wav: Uint8Array): Int16Array {
  return new Int16Array(wav.buffer, 44, (wav.length - 44) / 2)
}

const ascii = (wav: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...wav.slice(start, start + len))

describe('generateKeepAliveWav', () => {
  it('正しい RIFF/WAVE ヘッダを持つ（PCM・モノラル・8kHz・16bit・30秒）', () => {
    const wav = generateKeepAliveWav()
    const view = new DataView(wav.buffer)
    expect(ascii(wav, 0, 4)).toBe('RIFF')
    expect(ascii(wav, 8, 4)).toBe('WAVE')
    expect(ascii(wav, 12, 4)).toBe('fmt ')
    expect(ascii(wav, 36, 4)).toBe('data')
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // モノラル
    expect(view.getUint32(24, true)).toBe(8000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(480000) // 8000サンプル×30秒×2バイト
    expect(wav.length).toBe(44 + 480000)
  })

  it('メディア通知の条件（Android Chrome: 5秒以上）を満たす長さがある', () => {
    const view = new DataView(generateKeepAliveWav().buffer)
    const seconds = view.getUint32(40, true) / 2 / view.getUint32(24, true)
    expect(seconds).toBeGreaterThanOrEqual(5)
  })

  it('デジタル無音ではない（0でないサンプルがある）', () => {
    const s = samplesOf(generateKeepAliveWav())
    expect([...s].some((v) => Math.abs(v) > 0)).toBe(true)
  })

  it('振幅が指定値を超えない', () => {
    const check = (spec: Parameters<typeof generateKeepAliveWav>[0], amplitude: number) => {
      const s = samplesOf(generateKeepAliveWav(spec))
      const max = [...s].reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      expect(max).toBeLessThanOrEqual(amplitude * 32767 + 1) // 丸め分の余裕
      expect(max).toBeGreaterThan(0)
    }
    check(undefined, 0.02)
    check({ amplitude: 0.05 }, 0.05)
  })

  it('ループ境界が位相連続（先頭=0・末尾は位相1ステップ以内）でクリック音が出ない', () => {
    // 末尾サンプルは周期終端の 1 サンプル手前なので、0 ちょうどではなく
    // |peak × sin(2πf/sr)|（位相1ステップ分）以下であれば連続にループする。
    const check = (spec: Parameters<typeof generateKeepAliveWav>[0]) => {
      const { sampleRate = 8000, freqHz = 40, amplitude = 0.02 } = spec ?? {}
      const s = samplesOf(generateKeepAliveWav(spec))
      const stepBound = amplitude * 32767 * Math.sin((2 * Math.PI * freqHz) / sampleRate) + 1
      expect(s[0]).toBe(0)
      expect(Math.abs(s[s.length - 1])).toBeLessThanOrEqual(stepBound)
    }
    check(undefined)
    check({ freqHz: 50, seconds: 2 })
  })
})

/** <audio> と Blob URL の最小スタブ。生成した要素を返す。 */
function stubAudio() {
  const listeners: Record<string, (() => void)[]> = {}
  const el = {
    loop: false,
    volume: 0,
    currentTime: 0,
    playCount: 0,
    play: vi.fn(async () => {
      el.playCount++
    }),
    pause: vi.fn(() => {}),
    addEventListener: (type: string, fn: () => void) => {
      ;(listeners[type] ??= []).push(fn)
    },
    /** ブラウザ側の都合（音声フォーカス喪失など）で止まった状況を再現する。 */
    firePause: () => listeners.pause?.forEach((fn) => fn()),
  }
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return el as unknown as HTMLAudioElement
      }
    },
  )
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:stub' })
  vi.stubGlobal('MediaMetadata', class {})
  return el
}

describe('ネイティブ用オプション', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('resilient: 外から止められても再生全体は止めず、鳴らし直す', async () => {
    const el = stubAudio()
    vi.resetModules()
    const m = await import('./keepAlive')
    const onExternalPause = vi.fn()
    expect(await m.startKeepAlive({ title: 't', resilient: true, onExternalPause })).toBe(true)
    expect(el.playCount).toBe(1)

    el.firePause()
    expect(onExternalPause).not.toHaveBeenCalled()
    expect(m.isKeepAliveActive()).toBe(true)
    expect(el.playCount).toBe(2)
  })

  it('resilient なし（Web）: 外から止められたら再生全体を止める', async () => {
    const el = stubAudio()
    vi.resetModules()
    const m = await import('./keepAlive')
    const onExternalPause = vi.fn()
    expect(await m.startKeepAlive({ title: 't', onExternalPause })).toBe(true)

    el.firePause()
    expect(onExternalPause).toHaveBeenCalledTimes(1)
    expect(m.isKeepAliveActive()).toBe(false)
  })

  it('useMediaSession: false のとき Media Session を触らない', async () => {
    stubAudio()
    const mediaSession = { playbackState: 'none', metadata: null, setActionHandler: vi.fn() }
    vi.stubGlobal('navigator', { mediaSession })
    vi.resetModules()
    const m = await import('./keepAlive')
    await m.startKeepAlive({ title: 't', resilient: true, useMediaSession: false })
    expect(mediaSession.setActionHandler).not.toHaveBeenCalled()
    expect(mediaSession.playbackState).toBe('none')
    expect(mediaSession.metadata).toBe(null)
  })
})

describe('DOM 非対応環境（node）での安全性', () => {
  it('DOM側APIは例外を投げず no-op になる', () => {
    expect(isKeepAliveActive()).toBe(false)
    expect(() => updateKeepAliveMetadata({ title: 't' })).not.toThrow()
    expect(() => stopKeepAlive()).not.toThrow()
  })
})
