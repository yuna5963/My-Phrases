import { create } from 'zustand'
import type { Grade, Phrase, Progress } from '../types'
import { applyGrade, newProgress, todayStr } from '../lib/srs'
import {
  clearPhrases,
  clearProgress,
  getAllPhrases,
  getAllProgress,
  getMeta,
  replacePhrases,
  saveProgress,
  setMeta,
} from '../lib/db'
import { parsePhrasesFromFiles } from '../lib/import'

export type DeckSource = 'imported' | 'sample'

interface DeckState {
  phrases: Phrase[]
  progress: Record<string, Progress>
  streak: number
  source: DeckSource
  loaded: boolean
  error: string | null
  load: () => Promise<void>
  grade: (id: string, g: Grade) => Promise<void>
  reset: () => Promise<void>
  importFiles: (files: File[]) => Promise<number>
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
      phrases = [...phrases].sort((a, b) =>
        (a.createdTime || '') < (b.createdTime || '') ? 1 : -1,
      )
      const stored = await getAllProgress()
      const progress: Record<string, Progress> = {}
      for (const p of phrases) {
        progress[p.id] = stored[p.id] ?? newProgress(p.id)
      }
      const streak = await getMeta<number>('streak', 0)
      set({ phrases, progress, streak, source, loaded: true, error: null })
    } catch (e) {
      set({ error: (e as Error).message, loaded: true })
    }
  },

  importFiles: async (files) => {
    const parsed = await parsePhrasesFromFiles(files)
    if (!parsed.length) {
      throw new Error(
        'フレーズが見つかりませんでした。Notionの「Markdown & CSV」エクスポート（.zip / .csv / .md）を選んでください。',
      )
    }
    await replacePhrases(parsed)
    await get().load()
    return parsed.length
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

  reset: async () => {
    await clearProgress()
    await setMeta('streak', 0)
    await setMeta('lastStudyDate', '')
    const progress: Record<string, Progress> = {}
    for (const p of get().phrases) progress[p.id] = newProgress(p.id)
    set({ progress, streak: 0 })
  },
}))
