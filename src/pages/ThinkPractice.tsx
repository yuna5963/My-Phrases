import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Phrase } from '../types'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { stockKey, useStock } from '../store/useStock'
import { ChatApiError, streamChat, stripThoughts } from '../lib/chatApi'
import {
  buildDecomposePrompt,
  buildEnglishPrompt,
  DEFAULT_SCENE,
  nodesFromText,
  parseDecomposeFeedback,
  parseEnglishFeedback,
  type DecomposeFeedback,
  type EnglishFeedback,
} from '../lib/thinkPrompt'
import { stableId } from '../lib/import'
import { MESSAGE_TYPE } from '../lib/sentenceEngine'
import { todayStr } from '../lib/srs'
import UsageBadge from '../components/UsageBadge'

const TOTAL_STEPS = 5
const STEP_TITLES = ['思考を書く', 'ノードに分解', '英文にする', 'AIチェック', '保存']

/** AIの応答解析失敗をユーザー向け文言に変換する（ChatApiError はその message を尊重）。 */
function friendlyError(e: unknown): string {
  if (e instanceof ChatApiError) return e.message
  return 'AIの応答をうまく読み取れませんでした。もう一度お試しください。'
}

/**
 * 💭 意味ノード英語思考。自分の思考を出発点に、①思考入力 →②意味ノード分解（AI評価）→
 * ③自分で英文化 →④AI英文チェック →⑤意味ノードカードとして保存、の5ステップ。
 * 「意味ノード生成」（用意されたカードの練習）とは別に、自分の思考でSRSの素材を作る。
 */
