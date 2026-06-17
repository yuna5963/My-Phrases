export interface Phrase {
  id: string
  en: string
  ja: string
  example: string
  status: string
  createdTime: string
}

export interface Progress {
  id: string
  box: number // Leitner box 0..MAX_BOX
  due: string // YYYY-MM-DD, next due date
  correct: number
  wrong: number
  lastSeen: string // ISO datetime, '' if never studied
}

export type Grade = 'good' | 'vague' | 'bad'

export interface Card extends Phrase {
  progress: Progress
}
