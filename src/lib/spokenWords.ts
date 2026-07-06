/**
 * Word Spark（読み上げ同期ハイライト）の下回り（純関数＋実測キャリブレーション）。
 * 英文を単語スパンに分割し、boundary イベントの文字位置→単語番号の変換と、
 * boundary が発火しないエンジン向けの推定タイミングを提供する。
 *
 * 推定は2段構え:
 * - 全体の長さ … 実際の発話時間（onstart→onend）を rate 別に学習した文字/秒で見積もる
 * - 単語ごとの配分 … 音節数＋強勢（機能語は弱形で短い）＋句読点ポーズで英語のリズムに寄せる
 */

export interface WordSpan {
  start: number
  end: number
}

/** 空白区切りで単語スパン（元文字列内のオフセット）を列挙する。句読点は単語に含める。 */
export function wordSpans(text: string): WordSpan[] {
  const spans: WordSpan[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length })
  }
  return spans
}

/**
 * boundary イベントの charIndex が指す単語番号を返す。
 * charIndex は通常その単語の先頭を指すが、エンジン差を考慮して
 * 「start <= charIndex を満たす最後のスパン」を採用する。該当なしは 0。
 */
export function wordAtChar(spans: WordSpan[], charIndex: number): number {
  if (!spans.length) return -1
  let idx = 0
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].start <= charIndex) idx = i
    else break
  }
  return idx
}

// ---- 読み上げ速度の実測キャリブレーション ----

// 既定の読み上げ速度: 英語TTSの目安はおよそ 15文字/秒（rate=1）。実測が貯まるまでの初期値。
const DEFAULT_CHARS_PER_SECOND = 15
const MIN_TOTAL_MS = 500

// rate に対するエンジンの応答は非線形なことがあるため、学習値は rate 別バケツで持つ。
const CAL_KEY = 'my-phrases:tts-cal-v1'

type CalMap = Record<string, number> // rateKey -> 実測の文字/秒

let calCache: CalMap | null = null

function loadCal(): CalMap {
  if (calCache) return calCache
  try {
    calCache = JSON.parse(localStorage.getItem(CAL_KEY) ?? '{}') as CalMap
  } catch {
    calCache = {}
  }
  return calCache
}

function saveCal(map: CalMap): void {
  calCache = map
  try {
    localStorage.setItem(CAL_KEY, JSON.stringify(map))
  } catch {
    /* localStorage が使えない環境ではメモリ内キャッシュのみで動く */
  }
}

/** テスト用: 学習値を破棄する。 */
export function resetCalibration(): void {
  calCache = {}
  try {
    localStorage.removeItem(CAL_KEY)
  } catch {
    /* ignore */
  }
}

function rateKey(rate: number): string {
  return rate.toFixed(2)
}

/** その rate での実効読み上げ速度（文字/秒）。実測があれば学習値、なければ既定値。 */
export function charsPerSecond(rate: number): number {
  const r = rate > 0 ? rate : 1
  const cal = loadCal()
  const exact = cal[rateKey(r)]
  if (exact) return exact
  // 別の rate の実測があれば、速度比で換算して流用する（同一エンジンなら近い）。
  let nearest: number | null = null
  for (const k of Object.keys(cal)) {
    const kr = parseFloat(k)
    if (kr > 0 && (nearest === null || Math.abs(kr - r) < Math.abs(nearest - r))) nearest = kr
  }
  if (nearest !== null) return cal[rateKey(nearest)] * (r / nearest)
  return DEFAULT_CHARS_PER_SECOND * r
}

/**
 * 実際の発話時間（onstart→onend の ms）を記録して速度推定を較正する。
 * 短すぎるサンプルや現推定から大きく外れた値（途中キャンセルの断片など）は捨て、
 * 指数移動平均でならす。数回の再生でその端末×声×速度の実速度に収束する。
 */
