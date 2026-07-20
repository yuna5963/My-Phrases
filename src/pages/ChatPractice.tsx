import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Phrase } from '../types'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { useChat } from '../store/useChat'
import { buildSession } from '../lib/session'
import { isLongReading } from '../lib/longReading'
import { isSentenceEngine } from '../lib/sentenceEngine'
import { stripThoughts } from '../lib/chatApi'
import type { ChatFocus } from '../lib/coachPrompt'
import { stockKey, useStock } from '../store/useStock'
import UsageBadge from '../components/UsageBadge'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const phrases = useDeck((s) => s.phrases)
  const includeStatuses = useSettings((s) => s.includeStatuses)
  const chatTargetCount = useSettings((s) => s.chatTargetCount)
  const chatApiKey = useSettings((s) => s.chatApiKey)
  const chat = useChat()

  const [input, setInput] = useState('')
  // タブ切替から戻ったとき、まとめ済みセッションはまとめ画面のまま見せる。
  const [ending, setEnding] = useState(() => useChat.getState().status === 'done')
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // チャンク詳細・例文カードから ?focus=<id>&example=<n> で飛んでくると、
  // そのチャンク（と例文の場面）を中心に会話が組まれる。
  const resolveFocus = (): ChatFocus | undefined => {
    const focusId = searchParams.get('focus')
    if (!focusId) return undefined
    const phrase = phrases.find((p) => p.id === focusId)
    if (!phrase) return undefined
    const exIdx = Number(searchParams.get('example'))
    const example =
      Number.isInteger(exIdx) && exIdx >= 0 ? phrase.examples[exIdx] : undefined
    return { phrase, example }
  }

  // 対象チャンク: フォーカス指定を先頭に、SRSの期日到来（弱い順）→ランダム補充。
  const pickTargets = (focus?: ChatFocus): Phrase[] => {
    const pool = phrases.filter(
      (p) =>
        !isLongReading(p) &&
        !isSentenceEngine(p) &&
        (includeStatuses.length === 0 || includeStatuses.includes(p.status)),
    )
    const progress = useDeck.getState().progress
    const due = buildSession(pool, progress, includeStatuses, chatTargetCount)
    const rest = shuffle(pool.filter((p) => !due.some((d) => d.id === p.id)))
    const picked = [...due, ...rest]
    if (!focus) return picked.slice(0, chatTargetCount)
    return [
      focus.phrase,
      ...picked.filter((p) => p.id !== focus.phrase.id),
    ].slice(0, Math.max(chatTargetCount, 1))
  }

  useEffect(() => {
    if (!chatApiKey || phrases.length === 0) return
    const focus = resolveFocus()
    const existing = useChat.getState()
    // 他ページと行き来しても会話・まとめが消えないよう、既存セッションは
    // （進行中でもまとめ済みでも）そのまま再開する。新しく始まるのは
    // フォーカス指定（チャンク詳細・例文カード発）と「もう一度」ボタンのみ。
    if (!focus && existing.messages.length > 0) return
    setEnding(false)
    chat.startSession(pickTargets(focus), focus)
    // マウント時に1回だけ判断する（途中で設定が変わっても組み直さない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = chat.messages.filter((m) => !m.hidden)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visible.length, visible[visible.length - 1]?.content])

  // ソフトウェアキーボードの開閉（=ビューポートの高さ変化）で会話が隠れないよう、
  // 高さが変わったら最新メッセージまでスクロールし直す（LINE風の入力感）。
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => bottomRef.current?.scrollIntoView({ block: 'end' })
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

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
    setCopied(false)
    // 「もう一度」は新しいチャンクで（フォーカス指定は引き継がない）。
    setSearchParams({}, { replace: true })
    chat.startSession(pickTargets())
  }

  /** まとめの共有用テキスト（メール本文・コピー共通）。 */
  const buildShareText = (summaryText: string): string => {
    const lines = [
      'チャット練習のまとめ',
      '',
      `使えたチャンク: ${chat.usedChunkIds.length} / ${chat.targets.length}`,
      ...chat.targets.map(
        (p) => `${chat.usedChunkIds.includes(p.id) ? '✓' : '・'} ${p.en}（${p.ja}）`,
      ),
      '',
      summaryText,
    ]
    if (chat.suggestions.length > 0) {
      lines.push('', '追加すると良さそうな表現:')
      for (const s of chat.suggestions) lines.push(`＋ ${s.en}${s.ja ? ` — ${s.ja}` : ''}`)
    }
    return lines.join('\n')
  }

  const copyShareText = async (summaryText: string) => {
    try {
      await navigator.clipboard.writeText(buildShareText(summaryText))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (!chatApiKey) {
    return (
      <div className="pt-20 text-center t-muted">
        <p className="text-3xl">💬</p>
        <p className="mt-4">チャット練習には Gemini API キーが必要です。</p>
        <p className="mt-1 text-sm">設定画面でキーを登録してください（無料で取得できます）。</p>
        <Link to="/settings" className="mt-4 inline-block font-medium link underline">
          ⚙️ 設定を開く
        </Link>
      </div>
    )
  }

  if (phrases.length === 0) {
    return (
      <div className="pt-20 text-center t-muted">
        <p>練習できるフレーズがありません。</p>
        <button onClick={() => navigate('/')} className="mt-4 link">
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
        <p className="text-sm t-muted">
          使えたチャンク:{' '}
          <span className="font-bold text-carbon-success">{usedCount}</span> / {chat.targets.length}
        </p>
        <div className="flex flex-wrap gap-2">
          {chat.targets.map((p) => (
            <ChunkChip key={p.id} phrase={p} used={chat.usedChunkIds.includes(p.id)} />
          ))}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto">
          <div className="tile p-4 text-sm leading-relaxed ">
            {streamingSummary ? (
              <p className="whitespace-pre-wrap">{streamingSummary}</p>
            ) : chat.status === 'error' ? (
              <p className="text-carbon-error">{chat.error}</p>
            ) : (
              <p className="t-subtle">まとめを作成中…</p>
            )}
          </div>
          {chat.suggestions.length > 0 && <SuggestionsCard suggestions={chat.suggestions} />}
        </div>
        <div className="space-y-2 pb-2">
          {chat.status === 'done' && (
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`mailto:?subject=${encodeURIComponent('チャット練習のまとめ')}&body=${encodeURIComponent(buildShareText(chat.summary ?? ''))}`}
                className="btn-tertiary px-4 py-2.5 text-center text-sm font-medium"
              >
                ✉️ メールで共有
              </a>
              <button
                onClick={() => copyShareText(chat.summary ?? '')}
                className="btn-tertiary px-4 py-2.5 text-sm font-medium"
              >
                {copied ? '✓ コピーしました' : '📋 内容をコピー'}
              </button>
            </div>
          )}
          <button
            onClick={restart}
            className="btn-primary w-full px-4 py-3 font-medium"
          >
            🔁 もう一度（新しいチャンクで）
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn-tertiary w-full px-4 py-3"
          >
            ホームへ戻る
          </button>
        </div>
      </div>
    )
  }

  // 会話画面も他タブと同じ通常レイアウト（下部ナビあり。v1.0.1）。キーボード表示中は
  // viewport の interactive-widget=resizes-content（Web）/ WebViewのリサイズ（ネイティブ）で
  // 画面全体が縮み、入力バーはキーボードの上に見えたまま。タブ移動しても会話はストアに残る。
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between pb-2">
        <h1 className="font-bold">💬 チャット練習</h1>
        <button
          onClick={onEnd}
          className="chip px-3 py-1 text-sm active:opacity-80"
        >
          終了してまとめ
        </button>
      </header>

      {/* 対象チャンク。使えたら点灯する */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chat.targets.map((p) => (
          <ChunkChip key={p.id} phrase={p} used={chat.usedChunkIds.includes(p.id)} />
        ))}
      </div>
      <UsageBadge className="pb-1 text-right" />

      <div className="flex-1 space-y-3 overflow-y-auto py-3">
        {visible.map((m, i) => {
          // Gemma 4 の内部思考（<thought>…</thought>）は表示しない。
          const text = m.role === 'assistant' ? stripThoughts(m.content) : m.content
          return (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-none px-4 py-2.5 text-sm leading-relaxed ${
 m.role === 'user'
                    ? 'bg-carbon-blue text-white'
                    : 'tile'
                }`}
              >
                {text || <span className="animate-pulse t-subtle">…</span>}
              </div>
            </div>
          )
        })}
        {chat.status === 'error' && (
          <div className="rounded-none border-l-4 border-carbon-error bg-carbon-surface p-3 text-sm text-carbon-error dark:bg-carbon-layer">
            <p>⚠ {chat.error}</p>
            <button onClick={chat.retryLast} className="mt-1 font-medium underline">
              もう一度送る
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-carbon-hairline pt-2 dark:border-carbon-line-dark">
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
          className="input min-h-[44px] flex-1 resize-none px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={!input.trim() || chat.status === 'streaming'}
          className="btn-primary px-4 py-2.5 font-medium"
        >
          送信
        </button>
      </div>
    </div>
  )
}

/**
 * まとめの「追加すると良さそうな表現」。チェックすると表現ストック（端末内）に
 * 保存され、数日分ためて PC でまとめて例文作成 → Notion 追加できる。
 */
function SuggestionsCard({ suggestions }: { suggestions: { en: string; ja: string }[] }) {
  const items = useStock((s) => s.items)
  const add = useStock((s) => s.add)
  const remove = useStock((s) => s.remove)
  const stocked = (en: string) => items.some((i) => stockKey(i.en) === stockKey(en))

  return (
    <div className="rounded-none border-l-4 border-carbon-success bg-carbon-surface p-4 dark:bg-carbon-layer">
      <h2 className="text-sm font-semibold text-carbon-success">
        ➕ 追加すると良さそうな表現
      </h2>
      <p className="t-muted mt-0.5 text-xs">
        チェックすると端末の「表現ストック」にたまります（あとで PC からまとめて Notion へ）
      </p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {suggestions.map((s) => {
          const checked = stocked(s.en)
          return (
            <li key={s.en}>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => (checked ? remove(s.en) : add(s))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                />
                <span>
                  <span className="font-medium">{s.en}</span>
                  {s.ja && <span className="t-muted"> — {s.ja}</span>}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <Link
        to="/stock"
        className="link mt-3 inline-block text-sm font-medium underline"
      >
        📥 表現ストックを見る（{items.length}件）
      </Link>
    </div>
  )
}

function ChunkChip({ phrase, used }: { phrase: Phrase; used: boolean }) {
  return (
    <span
      className={`shrink-0 px-3 py-1 text-xs ${
 used
          ? 'rounded-none bg-carbon-success text-white'
          : 'chip'
      }`}
      title={phrase.ja}
    >
      {used ? '✓ ' : ''}
      {phrase.en}
    </span>
  )
}
