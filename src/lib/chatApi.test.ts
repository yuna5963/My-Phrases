import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ChatApiError,
  foldSystemIntoUser,
  parseSseChunk,
  streamChat,
  type ChatMessage,
} from './chatApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseSseChunk', () => {
  it('空行区切りの data イベントを取り出す', () => {
    const { events, rest } = parseSseChunk('data: {"a":1}\n\ndata: {"b":2}\n\n')
    expect(events).toEqual(['{"a":1}', '{"b":2}'])
    expect(rest).toBe('')
  })

  it('未完のイベントは rest に持ち越す', () => {
    const { events, rest } = parseSseChunk('data: {"a":1}\n\ndata: {"b"')
    expect(events).toEqual(['{"a":1}'])
    expect(rest).toBe('data: {"b"')
  })

  it('CRLF 区切りも扱える', () => {
    const { events } = parseSseChunk('data: x\r\n\r\n')
    expect(events).toEqual(['x'])
  })

  it('[DONE] も data として返す', () => {
    const { events } = parseSseChunk('data: [DONE]\n\n')
    expect(events).toEqual(['[DONE]'])
  })
})

describe('foldSystemIntoUser', () => {
  it('system を最初の user メッセージに前置する', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]
    const folded = foldSystemIntoUser(messages)
    expect(folded).toHaveLength(2)
    expect(folded[0].role).toBe('user')
    expect(folded[0].content).toContain('SYS')
    expect(folded[0].content).toContain('Hello')
    expect(folded[1]).toEqual({ role: 'assistant', content: 'Hi' })
  })

  it('system が無ければそのまま返す', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
    expect(foldSystemIntoUser(messages)).toEqual(messages)
  })

  it('user が無い場合は system を user に変換する', () => {
    const folded = foldSystemIntoUser([{ role: 'system', content: 'SYS' }])
    expect(folded).toEqual([{ role: 'user', content: 'SYS' }])
  })
})

/** SSE ボディを指定チャンクに割って返す Response を作る。 */
function sseResponse(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, ...init })
}

function sseEvent(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
}

describe('streamChat', () => {
  const baseOpts = {
    apiKey: 'k',
    model: 'm',
    messages: [{ role: 'user', content: 'hi' }] as ChatMessage[],
  }

  it('チャンク跨ぎの SSE を連結して全文を返す', async () => {
    const body = sseEvent('Hel') + sseEvent('lo!') + 'data: [DONE]\n\n'
    // イベント境界とずれた位置で分割する
    const chunks = [body.slice(0, 25), body.slice(25, 60), body.slice(60)]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(chunks)))

    const deltas: string[] = []
    const full = await streamChat({ ...baseOpts, onDelta: (d) => deltas.push(d) })
    expect(full).toBe('Hello!')
    expect(deltas.join('')).toBe('Hello!')
  })

  it('401 は auth エラーになる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 401 })))
    await expect(streamChat(baseOpts)).rejects.toMatchObject({ kind: 'auth' })
  })

  it('429 は rate エラーになる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota', { status: 429 })))
    await expect(streamChat(baseOpts)).rejects.toMatchObject({ kind: 'rate' })
  })

  it('fetch 失敗は network エラーになる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(streamChat(baseOpts)).rejects.toMatchObject({ kind: 'network' })
    await expect(streamChat(baseOpts)).rejects.toBeInstanceOf(ChatApiError)
  })

  it('system ロールが 400 で拒否されたら user へ前置してリトライする', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('system role not supported', { status: 400 }))
      .mockResolvedValueOnce(sseResponse([sseEvent('ok'), 'data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    const full = await streamChat({
      ...baseOpts,
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'hi' },
      ],
    })
    expect(full).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(secondBody.messages.some((m: ChatMessage) => m.role === 'system')).toBe(false)
    expect(secondBody.messages[0].content).toContain('SYS')
  })
})
