import { create } from 'zustand'
import type { Grade, Phrase, Progress } from '../types'
import { applyGrade, newProgress, todayStr } from '../lib/srs'
import {
  clearPhrases,
  clearProgress,
  getAllPhrases,
  getAllProgress,
  getMeta,
  putPhrases,
  replacePhrases,
  saveProgress,
  setMeta,
} from '../lib/db'
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
  load: () => Promise<void>
  grade: (id: string, g: Grade) => Promise<void>
  setLearned: (id: string, learned: boolean) => Promise<void>
  reset: () => Promise<void>
  importFiles: (files: File[], mode?: ImportMode) => Promise<ImportSummary>
  /** アプリ内で作った教材（教材化・AI長文）をデッキへ追記する。 */
  addPhrases: (newPhrases: Phrase[]) => Promise<number>
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

export const useDeck = create<DeckState>((set, get) => ({
  phrases: [],
  progress: {},
  streak: 0,
  source: 'sample',
  loaded: false,
  error: null,

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
      set({ phrases, progress, streak, source, loaded: true, error: null })
    } catch (e) {
      set({ error: (e as Error).message, loaded: true })
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
    const existing = await getAllPhrases()
    if (!existing.length) {
      // サンプル使用中に追加分だけ保存すると、次の load() でサンプルが
      // 「消えた」ように見えるため、先に現在のサンプルを実体化しておく。
      await putPhrases(get().phrases)
    }
    await putPhrases(newPhrases)
    await get().load()
    return newPhrases.length
  },

  clearImported: async () => {
    await clearPhrases()
    await get().load()
  },

  grade: async (id, g) => {
    const current = get().progress[id]
    if (!current) return
    const updated = applyGrade(current, g)
    await saveProgress(updated)
    const streak = await bumpStreak()
    set((state) => ({
      progress: { ...state.progress, [id]: updated },
      streak,
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