export default function ThinkPractice() {
  const navigate = useNavigate()
  const chatApiKey = useSettings((s) => s.chatApiKey)
  const chatModel = useSettings((s) => s.chatModel)
  const addPhrases = useDeck((s) => s.addPhrases)
  const noteThinkComplete = useDeck((s) => s.noteThinkComplete)

  const [step, setStep] = useState(1)
  const [thought, setThought] = useState('')
  const [nodesText, setNodesText] = useState('')
  const [decomp, setDecomp] = useState<DecomposeFeedback | null>(null)
  const [sentencesText, setSentencesText] = useState('')
  const [english, setEnglish] = useState<EnglishFeedback | null>(null)
  const [saved, setSaved] = useState(false)

  // AI呼び出しの共有状態（同時に走るのは1ステップのみ）。stream は途中経過の表示用。
  const [loading, setLoading] = useState(false)
  const [stream, setStream] = useState('')
  const [error, setError] = useState<string | null>(null)

  // think イベントは1セッション1回だけ記録する（多重記録・アウトプット二重計上を防ぐ）。
  const recordedRef = useRef(false)

  const finalNodes = useMemo(() => nodesFromText(nodesText), [nodesText])
  const finalSentences = useMemo(() => nodesFromText(sentencesText), [sentencesText])

  /**
   * 英文チェックまで終えた1本を学習ログに記録する（最低ライン達成でストリーク維持）。
   * 保存時は savedCard=true、保存せず離脱時は false。英文チェック前は記録しない。
   */
  const recordThink = async (savedCard: boolean) => {
    if (recordedRef.current || !english) return
    recordedRef.current = true
    await noteThinkComplete(finalNodes.length, finalSentences.length, savedCard)
  }

  const runAi = async (
    messages: Parameters<typeof streamChat>[0]['messages'],
    onOk: (raw: string) => void,
  ) => {
    setLoading(true)
    setError(null)
    setStream('')
    let acc = ''
    try {
      const raw = await streamChat({
        apiKey: chatApiKey,
        model: chatModel,
        messages,
        onDelta: (d) => {
          acc += d
          setStream(stripThoughts(acc))
        },
      })
      onOk(raw)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
      setStream('')
    }
  }

  const runDecompose = () =>
    runAi(buildDecomposePrompt(thought, finalNodes), (raw) => {
      try {
        setDecomp(parseDecomposeFeedback(raw))
      } catch (e) {
        setError(friendlyError(e))
      }
    })

  const runEnglish = () =>
    runAi(buildEnglishPrompt(finalNodes, finalSentences), (raw) => {
      try {
        setEnglish(parseEnglishFeedback(raw))
      } catch (e) {
        setError(friendlyError(e))
      }
    })

  const adoptSuggestedNodes = () => {
    if (decomp) setNodesText(decomp.suggested.join('\n'))
  }

  const adoptSentence = (index: number, suggestion: string) => {
    const next = [...finalSentences]
    next[index] = suggestion
    setSentencesText(next.join('\n'))
  }

  const doSave = async () => {
    const ja = finalNodes.join('\n')
    const en = finalSentences.join('\n')
    const phrase: Phrase = {
      id: `think-${stableId(ja)}`,
      en,
      ja,
      examples: [],
      type: MESSAGE_TYPE,
      category: english?.scene || DEFAULT_SCENE,
      level: 'Core',
      priority: '★★★★☆',
      note: `意味ノード英語思考で作成（${todayStr()}）`,
      status: '進行中',
      createdTime: new Date().toISOString(),
    }
    await addPhrases([phrase])
    await recordThink(true)
    setSaved(true)
  }

  const restart = async () => {
    await recordThink(false)
    recordedRef.current = false
    setStep(1)
    setThought('')
    setNodesText('')
    setDecomp(null)
    setSentencesText('')
    setEnglish(null)
    setStream('')
    setError(null)
    setSaved(false)
  }

  const leave = async () => {
    await recordThink(false)
    navigate('/')
  }

  const goStep = (n: number) => {
    setError(null)
    setStep(n)
  }

  if (!chatApiKey) {
    return (
      <div className="pt-20 text-center t-muted">
        <p className="text-3xl">💭</p>
        <p className="mt-4">意味ノード英語思考には Gemini API キーが必要です。</p>
        <p className="mt-1 text-sm">設定画面でキーを登録してください（無料で取得できます）。</p>
        <Link to="/settings" className="mt-4 inline-block font-medium link underline">
          ⚙️ 設定を開く
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="pb-2">
        <div className="flex items-baseline justify-between">
          <h1 className="font-bold">💭 意味ノード英語思考</h1>
          <span className="t-subtle text-xs">
            {step} / {TOTAL_STEPS}・{STEP_TITLES[step - 1]}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 ${i < step ? 'bg-carbon-blue dark:bg-carbon-blue-40' : 'bg-carbon-surface-2 dark:bg-carbon-line-dark'}`}
            />
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-3">
        {error && (
          <div className="rounded-none border-l-4 border-carbon-error bg-carbon-surface p-3 text-sm text-carbon-error dark:bg-carbon-layer">
            <p>⚠ {error}</p>
          </div>
        )}

        {step === 1 && (
          <section className="space-y-3">
            <p className="text-sm t-muted">
              まず、伝えたいことを日本語で書き出してみましょう。ここは自由記述でOKです。
            </p>
            <textarea
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              placeholder="今日の会議で言いたかったこと、最近考えていること、伝えたい意見など。日本語でOK"
              rows={6}
              className="input w-full resize-none text-sm"
            />
          </section>
        )}

        {step === 2 && (
          <section className="space-y-3">
            <p className="text-sm t-muted">
              1行に1ノード。「ラベル: 内容」の形で、日本語の完成文ではなく骨子で書きます
              （例: <span className="font-medium">主張: 会議を減らすべき</span>）。2〜5行が目安です。
            </p>
            <div className="tile-muted p-3 text-xs t-subtle whitespace-pre-wrap">{thought}</div>
            <textarea
              value={nodesText}
              onChange={(e) => setNodesText(e.target.value)}
              placeholder={'主張: 会議を減らすべき\n根拠: 集中できる時間が減る\n提案: 会議は週2回に'}
              rows={5}
              className="input w-full resize-none text-sm"
            />
            <button
              onClick={runDecompose}
              disabled={loading || finalNodes.length === 0}
              className="btn-tertiary w-full px-4 py-2.5 text-sm font-medium"
            >
              🤖 AIに分解を見てもらう
            </button>
            <UsageBadge className="text-right" />
            {loading && (
              <p className="animate-pulse text-xs t-subtle whitespace-pre-wrap">
                {stream || 'AIが考えています…'}
              </p>
            )}
            {decomp && !loading && (
              <div className="space-y-3">
                <div className="tile p-3 text-sm">
                  <p className="text-xs font-semibold t-muted">講評</p>
                  <p className="mt-1 whitespace-pre-wrap">{decomp.comment}</p>
                </div>
                {decomp.nodes.length > 0 && (
                  <ul className="space-y-2">
                    {decomp.nodes.map((n, i) => (
                      <li key={i} className="tile p-3 text-sm">
                        <p className="font-medium">
                          {n.ok ? '✅ ' : '✏️ '}
                          {n.node}
                        </p>
                        {n.issue && <p className="mt-1 text-xs t-muted">{n.issue}</p>}
                        {n.fix && <p className="mt-0.5 text-xs link">→ {n.fix}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {decomp.suggested.length > 0 && (
                  <div className="rounded-none border-l-4 border-carbon-success bg-carbon-surface p-3 text-sm dark:bg-carbon-layer">
                    <p className="text-xs font-semibold text-carbon-success">AIの推奨分解</p>
                    <ul className="mt-1 space-y-0.5">
                      {decomp.suggested.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                    <button
                      onClick={adoptSuggestedNodes}
                      className="btn-tertiary mt-2 px-3 py-1.5 text-xs font-medium"
                    >
                      この分解を採用
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="space-y-3">
            <p className="text-sm t-muted">
              確定した意味ノードを見ながら、1行に1文で英文化します。ノードの順に、1ノード=1文で。
            </p>
            <div className="tile-muted p-3 text-sm">
              <p className="text-xs font-semibold t-muted">意味ノード</p>
              <ul className="mt-1 space-y-0.5">
                {finalNodes.map((n, i) => (
                  <li key={i}>
                    {i + 1}. {n}
                  </li>
                ))}
              </ul>
            </div>
            <textarea
              value={sentencesText}
              onChange={(e) => setSentencesText(e.target.value)}
              placeholder={'We should have fewer meetings.\nThey take away our focus time.'}
              rows={5}
              className="input w-full resize-none text-sm"
            />
          </section>
        )}

        {step === 4 && (
          <section className="space-y-3">
            <p className="text-sm t-muted">
              平易でシンプルな、ビジネスでも通用する表現になっているかAIに見てもらいましょう。
            </p>
            <div className="tile-muted p-3 text-sm">
              <p className="text-xs font-semibold t-muted">意味ノード</p>
              <ul className="mt-1 space-y-0.5 text-xs t-subtle">
                {finalNodes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={runEnglish}
              disabled={loading || finalSentences.length === 0}
              className="btn-tertiary w-full px-4 py-2.5 text-sm font-medium"
            >
              🤖 AIに英文を見てもらう
            </button>
            <UsageBadge className="text-right" />
            {loading && (
              <p className="animate-pulse text-xs t-subtle whitespace-pre-wrap">
                {stream || 'AIが確認しています…'}
              </p>
            )}
            {english && !loading && (
              <div className="space-y-3">
                <div className="tile p-3 text-sm">
                  <p className="text-xs font-semibold t-muted">講評（場面: {english.scene}）</p>
                  <p className="mt-1 whitespace-pre-wrap">{english.comment}</p>
                </div>
                <ul className="space-y-2">
                  {english.sentences.map((s, i) => (
                    <li key={i} className="tile p-3 text-sm">
                      <p className="font-medium">
                        {s.ok ? '✅ ' : '✏️ '}
                        {s.original}
                      </p>
                      {s.issue && <p className="mt-1 text-xs t-muted">{s.issue}</p>}
                      {!s.ok && s.suggestion && (
                        <div className="mt-1">
                          <p className="text-xs link">→ {s.suggestion}</p>
                          {s.reason && <p className="text-xs t-subtle">{s.reason}</p>}
                          <button
                            onClick={() => adoptSentence(i, s.suggestion)}
                            className="btn-tertiary mt-1.5 px-3 py-1 text-xs font-medium"
                          >
                            提案を採用
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {english.expressions.length > 0 && (
                  <ExpressionsCard expressions={english.expressions} />
                )}
              </div>
            )}
          </section>
        )}

        {step === 5 && !saved && (
          <section className="space-y-3">
            <p className="text-sm t-muted">
              この内容を意味ノードカードとして保存すると、🧠 意味ノード生成ドリルのSRSに乗って
              あとから再学習できます。
            </p>
            <div className="tile p-3 text-sm">
              <p className="text-xs font-semibold t-muted">意味ノード（ja）</p>
              <p className="mt-1 whitespace-pre-wrap">{finalNodes.join('\n')}</p>
              <p className="mt-3 text-xs font-semibold t-muted">英文（en）</p>
              <p className="mt-1 whitespace-pre-wrap">{finalSentences.join('\n')}</p>
              <p className="mt-3 text-xs t-subtle">場面: {english?.scene || DEFAULT_SCENE}</p>
            </div>
            <button
              onClick={doSave}
              disabled={finalNodes.length === 0 || finalSentences.length === 0}
              className="btn-primary w-full px-4 py-3 font-medium"
            >
              📦 意味ノードカードとして保存
            </button>
            <button onClick={leave} className="btn-tertiary w-full px-4 py-2.5 text-sm">
              保存せず終了
            </button>
          </section>
        )}

        {step === 5 && saved && (
          <section className="space-y-4 pt-6 text-center">
            <p className="text-3xl">🎉</p>
            <p className="font-medium">意味ノード生成ドリルに追加されました</p>
            <div className="space-y-2 pt-2">
              <button onClick={restart} className="btn-primary w-full px-4 py-3 font-medium">
                💭 もう1本
              </button>
              <button onClick={() => navigate('/')} className="btn-tertiary w-full px-4 py-3">
                ホームへ
              </button>
            </div>
          </section>
        )}
      </div>

      {!(step === 5 && saved) && (
        <div className="flex items-center gap-2 border-t border-carbon-hairline pt-2 dark:border-carbon-line-dark">
          <button
            onClick={() => (step === 1 ? leave() : goStep(step - 1))}
            className="btn-tertiary px-4 py-2.5 text-sm"
          >
            {step === 1 ? '✕ やめる' : '← 戻る'}
          </button>
          {step < TOTAL_STEPS && (
            <button
              onClick={() => goStep(step + 1)}
              disabled={
                (step === 1 && thought.trim() === '') ||
                (step === 2 && finalNodes.length === 0) ||
                (step === 3 && finalSentences.length === 0) ||
                (step === 4 && !english)
              }
              className="btn-primary flex-1 px-4 py-2.5 font-medium"
            >
              次へ →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** 英文チェックで出た便利表現を表現ストック（端末内）へためるカード。 */
function ExpressionsCard({ expressions }: { expressions: { en: string; ja: string }[] }) {
  const items = useStock((s) => s.items)
  const add = useStock((s) => s.add)
  const remove = useStock((s) => s.remove)
  const stocked = (en: string) => items.some((i) => stockKey(i.en) === stockKey(en))

  return (
    <div className="rounded-none border-l-4 border-carbon-success bg-carbon-surface p-3 dark:bg-carbon-layer">
      <p className="text-xs font-semibold text-carbon-success">使える表現</p>
      <ul className="mt-2 space-y-2 text-sm">
        {expressions.map((e) => {
          const on = stocked(e.en)
          return (
            <li key={e.en} className="flex items-start justify-between gap-2">
              <span>
                <span className="font-medium">{e.en}</span>
                {e.ja && <span className="t-muted"> — {e.ja}</span>}
              </span>
              <button
                onClick={() => (on ? remove(e.en) : add(e))}
                className={`shrink-0 px-2 py-1 text-xs ${on ? 'chip-active' : 'chip'}`}
              >
                {on ? '✓ 追加済み' : '＋ 表現ストック'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
