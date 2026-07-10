import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Phrase } from '../types'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { useChat } from '../store/useChat'
import { buildSession } from '../lib/session'
import { isLongReading } from '../lib/longReading'
import { stripThoughts } from '../lib/chatApi'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * チャット練習: AIコーチと英語で雑談しながら、SRSで選んだ対象チャンクを
 * 会話の中で使う。使えたチャンクはチップが点灯し、終了時に日本語まとめが出る。
 */
export default function ChatPractice() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const includeStatuses = useSettings((s) => s.includeStatuses)
  const chatTargetCount = useSettings((s) => s.chatTargetCount)
  const chatApiKey = useSettings((s) => s.chatApiKey)
  const chat = useChat()

  const [input, setInput] = useState('')
  const [ending, setEnding] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 対象チャンク: SRSの期日到来（弱い順）を優先し、足りなければランダムで補充。
  const pickTargets = (): Phrase[] => {
    const pool = phrases.filter(
      (p) =>
        !isLongReading(p) &&
        (includeStatuses.length === 0 || includeStatuses.includes(p.status)),
    )
    const progress = useDeck.getState().progress
    const due = buildSession(pool, progress, includeStatuses, chatTargetCount)
    if (due.length >= chatTargetCount) return due
    const rest = shuffle(pool.filter((p) => !due.some((d) => d.id === p.id)))
    return [...due, ...rest].slice(0, chatTargetCount)
  }

  useEffect(() => {
    if (!chatApiKey || phrases.length === 0) return
    chat.startSession(pickTargets())
    return () => useChat.getState().endSession()
    // マウント時に1回だけセッションを組む（途中で設定が変わっても組み直さない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = chat.messages.filter((m) => !m.hidden)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visible.length, visible[visible.length - 1]?.content])

  const send = () => {
    if (!input.trim() || chat.status === 'streaming') return
    chat.sendUserMessage(input)
    setInput('')
  }

  const onEnd = () => {
    setEnding(true)
    chat.requestSummary()
  }

  const restart = () => {
    setEnding(false)
    setInput('')
    chat.startSession(pickTargets())
  }

  if (!chatApiKey) {
    return (
      <div className="pt-20 text-center text-slate-500">
        <p className="text-3xl">💬</p>
        <p className="mt-4">チャット練習には Gemini API キーが必要です。</p>
        <p className="mt-1 text-sm">設定画面でキーを登録してください（無料で取得できます）。</p>
        <Link to="/settings" className="mt-4 inline-block font-medium text-sky-500 underline">
          ⚙️ 設定を開く
        </Link>
      </div>
    )
  }

  if (phrases.length === 0) {
    return (
      <div className="pt-20 text-center text-slate-500">
        <p>練習できるフレーズがありません。</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sky-500">
          ホームへ戻る
        </button>
      </div>
    )
  }

  // 終了後のまとめ画面（ストリーミング中は書きかけのまとめを表示）
  if (ending) {
    const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant')?.content
    const streamingSummary = chat.summary ?? (lastAssistant ? stripThoughts(lastAssistant) : undefined)
    const usedCount = chat.usedChunkIds.length
    return (
      <div className="flex h-full flex-col gap-4">
        <h1 className="text-xl font-bold">💬 チャット練習 おつかれさま！</h1>
        <p className="text-sm text-slate-500">
          使えたチャンク:{' '}
          <span className="font-bold text-emerald-500">{usedCount}</span> / {chat.targets.length}
        </p>
        <div className="flex flex-wrap gap-2">
          {chat.targets.map((p) => (
            <ChunkChip key={p.id} phrase={p} used={chat.usedChunkIds.includes(p.id)} />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto rounded-2xl bg-white p-4 text-sm leading-relaxed shadow-sm dark:bg-slate-900">
          {streamingSummary ? (
            <p className="whitespace-pre-wrap">{streamingSummary}</p>
          ) : chat.status === 'error' ? (
            <p className="text-rose-500">{chat.error}</p>
          ) : (
            <p className="text-slate-400">まとめを作成中…</p>
          )}
        </div>
        <div className="space-y-2 pb-2">
          <button
            onClick={restart}
            className="w-full rounded-xl bg-sky-500 px-4 py-3 font-medium text-white active:scale-[0.99]"
          >
            🔁 もう一度（新しいチャンクで）
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-500 dark:border-slate-700 active:scale-[0.99]"
          >
            ホームへ戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between pb-2">
        <h1 className="font-bold">💬 チャット練習</h1>
        <button
          onClick={onEnd}
          className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-500 dark:border-slate-700 active:scale-95"
        >
          終了してまとめ
        </button>
      </header>

      {/* 対象チャンク。使えたら点灯する */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {chat.targets.map((p) => (
          <ChunkChip key={p.id} phrase={p} used={chat.usedChunkIds.includes(p.id)} />
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-3">
        {visible.map((m, i) => {
          // Gemma 4 の内部思考（<thought>…</thought>）は表示しない。
          const text = m.role === 'assistant' ? stripThoughts(m.content) : m.content
          return (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'rounded-br-md bg-sky-500 text-white'
                    : 'rounded-bl-md bg-white shadow-sm dark:bg-slate-900'
                }`}
              >
                {text || <span className="animate-pulse text-slate-400">…</span>}
              </div>
            </div>
          )
        })}
        {chat.status === 'error' && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            <p>⚠ {chat.error}</p>
            <button onClick={chat.retryLast} className="mt-1 font-medium underline">
              もう一度送る
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 日本語IMEの変換確定Enterでは送信しない
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="英語で返信してみよう…"
          rows={2}
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          onClick={send}
          disabled={!input.trim() || chat.status === 'streaming'}
          className="rounded-xl bg-sky-500 px-4 py-2.5 font-medium text-white disabled:opacity-40 active:scale-95"
        >
          送信
        </button>
      </div>
    </div>
  )
}

function ChunkChip({ phrase, used }: { phrase: Phrase; used: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs ${
        used
          ? 'bg-emerald-500 text-white'
          : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }`}
      title={phrase.ja}
    >
      {used ? '✓ ' : ''}
      {phrase.en}
    </span>
  )
}
