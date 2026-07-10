import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { isDue, isMastered, isNew } from '../lib/srs'
import type { Progress } from '../types'
import ModelCard from '../components/ModelCard'

/** 進捗の次回出題をひと言で表す。 */
function dueLabel(pr: Progress | undefined): string {
  if (!pr || isNew(pr)) return 'まだ学習していません（新規）'
  if (isMastered(pr)) return '習得済み ✅'
  if (isDue(pr)) return '今日出題されます'
  return `次回の出題: ${pr.due}`
}

/**
 * チャンク詳細: 英語・カナ・日本語・メタ情報・note・例文と学習の記録を
 * 落ち着いて確認する画面。連続再生（フレーズ再生）へはここから明示的に移る。
 * 一覧からの遷移で受け取った ids / backTo は、そのままプレイヤーへ引き継ぐ。
 */
export default function ChunkDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const setLearned = useDeck((s) => s.setLearned)

  const state = (location.state ?? {}) as { ids?: string[]; backTo?: string }
  const backTo = state.backTo ?? '/browse'

  const phrase = phrases.find((p) => p.id === id)
  if (!phrase) {
    return (
      <div className="pt-20 text-center text-slate-500">
        <p>フレーズが見つかりませんでした。</p>
        <button onClick={() => navigate(backTo)} className="mt-4 text-sky-500">
          一覧へ戻る
        </button>
      </div>
    )
  }

  const ids = state.ids ?? [phrase.id]
  const pr = progress[phrase.id]
  const learned = pr?.learned === true

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">チャンク詳細</h1>

      <ModelCard phrase={phrase} accentText="text-sky-600 dark:text-sky-400" />

      {phrase.note && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          📝 {phrase.note}
        </section>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <h2 className="text-sm font-medium text-slate-500">学習の記録</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold">{pr ? `${pr.box} / 5` : '—'}</div>
            <div className="mt-0.5 text-xs text-slate-500">習熟度</div>
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-500">{pr?.correct ?? 0}</div>
            <div className="mt-0.5 text-xs text-slate-500">できた</div>
          </div>
          <div>
            <div className="text-xl font-bold text-rose-500">{pr?.wrong ?? 0}</div>
            <div className="mt-0.5 text-xs text-slate-500">できなかった</div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">{dueLabel(pr)}</p>
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setLearned(phrase.id, !learned)}
            className={`rounded-full px-5 py-2 text-sm font-medium active:scale-95 ${
              learned
                ? 'bg-emerald-500 text-white'
                : 'border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            {learned ? '☑ 覚えた' : '☐ 覚えた'}
          </button>
        </div>
      </section>

      {/* 片手で押せるよう、アクションは画面下部にまとめる。 */}
      <button
        onClick={() => navigate(`/chat?focus=${phrase.id}`)}
        className="w-full rounded-2xl bg-sky-500 py-4 font-medium text-white active:scale-95"
      >
        💬 このチャンクで会話練習
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate(backTo)}
          className="rounded-2xl bg-slate-200 py-4 font-medium text-slate-600 active:scale-95 dark:bg-slate-800 dark:text-slate-300"
        >
          ← 一覧へ
        </button>
        <button
          onClick={() => navigate(`/phrase/${phrase.id}`, { state: { ids, backTo } })}
          className="rounded-2xl bg-violet-500 py-4 font-medium text-white active:scale-95"
        >
          ▶ 連続再生
        </button>
      </div>
    </div>
  )
}
