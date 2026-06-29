/** 1チャンクに紐づく例文1つ（英語と、その日本語訳）。 */
export interface Example {
  en: string
  ja: string
  kana?: string // シラブル音節のカタカナ表記（任意・CSVの「音節{n}」列）
}

export interface Phrase {
  id: string
  en: string // Chunk（見出しの語・型）
  ja: string // チャンクの日本語訳（CSVの「日本語」列）
  kana?: string // チャンク英語のシラブル音節カタカナ表記（任意・CSVの「音節」列）
  examples: Example[] // 例文（最大5）。各例文に日本語訳を持つ
  type: string // Nuance / Pattern / Chunk / Connector / Phrase
  category: string // Daily Status / Health / Work ...
  level: string // Basic / Core / Advanced
  priority: string // ★の数（例: ★★★★★）
  note: string // 補足メモ（任意）
  status: string // 未着手 / 進行中 / 完了
  createdTime: string
}

export interface Progress {
  id: string
  box: number // Leitner box 0..MAX_BOX
  due: string // YYYY-MM-DD, next due date
  correct: number
  wrong: number
  lastSeen: string // ISO datetime, '' if never studied
  learned: boolean // 手動「覚えた」チェック（SRSの習得済みとは別）
}

export type Grade = 'good' | 'vague' | 'bad'

export interface Card extends Phrase {
  progress: Progress
}
