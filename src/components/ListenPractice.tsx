import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession, type SessionOptions } from '../hooks/useSession'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { speak } from '../lib/tts'
import SessionHeader from './SessionHeader'
import SessionSummary from './SessionSummary'
import PlayButton from './PlayButton'

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

/**
 * Shared "listen to the model and say it aloud" practice flow used by both
 * 発音練習 and モデリング — the model English is shown from the start and the
 * user self-grades whether they could say it.
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

  // Auto-play the model audio when a new card appears.
  useEffect(() => {
    if (autoPlay && s.current) speak(s.current.en, { voiceURI, rate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.pos])

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

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
        <div className="w-full rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-900">
          <p className={`text-2xl font-bold leading-relaxed ${accent.text}`}>
            {c.en}
          </p>
          <p className="mt-3 text-sm text-slate-500">{c.ja}</p>
        </div>

        <PlayButton text={c.en} label="🔊 もう一度聞く" className={accent.button} />
        {practice && (
          <LearnedCheck
            checked={learned}
            onClick={() => setLearned(c.id, !learned)}
          />
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
