import { describe, expect, it } from 'vitest'
import { backupFilename, parseBackup, serializeBackup, type BackupData } from './backup'
import type { Phrase, Progress } from '../types'

const phrase = (id: string): Phrase => ({
  id,
  en: `chunk ${id}`,
  ja: `訳 ${id}`,
  examples: [{ en: `example ${id}`, ja: `例訳 ${id}` }],
  type: 'Chunk',
  category: 'Daily Status',
  level: 'Core',
  priority: '★★★☆☆',
  note: '',
  status: '未着手',
  createdTime: '2026-07-01T00:00:00.000Z',
})

const progress = (id: string): Progress => ({
  id,
  box: 3,
  due: '2026-07-20',
  correct: 5,
  wrong: 1,
  lastSeen: '2026-07-14T10:00:00.000Z',
  learned: false,
})

const sample: BackupData = {
  app: 'my-phrases',
  format: 1,
  exportedAt: '2026-07-15T00:00:00.000Z',
  phrases: [phrase('a'), phrase('b')],
  progress: [progress('a'), progress('b')],
  streak: 12,
  lastStudyDate: '2026-07-15',
}

describe('serializeBackup / parseBackup', () => {
  it('ラウンドトリップで完全に一致する（SRS進捗・ストリーク含む）', () => {
    expect(parseBackup(serializeBackup(sample))).toEqual(sample)
  })

  it('欠けた任意フィールドは安全な既定値で補完する', () => {
    const min = JSON.stringify({ app: 'my-phrases', format: 1, phrases: [], progress: [] })
    const parsed = parseBackup(min)
    expect(parsed.streak).toBe(0)
    expect(parsed.lastStudyDate).toBe('')
    expect(parsed.exportedAt).toBe('')
  })

  it('JSONでないファイルを拒否する', () => {
    expect(() => parseBackup('ID,Chunk\n1,still')).toThrow('JSONではありません')
  })

  it('別アプリ・別フォーマットのJSONを拒否する', () => {
    expect(() => parseBackup('{"app":"other","format":1}')).toThrow('フルバックアップ')
    expect(() => parseBackup('{"app":"my-phrases","format":2}')).toThrow('フルバックアップ')
  })

  it('壊れた教材・進捗データを拒否する', () => {
    expect(() =>
      parseBackup('{"app":"my-phrases","format":1,"phrases":[{"en":1}],"progress":[]}'),
    ).toThrow('教材データ')
    expect(() =>
      parseBackup('{"app":"my-phrases","format":1,"phrases":[],"progress":[{"box":1}]}'),
    ).toThrow('進捗データ')
  })
})

describe('backupFilename', () => {
  it('日付入りのファイル名を作る', () => {
    expect(backupFilename(new Date(2026, 6, 15))).toBe('my-phrases-backup-20260715.json')
  })
})
