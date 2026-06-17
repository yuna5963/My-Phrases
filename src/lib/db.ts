import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Phrase, Progress } from '../types'

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
}

let dbPromise: Promise<IDBPDatabase<MyPhrasesDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MyPhrasesDB>('my-phrases', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('phrases')) {
          db.createObjectStore('phrases', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
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

export async function clearProgress(): Promise<void> {
  const db = await getDB()
  await db.clear('progress')
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
