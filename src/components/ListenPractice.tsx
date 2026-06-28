import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession, type SessionOptions } from '../hooks/useSession'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { speak, speakSequence, stopSpeaking, type SeqPart } from '../lib/tts'
import type { Phrase } from '../types'
import SessionHeader from './SessionHeader'
import SessionSummary from './SessionSummary'
import MetaChips from './MetaChips'

interface Props {
  title: string
  /** Encouragement shown under the card. */
  hint: string
  /** Tailwind accent colour for the prompt text + play button. */
  accent: { text: string; button: string }
  filter?: SessionOptions['filter']
  /** シャッフル / 自信なし の絞り込みと「覚えた」チェックを表示する（発音練習）。 */
  practice?: boolean
}

/** お手本の読み上げ列: チャンク → 例文1 → 例文2 …（英語）。 */
function modelParts(c: Phrase): SeqPart[] {
  const parts: SeqPart[] = []
  if (c.en) parts.push({ text: c.en, lang: 'en-US' })
  for (const ex of c.examples) if (ex.en) parts.push({ text: ex.en, lang: 'en-US' })
  return parts
}

/**
 * Shared "listen to the model and say it aloud" practice flow used by both
 * 発音練習 and モデリング — the model English (chunk + 5 examples) is shown
 * from the start and the user self-grades whether they could say it.
 */
export default function ListenPractice({ title, hint, accent, filter, practice }: Props) {
  const [shuffle, setShuffle] = useState(false)
  const [onlyUnsure, setOnlyUnsure] = useState(false)
  const s = useSession({ filter, shuffle, onlyUnsure })
  const autoPlay = useSettings((x) => x.autoPlay)
  const voiceURI = useSettings((x) => x.voiceURI)
  const rate = useSettings((x) => x.rate)
  const progress = useDeck((x) => x.progress)
  const setLearned = useDeck((x) => x.setLearned)
  const navigate = useNavigate()

  // Token to cancel an in-flight model playback when the card changes / unmounts.
  const playToken = useRef(0)
  const playModel = (c: Phrase) => {
    const token = ++playToken.current
    speakSequence(modelParts(c), {
      voiceURI,
      rate,
      gapMs: 2000, // チャンク→例文、例文→次の例文の間を2s空ける
      isCancelled: () => token !== playToken.current,
    })
  }

  // Auto-play the model (chunk + examples) when a new card appears.
  useEffect(() => {
    if (autoPlay && s.current) playModel(s.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.pos])

  // Stop speech when leaving the screen.
  useEffect(() => () => stopSpeaking(), [])

  const controls = practice ? (
    <div className="mb-2 flex justify-center gap-2">
      <FilterChip active={shuffle} onClick={() => setShuffle((v) => !v)}>
        🔀 シャッフル
      </FilterChip>
      <FilterChip active={onlyUnsure} onClick={() => setOnlyUnsure((v) => !v)}>
        ⚠️ 自信なし
      </FilterChip>
    </div>
  ) : null

  if (s.empty) {
    return (
      <div className="flex h-full flex-col">
        {controls}
        <div className="pt-20 text-center text-slate-500">
          <p>
            {onlyUnsure
              ? '「自信なし」のフレーズはありません。'
              : '練習できるフレーズがありません。'}
          </p>
          <button onClick={() => navigate('/')} className="mt-4 text-sky-500">
            ホームへ戻る
          </button>
        </div>
      </div>
    )
  }
  if (s.done) return <SessionSummary tally={s.tally} onRestart={s.restart} />

  const c = s.current!
  const learned = progress[c.id]?.learned === true

  return (
    <div className="flex h-full flex-col">
      <SessionHeader pos={s.pos} total={s.total} title={title} />
      {controls}

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
        <div className="w-full rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="text-center">
            <p className={`text-2xl font-bold leading-relaxed ${accent.text}`}>
              {c.en}
            </p>
            <p className="mt-2 text-sm text-slate-500">{c.ja}</p>
            <MetaChips phrase={c} />
          </div>
          {c.examples.length > 0 && (
            <ol className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              {c.examples.map((ex, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base leading-relaxed text-slate-700 dark:text-slate-200">
                      {ex.en}
                    </p>
                    {ex.ja && <p className="mt-0.5 text-xs text-slate-400">{ex.ja}</p>}
                  </div>
                  <button
                    onClick={() => speak(ex.en, { voiceURI, rate })}
                    className="shrink-0 text-sky-500 active:scale-95"
                  >
                    🔊
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <button
          onClick={() => playModel(c)}
          className={`rounded-full px-5 py-2.5 font-medium text-white active:scale-95 ${accent.button}`}
        >
          🔊 お手本を聞く
        </button>
        {practice && (
          <LearnedCheck checked={learned} onClick={() => setLearned(c.id, !learned)} />
        )}
        <p className="text-center text-sm text-slate-400">{hint}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={() => s.answer('vague')}
          className="rounded-2xl bg-slate-400 py-4 font-medium text-white active:scale-95"
        >
          🔁 もう一度
        </button>
        <button
          onClick={() => s.answer('good')}
          className="rounded-2xl bg-emerald-500 py-4 font-medium text-white active:scale-95"
        >
          ✅ 言えた
        </button>
      </div>

      {/* 片手で押せるよう、終了は画面下部に置く。 */}
      <button
        onClick={() => navigate('/')}
        className="mt-2 w-full py-2 text-center text-sm text-slate-400 active:scale-95"
      >
        ✕ やめる
      </button>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium active:scale-95 ${
        active
          ? 'bg-amber-500 text-white'
          : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

function LearnedCheck({
  checked,
  onClick,
}: {
  checked: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-5 py-2 text-sm font-medium active:scale-95 ${
        checked
          ? 'bg-emerald-500 text-white'
          : 'border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-300'
      }`}
    >
      {checked ? '☑ 覚えた' : '☐ 覚えた'}
    </button>
  )
}
