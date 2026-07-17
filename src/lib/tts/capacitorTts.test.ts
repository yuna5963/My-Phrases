import { beforeEach, describe, expect, it, vi } from 'vitest'

// プラグインをモックしてネイティブエンジンの写像ロジックだけを検証する。
const speakMock = vi.fn<(o: Record<string, unknown>) => Promise<void>>()
const stopMock = vi.fn(() => Promise.resolve())
const getSupportedVoicesMock = vi.fn()
type RangeStartCb = (info: { start: number }) => void
const addListenerMock = vi.fn<(name: string, cb: RangeStartCb) => Promise<{ remove: () => Promise<void> }>>(
  () => Promise.resolve({ remove: () => Promise.resolve() }),
)

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: {
    speak: (o: Record<string, unknown>) => speakMock(o),
    stop: () => stopMock(),
    getSupportedVoices: () => getSupportedVoicesMock(),
    addListener: (name: string, cb: RangeStartCb) => addListenerMock(name, cb),
  },
}))

const { capacitorTtsEngine } = await import('./capacitorTts')

const VOICES = [
  { voiceURI: 'en-us-a', name: 'A', lang: 'en-US', localService: true, default: false },
  { voiceURI: 'en-gb-b', name: 'B', lang: 'en-GB', localService: true, default: false },
  { voiceURI: 'ja-jp-c', name: 'C', lang: 'ja-JP', localService: true, default: false },
]

beforeEach(async () => {
  vi.clearAllMocks()
  getSupportedVoicesMock.mockResolvedValue({ voices: VOICES })
  await capacitorTtsEngine.loadVoices()
})

describe('capacitorTtsEngine', () => {
  it('loadVoices はプラグインの声を TtsVoice 形状で返す', async () => {
    const v = await capacitorTtsEngine.loadVoices()
    expect(v).toHaveLength(3)
    expect(v[0]).toEqual(VOICES[0])
    expect(capacitorTtsEngine.voicesNow()).toHaveLength(3)
  })

  it('speak は選択声の index と lang を渡す', () => {
    speakMock.mockResolvedValue(undefined)
    capacitorTtsEngine.speak('hello', { rate: 0.9 }, VOICES[1])
    expect(speakMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello', lang: 'en-GB', rate: 0.9, voice: 1 }),
    )
  })

  it('日本語は rate 指定を無視して等倍で読む（Webと同じ規則）', () => {
    speakMock.mockResolvedValue(undefined)
    capacitorTtsEngine.speak('こんにちは', { rate: 0.7, lang: 'ja-JP' }, VOICES[2])
    expect(speakMock).toHaveBeenCalledWith(expect.objectContaining({ rate: 1, lang: 'ja-JP' }))
  })

  it('声が無ければ voice index を渡さず lang 任せにする', () => {
    speakMock.mockResolvedValue(undefined)
    capacitorTtsEngine.speak('hello', { lang: 'en-US' }, undefined)
    const arg = speakMock.mock.calls[0][0]
    expect(arg.voice).toBeUndefined()
    expect(arg.lang).toBe('en-US')
  })

  it('発話完了で onEnd、失敗で onError が呼ばれる', async () => {
    speakMock.mockResolvedValue(undefined)
    const onEnd = vi.fn()
    capacitorTtsEngine.speak('a', { onEnd }, VOICES[0])
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1))

    speakMock.mockRejectedValue(new Error('boom'))
    const onError = vi.fn()
    capacitorTtsEngine.speak('b', { onError }, VOICES[0])
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('再生に失敗しました'))
  })

  it('stop() 後は古い発話のコールバックを発火させない（連鎖暴走防止）', async () => {
    let resolveSpeak: () => void = () => {}
    speakMock.mockReturnValue(new Promise<void>((r) => (resolveSpeak = r)))
    const onEnd = vi.fn()
    capacitorTtsEngine.speak('a', { onEnd }, VOICES[0])
    capacitorTtsEngine.stop()
    resolveSpeak()
    await new Promise((r) => setTimeout(r, 0))
    expect(onEnd).not.toHaveBeenCalled()
    expect(stopMock).toHaveBeenCalled()
  })

  it('新しい speak が来たら古い発話のコールバックは無効になる', async () => {
    let resolveFirst: () => void = () => {}
    speakMock.mockReturnValueOnce(new Promise<void>((r) => (resolveFirst = r)))
    speakMock.mockResolvedValueOnce(undefined)
    const first = vi.fn()
    const second = vi.fn()
    capacitorTtsEngine.speak('a', { onEnd: first }, VOICES[0])
    capacitorTtsEngine.speak('b', { onEnd: second }, VOICES[0])
    resolveFirst()
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1))
    expect(first).not.toHaveBeenCalled()
  })

  it('onBoundary 指定時は onRangeStart リスナーを1本だけ張り charIndex を中継する', () => {
    speakMock.mockResolvedValue(undefined)
    const onBoundary = vi.fn()
    capacitorTtsEngine.speak('a b c', { onBoundary }, VOICES[0])
    capacitorTtsEngine.speak('d e f', { onBoundary }, VOICES[0])
    expect(addListenerMock).toHaveBeenCalledTimes(1)
    const cb = addListenerMock.mock.calls[0][1]
    cb({ start: 4 })
    expect(onBoundary).toHaveBeenCalledWith(4)
  })
})
