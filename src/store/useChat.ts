// チャット練習のセッション状態。会話は揮発でよいので persist しない。
// ストリーミング更新や中断はレンダリング外で扱いたいので、コンポーネント state ではなくストアに置く。
import { create } from 'zustand'
import type { Phrase } from '../types'
import { ChatApiError, streamChat, stripThoughts, type ChatMessage } from '../lib/chatApi'
import { findUsedChunks } from '../lib/chunkMatch'
import { buildKickoffPrompt, buildSummaryPrompt, buildSystemPrompt } from '../lib/coachPrompt'
import { useSettings } from './useSettings'

export interface UiMessage {
  role: 'user' | 'assistant'
  content: string
  /** キックオフ・まとめ依頼などの内部ターン。画面には出さないが履歴としては送る。 */
  hidden?: boolean
}

/** APIに送る履歴の上限ターン数（トークン節約。それより前は切り捨てる）。 */
const HISTORY_LIMIT = 20

export type ChatStatus = 'idle' | 'streaming' | 'error' | 'done'

interface ChatState {
  targets: Phrase[]
  usedChunkIds: string[]
  messages: UiMessage[]
  status: ChatStatus
  error: string | null
  /** 終了時のまとめ（サマリー画面用） */
  summary: string | null
  startSession: (targets: Phrase[]) => Promise<void>
  sendUserMessage: (text: string) => Promise<void>
  /** エラー後、履歴を消さずに直前のリクエストをやり直す。 */
  retryLast: () => Promise<void>
  requestSummary: () => Promise<void>
  endSession: () => void
}

let controller: AbortController | null = null
let systemPrompt = ''

function toApiMessages(messages: UiMessage[]): ChatMessage[] {
  const recent = messages.slice(-HISTORY_LIMIT)
  return [
    { role: 'system', content: systemPrompt },
    // 過去のアシスタント発話から <thought> を除いて送る（トークン節約＋思考癖の再誘発防止）。
    ...recent.map(
      (m): ChatMessage => ({
        role: m.role,
        content: m.role === 'assistant' ? stripThoughts(m.content) : m.content,
      }),
    ),
  ]
}

export const useChat = create<ChatState>()((set, get) => {
  /** 現在の履歴でアシスタント応答を1つストリーミング取得して末尾に追記する。 */
  async function runAssistantTurn(): Promise<string | null> {
    const { chatApiKey, chatModel } = useSettings.getState()
    controller?.abort()
    const my = new AbortController()
    controller = my
    // セッション再開始・終了後に古いストリームが状態へ書き込まないよう、
    // 自分が最新の実行かを controller の同一性で判定する。
    const stale = () => controller !== my
    const request = toApiMessages(get().messages)
    set((s) => ({
      status: 'streaming',
      error: null,
      messages: [...s.messages, { role: 'assistant', content: '' }],
    }))
    try {
      const full = await streamChat({
        apiKey: chatApiKey,
        model: chatModel,
        messages: request,
        signal: my.signal,
        onDelta: (delta) => {
          if (stale()) return
          set((s) => {
            const messages = [...s.messages]
            const last = messages[messages.length - 1]
            messages[messages.length - 1] = { ...last, content: last.content + delta }
            return { messages }
          })
        },
      })
      if (stale()) return null
      set({ status: 'idle' })
      return full
    } catch (e) {
      if (stale() || (e as Error).name === 'AbortError') return null
      // 空のアシスタントバブルを消し、履歴（ユーザー発話）は残したままエラー表示にする。
      set((s) => {
        const messages = [...s.messages]
        if (messages[messages.length - 1]?.role === 'assistant') messages.pop()
        return {
          messages,
          status: 'error',
          error: e instanceof ChatApiError ? e.message : '応答の取得に失敗しました',
        }
      })
      return null
    }
  }

  return {
    targets: [],
    usedChunkIds: [],
    messages: [],
    status: 'idle',
    error: null,
    summary: null,

    startSession: async (targets) => {
      const { chatFeedbackJa } = useSettings.getState()
      controller?.abort()
      systemPrompt = buildSystemPrompt(targets, chatFeedbackJa)
      set({
        targets,
        usedChunkIds: [],
        messages: [{ role: 'user', content: buildKickoffPrompt(), hidden: true }],
        status: 'idle',
        error: null,
        summary: null,
      })
      await runAssistantTurn()
    },

    sendUserMessage: async (text) => {
      const trimmed = text.trim()
      if (!trimmed || get().status === 'streaming') return
      const used = findUsedChunks(get().targets, trimmed)
      set((s) => ({
        messages: [...s.messages, { role: 'user', content: trimmed }],
        usedChunkIds: [...new Set([...s.usedChunkIds, ...used])],
      }))
      await runAssistantTurn()
    },

    retryLast: async () => {
      if (get().status !== 'error') return
      await runAssistantTurn()
    },

    requestSummary: async () => {
      if (get().status === 'streaming') controller?.abort()
      const { chatFeedbackJa } = useSettings.getState()
      set((s) => ({
        messages: [
          ...s.messages,
          { role: 'user', content: buildSummaryPrompt(chatFeedbackJa), hidden: true },
        ],
      }))
      const full = await runAssistantTurn()
      if (full !== null) set({ summary: stripThoughts(full), status: 'done' })
    },

    endSession: () => {
      controller?.abort()
      controller = null
      systemPrompt = ''
      set({
        targets: [],
        usedChunkIds: [],
        messages: [],
        status: 'idle',
        error: null,
        summary: null,
      })
    },
  }
})
