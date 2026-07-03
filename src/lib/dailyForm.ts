import type { Phrase, Progress } from '../types'
import { isNew } from './srs'
import { hasCloze } from './cloze'

/** 「今日の練習」で出し分ける練習形式。 */
export type DailyForm = 'model' | 'repro' | 'compose' | 'cloze'

/**
 * SRSの進み具合（Leitnerボックス）から、今このチャンクに合う練習形式を返す。
 * 新規=聞いて真似る（モデリング）→ box 0-1=日本語からの想起（再現練習）→
 * box 2-3=即時産出（瞬間英作文）→ box 4以上=文脈内運用（穴埋め）と、
 * 習熟に沿って負荷を上げる。穴埋めにできる例文がないチャンクは瞬間英作文のまま。
 * 進捗未作成（undefined）は新規として扱う。
 */
export function formFor(pr: Progress | undefined, phrase: Phrase): DailyForm {
  if (!pr || isNew(pr)) return 'model'
  if (pr.box <= 1) return 'repro'
  if (pr.box >= 4 && hasCloze(phrase)) return 'cloze'
  return 'compose'
}
