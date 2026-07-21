import type { Phrase } from '../types'

/**
 * Sentence Engine 専用の Type 値。長文音読（Long Reading）と同じ発想で、
 * 「特殊 type は通常の練習プール・一覧・集計から除外し、専用モードでだけ扱う」。
 *
 * - Structure（構文カード）: 意味の骨格になる型（"X means that Y." など）。
 *   examples に 1〜5 個の当てはめ例文を持つ。
 * - Message（意味ノードカード）: 主張→根拠→補足のような複数ノードを改行で並べた
 *   ミニ・メッセージ。en/ja とも改行区切りのノード列で、examples は持たない（空配列）。
 */
export const STRUCTURE_TYPE = 'Structure'
export const MESSAGE_TYPE = 'Message'

/** セット制ドリルの1セット枚数。10枚=1セットで「やりきった」区切りを作る。 */
export const DRILL_SET_SIZE = 10

export function isStructure(p: Phrase): boolean {
  return p.type === STRUCTURE_TYPE
}

export function isMessage(p: Phrase): boolean {
  return p.type === MESSAGE_TYPE
}

/** Sentence Engine 教材（構文カード or 意味ノードカード）かどうか。 */
export function isSentenceEngine(p: Phrase): boolean {
  return isStructure(p) || isMessage(p)
}

/** Sentence Engine 以外で扱う通常フレーズ（Structure/Message を除外）。 */
export function excludeSentenceEngine(phrases: Phrase[]): Phrase[] {
  return phrases.filter((p) => !isSentenceEngine(p))
}

/**
 * CSV/ファイルから取り込んだ行のうち、Sentence Engine 教材として受理できるものだけを
 * 抽出する純関数。取込口をチャンクCSVと分けるためのフィルタ。
 *
 * - `type` が Structure / Message 以外の行は受理せず rejected にカウントする。
 * - **Structure**: 当てはめ例文（`examples`）が en/ja とも非空のものを1件以上持つ必要がある。
 *   持たない行は「型として使えない」ため rejected 扱いにする。en/ja 揃った例文だけを残す。
 * - **Message**: 意味ノードカードは examples を持たない設計なので、CSV の例文列に何か
 *   入っていても捨てて空配列に正規化する。
 * - `status` は CSV でユーザーが明示した値をそのまま尊重する（補正しない）。
 */
export function filterSentenceEngineImport(parsed: Phrase[]): {
  cards: Phrase[]
  rejected: number
} {
  const cards: Phrase[] = []
  let rejected = 0
  for (const p of parsed) {
    if (isStructure(p)) {
      const examples = p.examples.filter((e) => e.en.trim() !== '' && e.ja.trim() !== '')
      if (examples.length === 0) {
        rejected++
        continue
      }
      cards.push({ ...p, examples })
    } else if (isMessage(p)) {
      cards.push({ ...p, examples: [] })
    } else {
      rejected++
    }
  }
  return { cards, rejected }
}

/**
 * Sentence Engine の seed 教材（public/data/sentence-engine.json）を読み込む。
 * BASE_URL を尊重するので dev でも静的ホストでも動く。useDeck.loadSample() と同じ流儀。
 * 失敗時は throw する（呼び出し側でエラー表示する）。
 */
export async function loadSentenceEngineSeed(): Promise<Phrase[]> {
  const url = `${import.meta.env.BASE_URL}data/sentence-engine.json`
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`sentence-engine.json ${res.status}`)
  return (await res.json()) as Phrase[]
}

/**
 * 起動レイテンシ（和訳表示→英文開示までの時間）の計測器。
 *
 * Sentence Engine の狙いは「日本語で完成文を作らず、和訳を見た瞬間に英語の骨格へ
 * 飛び込めるか」。その反応速度＝ Clause launch latency を KPI の材料として測る。
 *
 * 使い方: 新しい和訳が表示されたら shown()、ユーザーが英文を開示したら revealed()。
 * 直前の shown→revealed の区間だけを1件として記録する。次カードへ移る時は reset()。
 * 純粋（副作用は内部状態のみ）なのでテストしやすい。now は省略時 performance.now()。
 */
export interface LatencyMeter {
  /** 新しい項目（和訳）が表示された。 */
  shown(now?: number): void
  /** 英文が開示された（直前の shown からの区間を記録）。 */
  revealed(now?: number): void
  /** 記録済み区間の中央値ms（0件なら undefined）。 */
  median(): number | undefined
  /** 次のカードへ（区間リストを空に）。 */
  reset(): void
}

function nowMs(now?: number): number {
  return now ?? performance.now()
}

/** 数値配列の中央値（偶数個は中央2値の平均）。空なら undefined。 */
export function medianMs(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function createLatencyMeter(): LatencyMeter {
  // 直近の shown 時刻（未表示なら null）。開示せずに再度 shown が来たら上書き＝前の計測は破棄。
  let shownAt: number | null = null
  // 記録済みの区間（ms）。
  const spans: number[] = []

  return {
    shown(now?: number) {
      shownAt = nowMs(now)
    },
    revealed(now?: number) {
      // shown を経ていない開示（初期状態や、開示後にもう一度 revealed）は無視する。
      if (shownAt === null) return
      spans.push(nowMs(now) - shownAt)
      shownAt = null
    },
    median() {
      // 偶数個なら中央2値の平均、奇数個なら中央の1値。
      return medianMs(spans)
    },
    reset() {
      shownAt = null
      spans.length = 0
    },
  }
}
