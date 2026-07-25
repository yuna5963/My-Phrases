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
import { createLatencyMeter, DRILL_SET_SIZE, isStructure, medianMs } from '../lib/sentenceEngine'
import type { Grade } from '../types'
import type { MatchLevel } from '../lib/chunkMatch'

/**
 * 🧱 構文ドリル（Sentence Engine の第2層 Structure）。
 * 一つの構文パターンを常時見せながら、その変形例を「日本語 → 声に出して英作文 →
 * タッチで答え合わせ」で連続反復し、型を反射化する。瞬間英作文（Compose）の骨格を踏襲。
 * 出題はセット制のランダム順（DRILL_SET_SIZE 枚＝1セット）で、やりきった区切りを作る。
 * 起動レイテンシ（和訳表示→英文開示の中央値）を採点ログに記録する。
 */
export default function StructureDrill() {
  const s = useSession({
    filter: isStructure,
    mode: 'structure',
    shuffle: true,
    setSize: DRILL_SET_SIZE,
    requeueWeak: false,
  })
  const commitGate = useSettings((x) => x.commitGate)
  const voiceAnswer = useSettings((x) => x.voiceAnswer)
  const navigate = useNavigate()
  const { addSeed, seeding, seedError } = useSeedDeck(s.restart)

  // 和訳表示→英文開示のレイテンシ計測器（カードをまたいで保持。採点ごとに reset）。
  const meterRef = useRef(createLatencyMeter())
  const meter = meterRef.current
  // 採点したカードごとの中央値を貯め、セッション完了画面の中央値に使う。
  const sessionLatRef = useRef<number[]>([])

  // 英文を一度でも開示したら採点できる（最後の例文まで進まないと採点できない詰まりを解消）。
  const [canGrade, setCanGrade] = useState(false)
  useEffect(() => {
    setCanGrade(false)
    setPredicted(undefined)
    setAttempt(undefined)
  }, [s.pos])

  // 何セットやりきったか（完了画面に「セットN」を出すため）。
  const [setsDone, setSetsDone] = useState(0)

  // 開示前の申告（コミットゲート）。採点時に一緒に記録して過信の度合いを測る。
  const [predicted, setPredicted] = useState<'can' | 'unsure' | undefined>(undefined)
  // 音声モードで拾えた発話と自動照合の結果。
  const [attempt, setAttempt] = useState<{ text: string; level: MatchLevel } | undefined>(undefined)

  const c = s.current
  // チャンク本体は含めず、構文の変形例だけを出題列にする（Compose との違い）。
  const items = useMemo<ReproItem[]>(
    () => (c ? c.examples.map((ex) => ({ en: ex.en, ja: ex.ja })) : []),
    [c],
  )

  if (s.empty) {
    return (
      <SeedDeckEmpty
        title="まだ構文デッキがありません"
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
    s.answer(g, m, predicted, {
      launchMs: meter.launchMedian(),
      attempt: attempt?.text,
      autoMatch: attempt?.level,
    })
    meter.reset()
  }

  return (
    <div className="flex h-full flex-col">
      <SessionHeader pos={s.pos} total={s.total} title="構文ドリル" />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
        <ReproCard
          key={s.pos}
          items={items}
          meta={
            c && (
              <div className="mt-1 flex flex-col items-center gap-1">
                <span className="rounded-none bg-carbon-surface px-2 py-0.5 text-[11px] text-carbon-ink-muted dark:bg-carbon-line-dark dark:text-carbon-inverse-muted">
                  {c.category}
                </span>
                <p className="font-mono text-base font-semibold tracking-tight">{c.en}</p>
                <p className="t-subtle text-xs">{c.ja}</p>
              </div>
            )
          }
          accentClass="link"
          commitGate={commitGate}
          onPredict={setPredicted}
          voiceAnswer={voiceAnswer}
          onLaunch={() => meter.launched()}
          onAttempt={setAttempt}
          onStep={(st) => {
            if (st.revealed) meter.revealed()
            else meter.shown()
            setCanGrade(st.revealed)
          }}
        />
        <p className="text-center text-sm t-subtle">
          日本語を見て、この構文で声に出して英作文 → タッチで答え合わせ
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
