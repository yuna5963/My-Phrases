// 意味ノード英語思考（/think）の AI プロンプトとパースを分離したロジック。
// enrich.ts と同じ流儀で streamChat に渡す ChatMessage[] を組み立て、
// 応答は aiJson.extractJson で JSON を取り出して型検証する（不正なら throw）。
// UI から切り離した純関数だけを置き、vitest でテストする。
import type { ChatMessage } from './chatApi'
import { extractJson } from './aiJson'

/** 分解評価（プロンプトA）で、学習者ノード1つへのフィードバック。 */
export interface DecomposeNodeFeedback {
  /** 学習者が書いたノード（原文）。 */
  node: string
  /** そのノードが評価基準を満たすか。 */
  ok: boolean
  /** 問題があれば日本語1文、なければ空文字。 */
  issue: string
  /** 改善版ノード（ラベル: 内容）。問題なければ空文字。 */
  fix: string
}

/** 分解評価（プロンプトA）の応答全体。 */
export interface DecomposeFeedback {
  /** 全体講評（良い点→改善点、日本語2文以内）。 */
  comment: string
  /** ノードごとの評価。 */
  nodes: DecomposeNodeFeedback[]
  /** AI の推奨分解（2〜5行の「ラベル: 内容」）。 */
  suggested: string[]
}

/** 英文チェック（プロンプトB）で、学習者の英文1文へのフィードバック。 */
export interface SentenceFeedback {
  /** 学習者が書いた英文（原文）。 */
  original: string
  /** そのままで通用するか。 */
  ok: boolean
  /** 指摘（日本語1文、なければ空文字）。 */
  issue: string
  /** 提案英文（ok なら学習者の文をそのまま）。 */
  suggestion: string
  /** 提案の理由（日本語1文、ok なら空文字）。 */
  reason: string
}

/** その場面で使える便利表現（表現ストック候補）。 */
export interface ThinkExpression {
  en: string
  ja: string
}

/** 英文チェック（プロンプトB）の応答全体。 */
export interface EnglishFeedback {
  /** 全体講評（良い点を先に、日本語2文以内）。 */
  comment: string
  /** この内容の場面名（保存カードの category に使う。日本語2〜6字）。 */
  scene: string
  /** 文ごとの評価。 */
  sentences: SentenceFeedback[]
  /** 使えた/使える表現（0〜3件）。 */
  expressions: ThinkExpression[]
}

/** 英文チェックで scene が空だったときの既定場面名。 */
export const DEFAULT_SCENE = '自分の思考'

/** 意味ノードの上限（分解も英文化もこの行数で扱う）。 */
export const MAX_NODES = 5

/**
 * 自由記述テキストを意味ノードの行配列にする。
 * 行分割 → trim → 空行除去 → 最大 MAX_NODES 行に丸める。
 */
export function nodesFromText(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, MAX_NODES)
}

// ---- プロンプト組み立て ----------------------------------------------------

/**
 * プロンプトA（分解評価）。system に評価基準・出力スキーマ、user に
 * 元の思考と学習者の分解を載せる（Gemma の system 拒否は foldSystemIntoUser が吸収）。
 */
