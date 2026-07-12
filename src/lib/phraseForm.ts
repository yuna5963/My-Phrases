// チャンク編集フォーム（ChunkEdit）のドメインロジック。
// フォーム下書き（PhraseDraft）と Phrase の相互変換・検証・kanaWarnings 再計算を
// UI から分離した純関数として提供する。
import { lintKana, lintPhraseKana, type KanaIssue } from './kanaLint'
import { stableId } from './import'
import type { Phrase } from '../types'

export interface ExampleDraft {
  en: string
  ja: string
  kana: string
}

/** フォーム上の下書き。省略可能フィールドも空文字で正規化して保持する。 */
export interface PhraseDraft {
  en: string
  ja: string
  kana: string
  type: string
  category: string
  level: string
  priority: string
  note: string
  status: string
  examples: ExampleDraft[]
}

export function emptyExample(): ExampleDraft {
  return { en: '', ja: '', kana: '' }
}

/** 新規追加の初期値。既定値は教材化（enrich）・インポートの既定と揃える。 */
export function emptyDraft(): PhraseDraft {
  return {
    en: '',
    ja: '',
    kana: '',
    type: 'Chunk',
    category: '',
    level: 'Core',
    priority: '',
    note: '',
    status: '未着手',
    examples: [emptyExample()],
  }
}

/** 既存 Phrase を編集用の下書きへ。例文が無い場合も入力しやすいよう空行を1つ置く。 */
export function phraseToDraft(p: Phrase): PhraseDraft {
  return {
    en: p.en,
    ja: p.ja,
    kana: p.kana ?? '',
    type: p.type,
    category: p.category,
    level: p.level,
    priority: p.priority,
    note: p.note,
    status: p.status,
    examples: p.examples.length
      ? p.examples.map((ex) => ({ en: ex.en, ja: ex.ja, kana: ex.kana ?? '' }))
      : [emptyExample()],
  }
}

export interface DraftKanaIssues {
  kana: KanaIssue[]
  /** examples と同じ並び（空行は空配列）。 */
  examples: KanaIssue[][]
}

/** カナ検証をレンダー時に導出する（state に持たない）。空カナは検証対象外。 */
export function draftKanaIssues(d: PhraseDraft): DraftKanaIssues {
  return {
    kana: d.kana.trim() && d.en.trim() ? lintKana(d.kana, d.en) : [],
    examples: d.examples.map((ex) =>
      ex.kana.trim() && ex.en.trim() ? lintKana(ex.kana, ex.en) : [],
    ),
  }
}

/** 保存できない理由の一覧（空配列 = 保存可）。制約はインポート（makePhrase）と同じ。 */
export function validateDraft(d: PhraseDraft): string[] {
  const errors: string[] = []
  if (!d.en.trim()) errors.push('英語（Chunk）を入力してください')
  if (!d.ja.trim()) errors.push('日本語訳を入力してください')
  return errors
}

/**
 * 下書きから保存用 Phrase を組み立てる。
 * - 全フィールド trim。英文が空の例文行は除外する。
 * - kanaWarnings はここで再計算する（CSV「カナ要確認」列・教材化と同じ
 *   '音節' / '音節{n}' ラベル。違反ゼロならプロパティごと省く＝要確認解除）。
 * - 編集時（existingPhrase あり）は id と createdTime を既存値のまま維持する。
 *   英文を変えても id は変えない（SRS進捗・デッキ内の並びを保持するため）。
 * - 新規時は id = stableId(en)、createdTime = 現在時刻（アプリ内追加の印）。
 */
export function draftToPhraseFromForm(
  d: PhraseDraft,
  opts: { existingPhrase?: Phrase; now?: () => string } = {},
): Phrase {
  const en = d.en.trim()
  const kana = d.kana.trim()
  const phrase: Phrase = {
    id: opts.existingPhrase?.id ?? stableId(en),
    en,
    ja: d.ja.trim(),
    ...(kana ? { kana } : {}),
    examples: d.examples
      .map((ex) => ({ en: ex.en.trim(), ja: ex.ja.trim(), kana: ex.kana.trim() }))
      .filter((ex) => ex.en)
      .map((ex) => ({ en: ex.en, ja: ex.ja, ...(ex.kana ? { kana: ex.kana } : {}) })),
    type: d.type.trim(),
    category: d.category.trim(),
    level: d.level.trim(),
    priority: d.priority.trim(),
    note: d.note.trim(),
    status: d.status.trim() || '未着手',
    createdTime: opts.existingPhrase?.createdTime ?? (opts.now ?? isoNow)(),
  }
  const kanaWarnings = lintPhraseKana(phrase)
  return kanaWarnings.length ? { ...phrase, kanaWarnings } : phrase
}

function isoNow(): string {
  return new Date().toISOString()
}
