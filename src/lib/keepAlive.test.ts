import { describe, expect, it } from 'vitest'
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
  it('正しい RIFF/WAVE ヘッダを持つ（PCM・モノラル・8kHz・16bit・1秒）', () => {
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
    expect(view.getUint32(40, true)).toBe(16000) // 8000サンプル×2バイト
    expect(wav.length).toBe(44 + 16000)
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
    check(undefined, 0.01)
    check({ amplitude: 0.05 }, 0.05)
  })

  it('ループ境界が位相連続（先頭=0・末尾は位相1ステップ以内）でクリック音が出ない', () => {
    // 末尾サンプルは周期終端の 1 サンプル手前なので、0 ちょうどではなく
    // |peak × sin(2πf/sr)|（位相1ステップ分）以下であれば連続にループする。
    const check = (spec: Parameters<typeof generateKeepAliveWav>[0]) => {
      const { sampleRate = 8000, freqHz = 40, amplitude = 0.01 } = spec ?? {}
      const s = samplesOf(generateKeepAliveWav(spec))
      const stepBound = amplitude * 32767 * Math.sin((2 * Math.PI * freqHz) / sampleRate) + 1
      expect(s[0]).toBe(0)
      expect(Math.abs(s[s.length - 1])).toBeLessThanOrEqual(stepBound)
    }
    check(undefined)
    check({ freqHz: 50, seconds: 2 })
  })
})

describe('DOM 非対応環境（node）での安全性', () => {
  it('DOM側APIは例外を投げず no-op になる', () => {
    expect(isKeepAliveActive()).toBe(false)
    expect(() => updateKeepAliveMetadata({ title: 't' })).not.toThrow()
    expect(() => stopKeepAlive()).not.toThrow()
  })
})
