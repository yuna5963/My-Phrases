// OpenAI 形式（chat/completions）の最小クライアント。
// Gemini API の OpenAI 互換エンドポイントをブラウザから直接呼ぶ。
// SDK は使わず fetch + ReadableStream で SSE をパースする（バンドル肥大回避）。

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export type ChatErrorKind = 'auth' | 'rate' | 'network' | 'server'

export class ChatApiError extends Error {
  kind: ChatErrorKind
  status?: number
  constructor(kind: ChatErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ChatApiError'
    this.kind = kind
    this.status = status
  }
}

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

export interface StreamChatOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  signal?: AbortSignal
  /** ストリーミングで届いた差分テキストごとに呼ばれる。 */
  onDelta?: (text: string) => void
  temperature?: number
}

/**
 * SSE バッファから完結したイベントの data ペイロードを取り出す。
 * イベント境界（空行）が来ていない末尾は rest として持ち越す。
 */
export function parseSseChunk(buffer: string): { events: string[]; rest: string } {
  const events: string[] = []
  // イベントは空行区切り。CRLF の可能性も吸収する。
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  for (const part of parts) {
    const data = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (data) events.push(data)
  }
  return { events, rest }
}

/**
 * Gemma 4 は応答の先頭に <thought>…</thought> の内部思考を出力することがある。
 * 表示・履歴送信の前にこれを取り除く。ストリーミング途中で閉じタグが
 * まだ届いていない場合は、開きタグ以降をすべて隠す（届き次第、本文が現れる）。
 */
export function stripThoughts(text: string): string {
  let t = text.replace(/<(thought|thinking|think)>[\s\S]*?<\/\1>/gi, '')
  const open = t.match(/<(thought|thinking|think)>/i)
  if (open) t = t.slice(0, open.index)
  return t.replace(/^\s+/, '')
}

/** SSE の data ペイロード1件から差分テキストを取り出す（無ければ ''）。 */
function extractDelta(payload: string): string {
  try {
    const json = JSON.parse(payload)
    return json?.choices?.[0]?.delta?.content ?? ''
  } catch {
    return ''
  }
}

function mapHttpError(status: number, body: string): ChatApiError {
  if (status === 401 || status === 403)
    return new ChatApiError('auth', `APIキーが無効です (${status})`, status)
  if (status === 429)
    return new ChatApiError('rate', '利用上限に達しました。少し待ってからもう一度お試しください', status)
  return new ChatApiError('server', `サーバーエラー (${status}): ${body.slice(0, 200)}`, status)
}

/**
 * Gemma 系モデルは system ロールを 400 で拒否することがある。
 * その場合に備えて system を最初の user メッセージへ前置した形へ変換する。
 */
export function foldSystemIntoUser(messages: ChatMessage[]): ChatMessage[] {
  if (messages[0]?.role !== 'system') return messages
  const [system, ...rest] = messages
  const firstUserIdx = rest.findIndex((m) => m.role === 'user')
  if (firstUserIdx === -1) {
    return [{ role: 'user', content: system.content }, ...rest]
  }
  return rest.map((m, i) =>
    i === firstUserIdx ? { ...m, content: `${system.content}\n\n---\n\n${m.content}` } : m,
  )
}

async function requestStream(
  opts: StreamChatOptions,
  messages: ChatMessage[],
): Promise<Response> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        stream: true,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new ChatApiError(
      'network',
      offline ? 'オフラインです。接続を確認してください' : '通信に失敗しました',
    )
  }
  return res
}

/**
 * チャット補完をストリーミング取得する。完了時に全文を返す。
 * system ロールが 400 で拒否された場合は user へ前置してリトライする。
 */
export async function streamChat(opts: StreamChatOptions): Promise<string> {
  let res = await requestStream(opts, opts.messages)

  if (res.status === 400 && opts.messages[0]?.role === 'system') {
    res = await requestStream(opts, foldSystemIntoUser(opts.messages))
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw mapHttpError(res.status, body)
  }

  let full = ''
  const consume = (payload: string) => {
    if (payload === '[DONE]') return
    const delta = extractDelta(payload)
    if (delta) {
      full += delta
      opts.onDelta?.(delta)
    }
  }

  if (!res.body) {
    // ストリーミング非対応環境: 全文を一括で受けてから同じ経路でパースする。
    const text = await res.text()
    const { events, rest } = parseSseChunk(text + '\n\n')
    for (const ev of events) consume(ev)
    if (rest) consume(rest)
    return full
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSseChunk(buffer)
    buffer = rest
    for (const ev of events) consume(ev)
  }
  // 終端が空行で終わらないサーバーに備え、残りも処理する。
  if (buffer) {
    const { events } = parseSseChunk(buffer + '\n\n')
    for (const ev of events) consume(ev)
  }
  return full
}
