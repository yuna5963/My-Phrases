import { create } from 'zustand'
import type { Grade, Phrase, Progress } from '../types'
import { applyGrade, newProgress, todayStr } from '../lib/srs'
import {
  clearPhrases,
  clearProgress,
  deletePhrase,
  deleteProgress,
  getAllEvents,
  getAllPhrases,
  getAllProgress,
  getMeta,
  logEvent,
  putPhrases,
  replacePhrases,
  saveProgress,
  setMeta,
} from '../lib/db'
import { makeEvent, type LearningEvent, type PracticeMode } from '../lib/events'
import { eventsOn, minimumLineMet } from '../lib/kpi'
import { mergePhrases, parsePhrasesFromFiles } from '../lib/import'

export type DeckSource = 'imported' | 'sample'
export type ImportMode = 'merge' | 'replace'

export interface ImportSummary {
  mode: ImportMode
  added: number
  updated: number
  kept: number
  total: number // 取り込みファイルに含まれていた件数
}

interface DeckState {
  phrases: Phrase[]
  progress: Record<string, Progress>
  streak: number
  source: DeckSource
  loaded: boolean
  error: string | null
  /** 学習ログ（フェーズ0）。ホームのKPI・ゴール進捗の材料。 */
  events: LearningEvent[]
  /** 選択中のゴールトラックID（''=未選択）。 */
  goalTrackId: string
  load: () => Promise<void>
  /** 学習ログをIndexedDBから読み直す（チャット・教材化の後に呼ぶ）。 */
  refreshEvents: () => Promise<void>
  /** ゴールトラックを選ぶ（meta永続）。 */
  setGoalTrack: (id: string) => Promise<void>
  /** 連続再生の経過秒数を学習ログに記録する。最低ライン（5分）到達でストリークも維持する。 */
  notePlayback: (seconds: number) => Promise<void>
  grade: (id: string, g: Grade, mode?: PracticeMode) => Promise<void>
  setLearned: (id: string, learned: boolean) => Promise<void>
  reset: () => Promise<void>
  importFiles: (files: File[], mode?: ImportMode) => Promise<ImportSummary>
  /** アプリ内で作った教材（教材化・AI長文・手動追加）をデッキへ追記する。 */
  addPhrases: (newPhrases: Phrase[]) => Promise<number>
  /** 教材1件を上書き保存する（チャンク編集）。 */
  updatePhrase: (phrase: Phrase) => Promise<void>
  /** 教材1件を削除する（SRS進捗も一緒に消す）。 */
  removePhrase: (id: string) => Promise<void>
  clearImported: () => Promise<void>
}

function dataUrl(): string {
  // BASE_URL respects vite `base`, works in dev and on static hosts.
  return `${import.meta.env.BASE_URL}data/phrases.json`
}

async function bumpStreak(): Promise<number> {
  const today = todayStr()
  const last = await getMeta<string>('lastStudyDate', '')
  let streak = await getMeta<number>('streak', 0)
  if (last === today) return streak // already counted today
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  streak = last === todayStr(yesterday) ? streak + 1 : 1
  await setMeta('lastStudyDate', today)
  await setMeta('streak', streak)
  return streak
}

async function loadSample(): Promise<Phrase[]> {
  const res = await fetch(dataUrl(), { cache: 'no-cache' })
  if (!res.ok) throw new Error(`phrases.json ${res.status}`)
  return (await res.json()) as Phrase[]
}

/**
 * IndexedDB への最初の書き込み前に呼ぶ。サンプル使用中（DBが空）に差分だけ
 * 保存すると、次の load() でサンプルが「消えた」ように見えるため、
 * 先に現在のデッキ全件を実体化しておく（以後 source は 'imported' になる）。
 */
async function ensurePersisted(get: () => DeckState): Promise<void> {
  const existing = await getAllPhrases()
  if (!existing.length) await putPhrases(get().phrases)
}

