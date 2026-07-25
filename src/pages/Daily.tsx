import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { speak, speakSequence, stopSpeaking } from '../lib/tts'
import { formFor, type DailyForm } from '../lib/dailyForm'
import { clozeItems } from '../lib/cloze'
import type { Grade, Phrase } from '../types'
import type { MatchLevel } from '../lib/chunkMatch'
import SessionHeader from '../components/SessionHeader'
import SessionSummary from '../components/SessionSummary'
import ModelCard, { modelParts } from '../components/ModelCard'
import ReproCard, { chunkAndExampleItems } from '../components/ReproCard'
import ClozeCard from '../components/ClozeCard'
import GradeButtons from '../components/GradeButtons'
import MetaChips from '../components/MetaChips'
import StepNav from '../components/StepNav'

/** カード上部に出す形式ラベルと、カード下の一言ヒント。 */
const FORM_META: Record<DailyForm, { label: string; hint: string }> = {
  model: { label: '📝 モデリング', hint: 'チャンクと例文をお手本に音読しよう' },
  repro: { label: '🔁 再現練習', hint: '日本語からチャンクを思い出して声に出そう' },
  compose: { label: '⚡ 瞬間英作文', hint: '' },
  cloze: { label: '🧩 文脈穴埋め', hint: '' },
}

/**
 * 今日の練習: SRSの期日が来たカードを、習熟度（Leitnerボックス）に応じた
 * 練習形式で自動的に出し分ける統合セッション。
 * 新規=モデリング → box 0-1=再現練習 → box 2以上=瞬間英作文。
 * 形式は表示のたびに進捗から算出するので、採点で box が動けば
 * 同じセッション内の再出題でも形式が習熟度に追従する。
 */