export function buildDecomposePrompt(thought: string, nodes: string[]): ChatMessage[] {
  const system = `あなたは英語学習コーチです。学習者は「日本語で完成文を作ってから英訳する」癖を直すため、
思考を「意味ノード」（英文1文に対応する意味の骨子）に分解する練習をしています。

評価基準:
- 1ノード=1機能（主張/根拠/具体例/結論/条件/依頼など）。2つの機能が混ざったら分割を促す
- ノードは骨子（体言止め・短句）であること。日本語の完成文になっていたら注意
- ノードの並びが論理的（結論先出しのビジネス順）か
- 元の思考の重要要素が欠けていないか
- ノード数は2〜5が適切

次のJSONだけを返してください（コードフェンスや前置きは不要）:
{
  "comment": "全体講評。良い点→改善点の順で日本語2文以内",
  "nodes": [{"node": "学習者のノード", "ok": true, "issue": "問題があれば日本語1文、なければ空文字", "fix": "改善版ノード（ラベル: 内容）、問題なければ空文字"}],
  "suggested": ["ラベル: 内容"]
}`
  const user = `元の思考:\n${thought.trim()}\n\n学習者の分解:\n${nodes.join('\n')}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * プロンプトB（英文チェック）。訳の正しさより「平易・シンプル・ビジネスで通用」を重視。
 * system に評価基準・出力スキーマ、user に意味ノードと学習者の英文を載せる。
 */
export function buildEnglishPrompt(nodes: string[], sentences: string[]): ChatMessage[] {
  const system = `あなたはビジネス英語のコーチです。学習者は意味ノード（意味の骨子）から英文を組み立てる練習をしています。
訳文の正しさよりも「平易・シンプル・ビジネスで通用する」ことを重視して評価してください。

評価基準:
- 中学英文法の範囲の平易な表現を最優先（凝った構文や難語より明快さ）
- 1文=1ノード。主語と動詞が明確か
- ビジネスで失礼・カジュアルすぎる表現がないか
- 文法・語法の誤りは簡潔に指摘
- 提案英文（suggestion）は学習者の文を活かした最小修正。全面的な書き直しは避ける

次のJSONだけを返してください（コードフェンスや前置きは不要）:
{
  "comment": "全体講評。良い点を先に、日本語2文以内",
  "scene": "この内容の場面名（日本語2〜6字。例: 進捗報告、提案）",
  "sentences": [{"original": "学習者の文", "ok": true, "issue": "指摘（日本語1文、なければ空文字）", "suggestion": "提案英文（okなら学習者の文をそのまま）", "reason": "提案の理由（日本語1文、okなら空文字）"}],
  "expressions": [{"en": "この場面で使える便利表現", "ja": "和訳"}]
}`
  const user = `意味ノード:\n${nodes.join('\n')}\n\n学習者の英文（1行1文）:\n${sentences.join('\n')}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

// ---- パース（extractJson → 型検証。不正なら throw） ------------------------

const PARSE_FAILED = 'THINK_PARSE_FAILED'

function asObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(PARSE_FAILED)
  return data as Record<string, unknown>
}

function str(o: Record<string, unknown>, key: string): string {
  return typeof o[key] === 'string' ? (o[key] as string).trim() : ''
}

function bool(o: Record<string, unknown>, key: string): boolean {
  return o[key] === true
}

/**
 * プロンプトA（分解評価）の応答をパースする。
 * `nodes` が配列でない・全体がオブジェクトでない場合は throw（呼び出し側が「もう一度」を出す）。
 * 個々のノードの issue/fix 欠損は空文字、ok 欠損は false に丸める。
 */
export function parseDecomposeFeedback(text: string): DecomposeFeedback {
  const o = asObject(extractJson(text))
  if (!Array.isArray(o.nodes)) throw new Error(PARSE_FAILED)
  const nodes: DecomposeNodeFeedback[] = o.nodes
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object' && !Array.isArray(n))
    .map((n) => ({
      node: str(n, 'node'),
      ok: bool(n, 'ok'),
      issue: str(n, 'issue'),
      fix: str(n, 'fix'),
    }))
  const suggested = Array.isArray(o.suggested)
    ? o.suggested.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim())
    : []
  return { comment: str(o, 'comment'), nodes, suggested }
}

/**
 * プロンプトB（英文チェック）の応答をパースする。
 * `sentences` が配列でない・全体がオブジェクトでない場合は throw。
 * `scene` が空なら DEFAULT_SCENE を、expressions 欠損は空配列を既定にする。
 */
export function parseEnglishFeedback(text: string): EnglishFeedback {
  const o = asObject(extractJson(text))
  if (!Array.isArray(o.sentences)) throw new Error(PARSE_FAILED)
  const sentences: SentenceFeedback[] = o.sentences
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !Array.isArray(s))
    .map((s) => ({
      original: str(s, 'original'),
      ok: bool(s, 'ok'),
      issue: str(s, 'issue'),
      // ok でも suggestion が空なら原文を採用（表示・採用ボタンの安全弁）。
      suggestion: str(s, 'suggestion') || str(s, 'original'),
      reason: str(s, 'reason'),
    }))
  const expressions: ThinkExpression[] = Array.isArray(o.expressions)
    ? o.expressions
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && !Array.isArray(e))
        .map((e) => ({ en: str(e, 'en'), ja: str(e, 'ja') }))
        .filter((e) => e.en !== '')
        .slice(0, 3)
    : []
  return { comment: str(o, 'comment'), scene: str(o, 'scene') || DEFAULT_SCENE, sentences, expressions }
}
