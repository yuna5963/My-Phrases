import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Phrase, Progress } from '../types'
import type { LearningEvent } from './events'

interface MyPhrasesDB extends DBSchema {
  progress: {
    key: string
    value: Progress
  }
  phrases: {
    key: string
    value: Phrase
  }
  meta: {
    key: string
    value: unknown
  }
  /** 学習ログ（追記型・フェーズ0で追加）。date インデックスで日次集計する。 */
  events: {
    key: string
    value: LearningEvent
    indexes: { date: string }
  }
}

let dbPromise: Promise<IDBPDatabase<MyPhrasesDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MyPhrasesDB>('my-phrases', 3, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('phrases')) {
          db.createObjectStore('phrases', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
        // v3: 学習ログ。既存ユーザー（oldVersion<3）にも追加で作られる。
        if (oldVersion < 3 && !db.objectStoreNames.contains('events')) {
          const store = db.createObjectStore('events', { keyPath: 'id' })
          store.createIndex('date', 'date')
        }
      },
    })
  }
  return dbPromise
}

/** Returns the imported phrases (empty if the user hasn't imported any yet). */
export async function getAllPhrases(): Promise<Phrase[]> {
  const db = await getDB()
  return db.getAll('phrases')
}

/** Upsert phrases in one transaction without clearing (merge import / in-app add). */
export async function putPhrases(phrases: Phrase[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('phrases', 'readwrite')
  for (const p of phrases) await tx.store.put(p)
  await tx.done
}

/** Replace the whole imported set in one transaction (deletions reflected). */
export async function replacePhrases(phrases: Phrase[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('phrases', 'readwrite')
  await tx.store.clear()
  for (const p of phrases) await tx.store.put(p)
  await tx.done
}

export async function clearPhrases(): Promise<void> {
  const db = await getDB()
  await db.clear('phrases')
}

/** Delete a single phrase (in-app edit/delete flow). */
export async function deletePhrase(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('phrases', id)
}

/** Delete the SRS progress of a single phrase (cleanup when the phrase is removed). */
export async function deleteProgress(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('progress', id)
}

export async function getAllProgress(): Promise<Record<string, Progress>> {
  const db = await getDB()
  const all = await db.getAll('progress')
  const map: Record<string, Progress> = {}
  for (const p of all) map[p.id] = p
  return map
}

export async function saveProgress(p: Progress): Promise<void> {
  const db = await getDB()
  await db.put('progress', p)
}

/** Replace all SRS progress in one transaction (backup restore). */
export async function replaceProgress(list: Progress[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('progress', 'readwrite')
  await tx.store.clear()
  for (const p of list) await tx.store.put(p)
  await tx.done
}

export async function clearProgress(): Promise<void> {
  const db = await getDB()
  await db.clear('progress')
}

/** 学習ログを1件追記する（失敗しても学習フローを止めないよう呼び出し側で握りつぶす想定）。 */
export async function logEvent(event: LearningEvent): Promise<void> {
  const db = await getDB()
  await db.put('events', event)
}

/** date（YYYY-MM-DD）が from 以上のイベントを古い順で返す。日次・週次KPIの材料。 */
export async function getEventsSince(from: string): Promise<LearningEvent[]> {
  const db = await getDB()
  const range = IDBKeyRange.lowerBound(from)
  return db.getAllFromIndex('events', 'date', range)
}

/** 全イベントを返す（バックアップ用）。 */
export async function getAllEvents(): Promise<LearningEvent[]> {
  const db = await getDB()
  return db.getAll('events')
}

/** 全イベントを置換する（バックアップ復元）。 */
export async function replaceEvents(list: LearningEvent[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('events', 'readwrite')
  await tx.store.clear()
  for (const e of list) await tx.store.put(e)
  await tx.done
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const db = await getDB()
  const v = await db.get('meta', key)
  return (v as T) ?? fallback
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB()
  await db.put('meta', value, key)
}
