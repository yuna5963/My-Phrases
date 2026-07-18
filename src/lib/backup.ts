// 進捗を含むフルバックアップ（JSON）。
// 主目的は PWA → Android アプリの移行（別オリジン＝IndexedDB が空になるため、
// 教材だけでなく SRS 進捗・ストリークごと持ち運べるようにする）。機種変更時の保険にもなる。
// APIキー（chatApiKey）は意図的に含めない（平文ファイルに書き出さないため）。
import type { Phrase, Progress } from '../types'
import type { LearningEvent } from './events'
import { getAllEvents, getMeta, replaceEvents, replacePhrases, replaceProgress, setMeta } from './db'

export interface BackupData {
  app: 'my-phrases'
  format: 1
  exportedAt: string // ISO datetime
  phrases: Phrase[]
  progress: Progress[]
  streak: number
  lastStudyDate: string // YYYY-MM-DD（ストリーク継続判定用）
  /** 学習ログ（フェーズ0で追加・任意）。旧バックアップ互換のため optional。 */
  events?: LearningEvent[]
  /** 選択中のゴールトラックID（任意）。 */
  goalTrackId?: string
}

/** ストアの現在値からバックアップデータを組み立てる（IndexedDBはmeta・eventsを参照）。 */
export async function collectBackup(
  phrases: Phrase[],
  progress: Record<string, Progress>,
  streak: number,
): Promise<BackupData> {
  return {
    app: 'my-phrases',
    format: 1,
    exportedAt: new Date().toISOString(),
    phrases,
    progress: Object.values(progress),
    streak,
    lastStudyDate: await getMeta<string>('lastStudyDate', ''),
    events: await getAllEvents(),
    goalTrackId: await getMeta<string>('goalTrackId', ''),
  }
}

export function serializeBackup(data: BackupData): string {
  return JSON.stringify(data)
}

export function backupFilename(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `my-phrases-backup-${y}${m}${d}.json`
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** JSONを検証してBackupDataに解析する。不正なら日本語メッセージの Error を投げる。 */
export function parseBackup(json: string): BackupData {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('ファイルを読み取れませんでした（JSONではありません）')
  }
  if (!isRecord(raw) || raw.app !== 'my-phrases' || raw.format !== 1) {
    throw new Error('このファイルは My Phrases のフルバックアップ（JSON）ではありません')
  }
  const phrases = raw.phrases
  const progress = raw.progress
  if (
    !Array.isArray(phrases) ||
    !phrases.every((p) => isRecord(p) && typeof p.id === 'string' && typeof p.en === 'string')
  ) {
    throw new Error('バックアップの教材データが壊れています')
  }
  if (
    !Array.isArray(progress) ||
    !progress.every((p) => isRecord(p) && typeof p.id === 'string')
  ) {
    throw new Error('バックアップの進捗データが壊れています')
  }
  // events は任意。壊れていても学習ログの欠落に留め、復元自体は失敗させない。
  const events =
    Array.isArray(raw.events) && raw.events.every((e) => isRecord(e) && typeof e.id === 'string')
      ? (raw.events as unknown as LearningEvent[])
      : undefined
  return {
    app: 'my-phrases',
    format: 1,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    phrases: phrases as unknown as Phrase[],
    progress: progress as unknown as Progress[],
    streak: typeof raw.streak === 'number' ? raw.streak : 0,
    lastStudyDate: typeof raw.lastStudyDate === 'string' ? raw.lastStudyDate : '',
    ...(events ? { events } : {}),
    ...(typeof raw.goalTrackId === 'string' && raw.goalTrackId ? { goalTrackId: raw.goalTrackId } : {}),
  }
}

/**
 * バックアップで端末内データを**全置換**する（教材・SRS進捗・ストリーク）。
 * 呼び出し側は完了後に useDeck.load() で再読込すること。
 */
export async function restoreBackup(
  data: BackupData,
): Promise<{ phrases: number; progress: number }> {
  await replacePhrases(data.phrases)
  await replaceProgress(data.progress)
  await replaceEvents(data.events ?? [])
  await setMeta('streak', data.streak)
  await setMeta('lastStudyDate', data.lastStudyDate)
  if (data.goalTrackId) await setMeta('goalTrackId', data.goalTrackId)
  return { phrases: data.phrases.length, progress: data.progress.length }
}
