import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { useStock } from '../store/useStock'
import { computeStats } from '../lib/session'
import { computeDailySummary } from '../lib/kpi'
import GoalProgress from '../components/GoalProgress'
import TodayPlan from '../components/TodayPlan'

function Stat({ value, label, accent }: { value: number; label: string; accent?: string }) {
  return (
    <div className="tile p-4 text-center">
      <div className={`display text-2xl ${accent ?? ''}`}>{value}</div>
      <div className="t-muted mt-0.5 text-xs">{label}</div>
    </div>
  )
}

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
  const events = useDeck((s) => s.events)
  const includeStatuses = useSettings((s) => s.includeStatuses)
  const stockCount = useStock((s) => s.items.length)

  const stats = useMemo(
    () => computeStats(phrases, progress, includeStatuses),
    [phrases, progress, includeStatuses],
  )
  const today = useMemo(() => computeDailySummary(events), [events])

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

      <section className="tile p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">今日のあゆみ</h2>
          <span className="t-subtle text-xs">
            {today.minimumMet ? '✓ 今日の最低ラインは達成' : '5分の連続再生だけでもOK'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="display text-2xl">{today.graded}</div>
            <div className="t-muted mt-0.5 text-xs">採点した</div>
          </div>
          <div>
            <div className="display text-2xl">{today.outputs}</div>
            <div className="t-muted mt-0.5 text-xs">アウトプット</div>
          </div>
          <div>
            <div className="display text-2xl text-carbon-success">{today.retained}</div>
            <div className="t-muted mt-0.5 text-xs">定着した</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat value={stats.due} label="今日の出題" accent="text-carbon-blue dark:text-carbon-blue-40" />
        <Stat value={stats.newCount} label="新規" />
        <Stat value={stats.mastered} label="習得済み" accent="text-carbon-success" />
      </section>
      <section className="grid grid-cols-2 gap-3">
        <Stat value={stats.studiedToday} label="今日やった" />
        <Stat value={stats.total} label="登録フレーズ" />
      </section>

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
