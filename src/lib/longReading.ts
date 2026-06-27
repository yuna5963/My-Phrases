import type { Phrase } from '../types'

/**
 * 長文音読モード専用の Type 値。長文音読モード以外（瞬間英作文・モデリング・
 * 発音練習・各一覧・ホームの集計）では除外する。長文は例文・日本語訳を1つだけ持つ
 * （Example2 以降は空欄）ので、本文は examples[0] に入る。
 */
export const LONG_READING_TYPE = 'Long Reading'

export function isLongReading(p: Phrase): boolean {
  return p.type === LONG_READING_TYPE
}

/** 長文音読モード以外で扱う通常フレーズ（Long Reading を除外）。 */
export function excludeLongReading(phrases: Phrase[]): Phrase[] {
  return phrases.filter((p) => !isLongReading(p))
}