export function recordSpokenDuration(text: string, rate: number, ms: number): void {
  const len = text.trim().length
  if (len < 8 || ms < 600) return
  const cps = (len / ms) * 1000
  if (cps < 2 || cps > 45) return
  const r = rate > 0 ? rate : 1
  const cal = loadCal()
  const prev = cal[rateKey(r)] ?? charsPerSecond(r)
  if (cps < prev * 0.35 || cps > prev * 2.2) return
  const next = cal[rateKey(r)] ? prev + 0.35 * (cps - prev) : cps
  saveCal({ ...cal, [rateKey(r)]: Math.round(next * 100) / 100 })
}

// ---- 単語ごとの配分（英語の強勢リズム近似） ----

// 弱形で短く発音される機能語（冠詞・前置詞・代名詞・助動詞など）。強勢が乗らない。
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'of', 'to', 'in', 'on', 'at', 'for', 'from', 'by', 'with', 'as',
  'and', 'or', 'but', 'so', 'if', 'than', 'that',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their',
  'am', 'is', 'are', 'was', 'were', 'be', 'been',
  'do', 'does', 'did', 'have', 'has', 'had',
  'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must',
])

/** 英単語の音節数を推定する（母音グループ数の簡易ヒューリスティック、最低1）。 */
export function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 1
  let count = (w.match(/[aeiouy]+/g) ?? []).length
  // サイレントe: "make" 等。"-le" 語尾（table）や母音+e（see）は音節が残る。
  if (w.length > 2 && w.endsWith('e') && !w.endsWith('le') && !/[aeiouy]e$/.test(w)) count--
  // "makes" のような -es（boxes 等の /ɪz/ 化する語尾は除く）
  else if (w.length > 3 && /[^aeiouy]es$/.test(w) && !/(ss|sh|ch|x|z)es$/.test(w)) count--
  // "walked" のような発音しない -ed（needed / wanted は残る）
  else if (w.length > 3 && /[^aeiouytd]ed$/.test(w)) count--
  return Math.max(1, count)
}

// 単語1つの所要重み: 発話の土台コスト＋音節数（音節1つ≒重み1）。
const WORD_BASE = 0.4
// 機能語は弱形になり内容語よりかなり短い。
const FUNCTION_WORD_FACTOR = 0.5
// 句読点の後にエンジンが置くポーズ（音節数相当）。
const PAUSE_COMMA = 0.8
const PAUSE_SENTENCE = 1.6

function wordWeight(raw: string, isLast: boolean): number {
  const core = raw.replace(/[^a-zA-Z'’-]/g, '')
  let w = WORD_BASE + estimateSyllables(core)
  if (FUNCTION_WORDS.has(core.toLowerCase().replace(/’/g, "'"))) w *= FUNCTION_WORD_FACTOR
  // 末尾の句読点ポーズ。最終単語の後のポーズは次の単語送りに影響しないので加えない。
  if (!isLast) {
    if (/[.!?]['")\]]*$/.test(raw)) w += PAUSE_SENTENCE
    else if (/[,;:]['")\]]*$/.test(raw)) w += PAUSE_COMMA
  }
  return w
}

/**
 * 各単語の読み上げ開始時刻（ms、先頭からの累積）を推定する。
 * boundary イベントが来ないエンジンでのフォールバック用。
 * 全体の長さは実測較正済みの文字/秒、単語の配分は音節＋強勢＋ポーズの重みで決める。
 */
export function estimateWordTimings(text: string, rate: number): number[] {
  const spans = wordSpans(text)
  if (!spans.length) return []
  const totalMs = Math.max(MIN_TOTAL_MS, (text.length / charsPerSecond(rate)) * 1000)
  const weights = spans.map((s, i) =>
    wordWeight(text.slice(s.start, s.end), i === spans.length - 1),
  )
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const timings: number[] = []
  let acc = 0
  for (const w of weights) {
    timings.push((acc / totalWeight) * totalMs)
    acc += w
  }
  return timings
}