export const useDeck = create<DeckState>((set, get) => ({
  phrases: [],
  progress: {},
  streak: 0,
  source: 'sample',
  loaded: false,
  error: null,
  events: [],
  goalTrackId: '',

  load: async () => {
    try {
      // Offline-first: use imported phrases if present, else the bundled sample.
      const imported = await getAllPhrases()
      let phrases: Phrase[]
      let source: DeckSource
      if (imported.length) {
        phrases = imported
        source = 'imported'
      } else {
        phrases = await loadSample()
        source = 'sample'
      }
      // 新しい順（createdTime 降順）。createdTime が無い新CSVは ID 昇順で安定化。
      phrases = [...phrases].sort((a, b) => {
        const ta = a.createdTime || ''
        const tb = b.createdTime || ''
        if (ta !== tb) return ta < tb ? 1 : -1
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      })
      const stored = await getAllProgress()
      const progress: Record<string, Progress> = {}
      for (const p of phrases) {
        const base = stored[p.id] ?? newProgress(p.id)
        // 旧データは learned 欄が無いので false 既定で補完する。
        progress[p.id] = { ...base, learned: base.learned ?? false }
      }
      const streak = await getMeta<number>('streak', 0)
      const events = await getAllEvents()
      const goalTrackId = await getMeta<string>('goalTrackId', '')
      set({ phrases, progress, streak, source, events, goalTrackId, loaded: true, error: null })
    } catch (e) {
      set({ error: (e as Error).message, loaded: true })
    }
  },

  refreshEvents: async () => {
    set({ events: await getAllEvents() })
  },

  setGoalTrack: async (id) => {
    await setMeta('goalTrackId', id)
    set({ goalTrackId: id })
  },

  notePlayback: async (seconds) => {
    if (seconds <= 0) return
    const event = makeEvent('play', { seconds })
    try {
      await logEvent(event)
    } catch {
      return // ログできなければストリーク判定もしない（採点側とは独立）
    }
    const events = [...get().events, event]
    // 「疲れた日は連続再生だけ」でもゼロの日にしない: 今日の最低ライン
    // （採点/チャット1件 or 再生5分）を満たしたらストリークを維持する。
    if (minimumLineMet(eventsOn(events, todayStr()))) {
      const streak = await bumpStreak()
      set({ events, streak })
    } else {
      set({ events })
    }
  },

  importFiles: async (files, mode = 'merge') => {
    const parsed = await parsePhrasesFromFiles(files)
    if (!parsed.length) {
      throw new Error(
        'フレーズが見つかりませんでした。Notionの「Markdown & CSV」エクスポート（.zip / .csv / .md）を選んでください。',
      )
    }
    let summary: ImportSummary
    if (mode === 'replace') {
      await replacePhrases(parsed)
      summary = { mode, added: parsed.length, updated: 0, kept: 0, total: parsed.length }
    } else {
      // マージ: ID一致は上書き、アプリ内で追加した教材は保持（削除は伝播しない）。
      const existing = await getAllPhrases()
      const result = mergePhrases(existing, parsed)
      await putPhrases(result.merged)
      summary = {
        mode,
        added: result.added,
        updated: result.updated,
        kept: result.kept,
        total: parsed.length,
      }
    }
    await get().load()
    return summary
  },

  addPhrases: async (newPhrases) => {
    if (!newPhrases.length) return 0
    await ensurePersisted(get)
    await putPhrases(newPhrases)
    await get().load()
    return newPhrases.length
  },

  updatePhrase: async (phrase) => {
    await ensurePersisted(get)
    await putPhrases([phrase])
    await get().load()
  },

  removePhrase: async (id) => {
    await ensurePersisted(get)
    await deletePhrase(id)
    await deleteProgress(id)
    await get().load()
  },

  clearImported: async () => {
    await clearPhrases()
    await get().load()
  },

  grade: async (id, g, mode) => {
    const current = get().progress[id]
    if (!current) return
    const updated = applyGrade(current, g)
    await saveProgress(updated)
    // 学習ログ（追記）。box遷移を残すので「定着への昇格」もここから集計できる。
    // ログ失敗で採点フローを止めないよう握りつぶす。
    const event = makeEvent('grade', {
      chunkId: id,
      grade: g,
      boxFrom: current.box,
      boxTo: updated.box,
      ...(mode ? { mode } : {}),
    })
    let logged = false
    try {
      await logEvent(event)
      logged = true
    } catch {
      /* ログは best-effort */
    }
    const streak = await bumpStreak()
    set((state) => ({
      progress: { ...state.progress, [id]: updated },
      streak,
      events: logged ? [...state.events, event] : state.events,
    }))
  },

  setLearned: async (id, learned) => {
    const current = get().progress[id] ?? newProgress(id)
    const updated = { ...current, learned }
    await saveProgress(updated)
    set((state) => ({ progress: { ...state.progress, [id]: updated } }))
  },

  reset: async () => {
    await clearProgress()
    await setMeta('streak', 0)
    await setMeta('lastStudyDate', '')
    const progress: Record<string, Progress> = {}
    for (const p of get().phrases) progress[p.id] = newProgress(p.id)
    set({ progress, streak: 0 })
  },
}))
