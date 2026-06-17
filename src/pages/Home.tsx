import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { computeStats } from '../lib/session'

function Stat({ value, label, accent }: { value: number; label: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm dark:bg-slate-900">
      <div className={`text-2xl font-bold ${accent ?? ''}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const streak = useDeck((s) => s.streak)
  const source = useDeck((s) => s.source)
  const includeStatuses = useSettings((s) => s.includeStatuses)

  const stats = useMemo(
    () => computeStats(phrases, progress, includeStatuses),
    [phrases, progress, includeStatuses],
  )

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">My Phrases</h1>
        <span className="text-sm text-slate-500">🔥 {streak}日連続</span>
      </header>

      {source === 'sample' && (
        <button
          onClick={() => navigate('/settings')}
          className="w-full rounded-2xl border border-sky-300 bg-sky-50 p-3 text-left text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
        >
          📥 いまはサンプル表示中。Notionのエクスポートを取り込む →
        </button>
      )}

      <section className="grid grid-cols-3 gap-3">
        <Stat value={stats.due} label="今日の出題" accent="text-sky-500" />
        <Stat value={stats.newCount} label="新規" />
        <Stat value={stats.mastered} label="習得済み" accent="text-emerald-500" />
      </section>
      <section className="grid grid-cols-2 gap-3">
        <Stat value={stats.studiedToday} label="今日やった" />
        <Stat value={stats.total} label="登録フレーズ" />
      </section>

      <section className="space-y-3 pt-2">
        <button
          onClick={() => navigate('/compose')}
          className="w-full rounded-2xl bg-sky-500 px-5 py-4 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="text-lg font-bold">⚡ 瞬間英作文</div>
          <div className="text-sm text-sky-100">日本語を見て英語を即作文（1文）</div>
        </button>
        <button
          onClick={() => navigate('/modeling')}
          className="w-full rounded-2xl bg-teal-500 px-5 py-4 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="text-lg font-bold">📝 モデリング</div>
          <div className="text-sm text-teal-100">お手本を見て音読（2文以上）</div>
        </button>
        <button
          onClick={() => navigate('/pronounce')}
          className="w-full rounded-2xl bg-violet-500 px-5 py-4 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="text-lg font-bold">🗣️ 発音練習</div>
          <div className="text-sm text-violet-100">お手本を聞いて声に出す</div>
        </button>
      </section>

      {stats.due === 0 && (
        <p className="text-center text-sm text-emerald-500">
          今日のノルマは完了！ それでも練習できます 🎉
        </p>
      )}
    </div>
  )
}
