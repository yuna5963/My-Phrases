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

  const removePhrase = useDeck((s) => s.removePhrase)

  const state = (location.state ?? {}) as { ids?: string[]; backTo?: string }
  const backTo = state.backTo ?? '/browse'

  const phrase = phrases.find((p) => p.id === id)
  if (!phrase) {
    return (
      <div className="pt-20 text-center t-muted">
        <p>フレーズが見つかりませんでした。</p>
        <button onClick={() => navigate(backTo)} className="mt-4 link">
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
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">チャンク詳細</h1>
        <span className="text-xs t-subtle">ステータス: {phrase.status || '—'}</span>
      </div>

      <ModelCard phrase={phrase} accentText="link" />

      {!!phrase.kanaWarnings?.length && (
        <p className="t-muted border-l-4 border-carbon-warning bg-carbon-surface px-3 py-2 text-xs dark:bg-carbon-layer">
          ⚠ カナ要確認: {phrase.kanaWarnings.join(' / ')} — AI生成の下書きです。「✏️ 編集」でカナを修正すると解除されます。
        </p>
      )}

      {phrase.note && (
        <section className="rounded-none border-l-4 border-carbon-warning bg-carbon-surface p-4 text-sm leading-relaxed dark:bg-carbon-layer">
          📝 {phrase.note}
        </section>
      )}

      <section className="tile p-4 ">
        <h2 className="text-sm font-medium t-muted">学習の記録</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold">{pr ? `${pr.box} / 5` : '—'}</div>
            <div className="mt-0.5 text-xs t-muted">習熟度</div>
          </div>
          <div>
            <div className="text-xl font-bold text-carbon-success">{pr?.correct ?? 0}</div>
            <div className="mt-0.5 text-xs t-muted">できた</div>
          </div>
          <div>
            <div className="text-xl font-bold text-carbon-error">{pr?.wrong ?? 0}</div>
            <div className="mt-0.5 text-xs t-muted">できなかった</div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs t-subtle">{dueLabel(pr)}</p>
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setLearned(phrase.id, !learned)}
            className={`px-5 py-2 text-sm font-medium active:opacity-80 ${
 learned
                ? 'rounded-none bg-carbon-success text-white'
                : 'chip'
            }`}
          >
            {learned ? '☑ 覚えた' : '☐ 覚えた'}
          </button>
        </div>
      </section>

      {/* 片手で押せるよう、アクションは画面下部にまとめる。 */}
      <button
        onClick={() => navigate(`/chat?focus=${phrase.id}`)}
        className="btn-primary w-full py-4 font-medium"
      >
        💬 このチャンクで会話練習
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() =>
            navigate(`/chunk/${phrase.id}/edit`, { state: { ids, backTo } })
          }
          className="btn-secondary py-4 font-medium"
        >
          ✏️ 編集
        </button>
        <button
          onClick={async () => {
            if (
              !confirm(`「${phrase.en}」を削除します。学習の記録も消えます。よろしいですか？`)
            )
              return
            await removePhrase(phrase.id)
            navigate(backTo, { replace: true })
          }}
          className="rounded-none border border-carbon-error py-4 font-medium text-carbon-error active:opacity-80"
        >
          🗑 削除
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate(backTo)}
          className="btn-secondary py-4 font-medium"
        >
          ← 一覧へ
        </button>
        <button
          onClick={() => navigate(`/phrase/${phrase.id}`, { state: { ids, backTo } })}
          className="btn-primary py-4 font-medium"
        >
          ▶ 連続再生
        </button>
      </div>
    </div>
  )
}
