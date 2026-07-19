// チャット練習のセッション状態。会話は揮発でよいので persist しない。
// ストリーミング更新や中断はレンダリング外で扱いたいので、コンポーネント state ではなくストアに置く。
import { create } from 'zustand'
import type { Phrase } from '../types'
import { ChatApiError, streamChat, stripThoughts, type ChatMessage } from '../lib/chatApi'
import { findUsedChunks } from '../lib/chunkMatch'
import {
  buildKickoffPrompt,
  buildSummaryPrompt,
  buildSystemPrompt,
  type ChatFocus,
} from '../lib/coachPrompt'
import { extractSuggestions, filterNewSuggestions, type Suggestion } from '../lib/suggestions'
import { useDeck } from './useDeck'
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
  /** まとめから抽出した、デッキ未収載の追加候補チャンク */
  suggestions: Suggestion[]
  startSession: (targets: Phrase[], focus?: ChatFocus) => Promise<void>
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
    suggestions: [],

    startSession: async (targets, focus) => {
      const { chatFeedbackJa } = useSettings.getState()
      controller?.abort()
      systemPrompt = buildSystemPrompt(targets, chatFeedbackJa, focus)
      set({
        targets,
        usedChunkIds: [],
        messages: [{ role: 'user', content: buildKickoffPrompt(), hidden: true }],
        status: 'idle',
        error: null,
        summary: null,
        suggestions: [],
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
      if (full !== null) {
        // ➕ 行（追加候補）を本文から分離し、デッキに既にある表現は除外する。
        const { body, suggestions } = extractSuggestions(stripThoughts(full))
        const { targets, usedChunkIds, messages } = get()
        // 学習ログ（追記）＝1セッション完了。実戦投入率の材料を残し、当日の最低ライン達成で
        // ストリークも維持する（noteChatComplete）。usedChunkIds は endSession で消えるため、
        // 消える前のこのタイミングで永続化する。ログ失敗はまとめ表示を妨げない。
        try {
          await useDeck
            .getState()
            .noteChatComplete(
              targets.map((p) => p.id),
              usedChunkIds,
              messages.filter((m) => m.role === 'user' && !m.hidden).length,
            )
        } catch {
          /* ログは best-effort */
        }
        set({
          summary: body,
          suggestions: filterNewSuggestions(suggestions, useDeck.getState().phrases),
          status: 'done',
        })
      }
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
        suggestions: [],
      })
    },
  }
})
