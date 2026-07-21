import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { useStock } from '../store/useStock'
import { computeStats } from '../lib/session'
import GoalProgress from '../components/GoalProgress'
import TodayPlan from '../components/TodayPlan'

/** モード一覧の行: 白タイル＋ヘアライン。アクセントは青の矢印のみ（Carbon product-card）。 */
function ModeCard({
  emoji,
  title,
  desc,
  onClick,
  badge,
}: {
  emoji: string
  title: string
  desc: string
  onClick: () => void
  badge?: string
}) {
  return (
    <button onClick={onClick} className="tile w-full p-4 text-left active:bg-carbon-surface dark:active:bg-carbon-line-dark">
      <div className="flex items-baseline justify-between">
        <div className="text-base font-semibold">
          {emoji} {title}
        </div>
        {badge && (
          <span className="bg-carbon-surface px-2 py-0.5 text-xs text-carbon-ink-muted dark:bg-carbon-line-dark dark:text-carbon-inverse-muted">
            {badge}
          </span>
        )}
      </div>
      <div className="t-muted mt-1 flex items-center justify-between text-sm">
        <span>{desc}</span>
        <span className="link ml-2 shrink-0">→</span>
      </div>
    </button>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const streak = useDeck((s) => s.streak)
  const source = useDeck((s) => s.source)
  const includeStatuses = useSettings((s) => s.includeStatuses)
  const stockCount = useStock((s) => s.items.length)

  const stats = useMemo(
    () => computeStats(phrases, progress, includeStatuses),
    [phrases, progress, includeStatuses],
  )

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-normal">My Phrases</h1>
        <span className="t-muted text-sm">🔥 {streak}日連続</span>
      </header>

      {source === 'sample' && (
        <button
          onClick={() => navigate('/settings')}
          className="tile-muted w-full p-3 text-left text-sm"
        >
          📥 いまはサンプル表示中。<span className="link">Notionのエクスポートを取り込む →</span>
        </button>
      )}

      <GoalProgress />

      <TodayPlan />

      <section className="pt-2">
        {/* 主導線だけ青ソリッド（cta-banner）。他は白タイルでアクセントを絞る */}
        <button
          onClick={() => navigate('/daily')}
          className="btn-primary w-full px-5 py-5 text-left"
        >
          <div className="text-lg font-semibold">▶ 今日の練習</div>
          <div className="mt-0.5 text-sm text-white/80">
            {stats.due > 0
              ? `期日到来 ${stats.due} 件を習熟度に合わせて出題`
              : '今日の分は完了。下のモードで追加練習もできます'}
          </div>
        </button>
      </section>

      <section className="space-y-3">
        <ModeCard
          emoji="🧱"
          title="構文ドリル"
          desc="一つの構文を変形して反射化する"
          onClick={() => navigate('/structure')}
        />
        <ModeCard
          emoji="🧠"
          title="意味ノード生成"
          desc="意味の骨子から英文を組み立てる"
          onClick={() => navigate('/message')}
        />
        <ModeCard
          emoji="💭"
          title="意味ノード英語思考"
          desc="自分の思考をノードに分解し、AIと英文を磨く"
          onClick={() => navigate('/think')}
        />
        <ModeCard
          emoji="⚡"
          title="瞬間英作文"
          desc="日本語を見てチャンクを即作文＋例文確認"
          onClick={() => navigate('/compose')}
        />
        <ModeCard
          emoji="🧩"
          title="文脈穴埋め"
          desc="例文の穴からチャンクを思い出す"
          onClick={() => navigate('/cloze')}
        />
        <ModeCard
          emoji="📖"
          title="長文音読"
          desc="長文をお手本に続けて音読"
          onClick={() => navigate('/long-reading')}
        />
        <ModeCard
          emoji="💬"
          title="チャット練習"
          desc="AIコーチと会話して覚えたチャンクを使う"
          onClick={() => navigate('/chat')}
        />
        <ModeCard
          emoji="🗂"
          title="表現ストック"
          desc={
            stockCount > 0
              ? 'ためた表現をAIで教材化してデッキに追加'
              : 'チャットで出会った表現をためて教材にする'
          }
          onClick={() => navigate('/stock')}
          badge={stockCount > 0 ? `${stockCount}件` : undefined}
        />
      </section>

      {stats.due === 0 && (
        <p className="text-center text-sm text-carbon-success">
          今日のノルマは完了！ それでも練習できます 🎉
        </p>
      )}
    </div>
  )
}
