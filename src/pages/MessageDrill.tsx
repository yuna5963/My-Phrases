import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../store/useSettings'
import SessionHeader from '../components/SessionHeader'
import SessionSummary from '../components/SessionSummary'
import ReproCard, { type ReproItem } from '../components/ReproCard'
import GradeButtons from '../components/GradeButtons'
import StepNav from '../components/StepNav'
import SeedDeckEmpty, { useSeedDeck } from '../components/SeedDeckEmpty'
import { createLatencyMeter, DRILL_SET_SIZE, isMessage, medianMs } from '../lib/sentenceEngine'
import type { Grade } from '../types'

/**
 * 🧠 意味ノード生成（Sentence Engine の第3層 Message）。
 * 主張→根拠→補足のような意味の骨子（改行区切りのノード）を見て、日本語の完成文を
 * 作らずに英文を組み立てる。参考出力は開示のみで、正解は一つではない。
 * 起動レイテンシ（骨子表示→英文開示）を採点ログに記録する。
 */
export default function MessageDrill() {
  const s = useSession({
    filter: isMessage,
    mode: 'message',
    shuffle: true,
    setSize: DRILL_SET_SIZE,
    requeueWeak: false,
  })
  const commitGate = useSettings((x) => x.commitGate)
  const navigate = useNavigate()
  const { addSeed, seeding, seedError } = useSeedDeck(s.restart)

  const meterRef = useRef(createLatencyMeter())
  const meter = meterRef.current
  // 採点したカードごとの中央値を貯め、セッション完了画面の中央値に使う。
  const sessionLatRef = useRef<number[]>([])

  // 英文（参考出力）を開示したら採点できる。
  const [canGrade, setCanGrade] = useState(false)
  useEffect(() => {
    setCanGrade(false)
    setPredicted(undefined)
  }, [s.pos])

  // 何セットやりきったか（完了画面に「セットN」を出すため）。
  const [setsDone, setSetsDone] = useState(0)

  // 開示前の申告（コミットゲート）。採点時に一緒に記録して過信の度合いを測る。
  const [predicted, setPredicted] = useState<'can' | 'unsure' | undefined>(undefined)

  const c = s.current
  // 意味ノードは1枚を1項目として扱う（骨子ja → 参考出力en）。
  const items = useMemo<ReproItem[]>(
    () => (c ? [{ ja: c.ja, en: c.en }] : []),
    [c],
  )

  if (s.empty) {
    return (
      <SeedDeckEmpty
        title="まだ意味ノードデッキがありません"
        onAdd={addSeed}
        seeding={seeding}
        seedError={seedError}
      />
    )
  }
  if (s.done)
    return (
      <SessionSummary
        tally={s.tally}
        onRestart={() => {
          meter.reset()
          sessionLatRef.current = []
          setSetsDone((n) => n + 1)
          s.restart()
        }}
        latencyMedianMs={medianMs(sessionLatRef.current)}
        setNumber={setsDone + 1}
      />
    )

  const grade = (g: Grade) => {
    const m = meter.median()
    if (m != null) sessionLatRef.current.push(m)
    s.answer(g, m, predicted)
    meter.reset()
  }

  return (
    <div className="flex h-full flex-col">
      <SessionHeader pos={s.pos} total={s.total} title="意味ノード生成" />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
        <ReproCard
          key={s.pos}
          items={items}
          speakJa={false}
          revealNote="参考出力（正解は一つではない）"
          meta={
            c && (
              <div className="mt-1 flex justify-center">
                <span className="rounded-none bg-carbon-surface px-2 py-0.5 text-[11px] text-carbon-ink-muted dark:bg-carbon-line-dark dark:text-carbon-inverse-muted">
                  {c.category}
                </span>
              </div>
            )
          }
          accentClass="link"
          commitGate={commitGate}
          onPredict={setPredicted}
          onStep={(st) => {
            if (st.revealed) meter.revealed()
            else meter.shown()
            setCanGrade(st.revealed)
          }}
        />
        <p className="text-center text-sm t-subtle">
          意味の骨子から、日本語の完成文を作らずに英文を組み立てる → タッチで参考出力
        </p>
      </div>

      {canGrade && <GradeButtons onGrade={grade} />}

      <StepNav
        onPrev={() => {
          meter.reset()
          s.goPrev()
        }}
        onNext={() => {
          meter.reset()
          s.goNext()
        }}
        canPrev={s.canPrev}
        canNext={s.canNext}
      />

      <button
        onClick={() => navigate('/')}
        className="mt-2 w-full py-2 text-center text-sm t-subtle active:opacity-80"
      >
        ✕ やめる
      </button>
    </div>
  )
}