export default function Daily() {
  const s = useSession({ noFallback: true, mode: 'daily' })
  const progress = useDeck((x) => x.progress)
  const autoPlay = useSettings((x) => x.autoPlay)
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)
  const commitGate = useSettings((x) => x.commitGate)
  const voiceAnswer = useSettings((x) => x.voiceAnswer)
  const navigate = useNavigate()

  const [revealed, setRevealed] = useState(false) // cloze: 答えを開示したか
  const [reproRevealed, setReproRevealed] = useState(false) // repro: 英文を開示したか
  const [composeEnd, setComposeEnd] = useState(false) // compose: 最後の項目まで開示したか
  // 開示前の申告（コミットゲート）。採点時に一緒に記録して過信の度合いを測る。
  const [predicted, setPredicted] = useState<'can' | 'unsure' | undefined>(undefined)
  const [attempt, setAttempt] = useState<{ text: string; level: MatchLevel } | undefined>(undefined)

  // カード切替時にお手本の連続再生を打ち切るためのトークン。
  const playToken = useRef(0)
  const [modelPlaying, setModelPlaying] = useState(false)
  const playModel = (p: Phrase) => {
    const token = ++playToken.current
    setModelPlaying(true)
    speakSequence(modelParts(p), {
      voiceURI,
      rate,
      gapMs: 2000, // チャンク→例文、例文→次の例文の間を2s空ける
      isCancelled: () => token !== playToken.current,
      onDone: () => {
        if (token === playToken.current) setModelPlaying(false)
      },
    })
  }
  const stopModel = () => {
    playToken.current++
    setModelPlaying(false)
    stopSpeaking()
  }

  const c = s.current
  const form: DailyForm | null = c ? formFor(progress[c.id], c) : null

  // カードが替わったら開示状態をリセットし、前カードの再生を止める。
  // モデリング形式のカードは自動でチャンクだけを読み上げる。
  // 例文までの連続読み上げ（お手本）はボタンを押したときのみ。
  useEffect(() => {
    setRevealed(false)
    setReproRevealed(false)
    setComposeEnd(false)
    setPredicted(undefined)
    setAttempt(undefined)
    stopModel()
    const cur = s.current
    if (autoPlay && cur && formFor(useDeck.getState().progress[cur.id], cur) === 'model') {
      speak(cur.en, { voiceURI, rate })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.pos])

  // 画面を離れるときに読み上げを止める。
  useEffect(
    () => () => {
      playToken.current++
      stopSpeaking()
    },
    [],
  )

  // ReproCard は items の identity 変化で先頭に戻るため、カードごとに固定する。
  const reproItems = useMemo(
    () => (c ? [{ en: c.en, ja: c.ja, kana: c.kana }] : []),
    [c],
  )

  // compose 形式はチャンク→例文1〜5 を続けて練習する（瞬間英作文と同じ列）。
  const composeItems = useMemo(
    () => (c && form === 'compose' ? chunkAndExampleItems(c) : []),
    [c, form],
  )

  // 穴埋めの出題例文は表示のたびにランダムに1つ選ぶ（同一カード内では固定）。
  const clozeItem = useMemo(() => {
    if (!c || form !== 'cloze') return null
    const items = clozeItems(c)
    return items[Math.floor(Math.random() * items.length)] ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, form, s.pos])

  if (s.empty) {
    return (
      <div className="pt-20 text-center t-muted">
        <p>今日の練習はすべて完了です 🎉</p>
        <button onClick={() => navigate('/')} className="mt-4 link">
          ホームへ戻る
        </button>
      </div>
    )
  }
  if (s.done) return <SessionSummary tally={s.tally} onRestart={s.restart} />

  const meta = FORM_META[form!]

  // ReproCard を使う形式（再現・瞬間英作文）は、開示前の申告を採点ログへ一緒に残す。
  const gradeWithPrediction = (g: Grade) =>
    s.answer(g, undefined, predicted, { attempt: attempt?.text, autoMatch: attempt?.level })

  // cloze: 開示時に例文全文を（設定に応じて）読み上げる。
  const revealCloze = () => {
    setRevealed(true)
    if (autoPlay && clozeItem) {
      speak(clozeItem.before + clozeItem.chunk + clozeItem.after, { voiceURI, rate })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <SessionHeader pos={s.pos} total={s.total} title="今日の練習" />
      <p className="mt-1 text-center text-xs font-medium t-subtle">
        {meta.label}
      </p>

      {form === 'model' && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
            <ModelCard phrase={c!} accentText="text-carbon-blue dark:text-carbon-blue-40" />
            <button
              onClick={() => (modelPlaying ? stopModel() : playModel(c!))}
              className={`px-5 py-2.5 font-medium active:opacity-80 ${
 modelPlaying ? 'btn-secondary' : 'btn-primary'
              }`}
            >
              {modelPlaying ? '⏸ 停止' : '🔊 お手本を聞く'}
            </button>
            <p className="text-center text-sm t-subtle">{meta.hint}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => s.answer('vague')}
              className="btn-secondary py-4 font-medium"
            >
              🔁 もう一度
            </button>
            <button
              onClick={() => s.answer('good')}
              className="rounded-none bg-carbon-success py-4 font-medium text-white active:opacity-80"
            >
              ✅ 言えた
            </button>
          </div>
        </>
      )}

      {form === 'repro' && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
            <ReproCard
              key={s.pos}
              items={reproItems}
              onStep={(st) => setReproRevealed(st.revealed)}
              commitGate={commitGate}
              onPredict={setPredicted}
              voiceAnswer={voiceAnswer}
              onAttempt={setAttempt}
            />
            <p className="text-center text-sm t-subtle">{meta.hint}</p>
          </div>
          {reproRevealed && <GradeButtons onGrade={gradeWithPrediction} />}
        </>
      )}

      {form === 'compose' && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
            <ReproCard
              key={s.pos}
              items={composeItems}
              meta={<MetaChips phrase={c!} />}
              accentClass="link"
              onStep={(st) =>
                setComposeEnd(st.revealed && st.idx === composeItems.length - 1)
              }
              commitGate={commitGate}
              onPredict={setPredicted}
              voiceAnswer={voiceAnswer}
              onAttempt={setAttempt}
            />
            <p className="text-center text-sm t-subtle">
              日本語を見て声に出して英作文 → タッチで答え合わせ
            </p>
          </div>
          {composeEnd && <GradeButtons onGrade={gradeWithPrediction} />}
        </>
      )}

      {form === 'cloze' && clozeItem && (
        <>
          <ClozeCard
            item={clozeItem}
            chunkJa={c!.ja}
            revealed={revealed}
            onReveal={revealCloze}
          />
          {revealed && <GradeButtons onGrade={s.answer} />}
        </>
      )}

      <StepNav
        onPrev={s.goPrev}
        onNext={s.goNext}
        canPrev={s.canPrev}
        canNext={s.canNext}
      />

      {/* 片手で押せるよう、終了は画面下部に置く。 */}
      <button
        onClick={() => navigate('/')}
        className="mt-2 w-full py-2 text-center text-sm t-subtle active:opacity-80"
      >
        ✕ やめる
      </button>
    </div>
  )
}
