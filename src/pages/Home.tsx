import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { useStock } from '../store/useStock'
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
  const stockCount = useStock((s) => s.items.length)

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

      <section className="pt-2">
        <button
          onClick={() => navigate('/daily')}
          className="w-full rounded-2xl bg-emerald-600 px-5 py-5 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="text-lg font-bold">▶ 今日の練習</div>
          <div className="text-sm text-emerald-100">
            {stats.due > 0
              ? `期日到来 ${stats.due} 件を習熟度に合わせて出題`
              : '今日の分は完了。下のモードで追加練習もできます'}
          </div>
        </button>
      </section>

      <section className="space-y-3">
        <button
          onClick={() => navigate('/compose')}
          className="w-full rounded-2xl bg-sky-500 px-5 py-4 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="text-lg font-bold">⚡ 瞬間英作文</div>
          <div className="text-sm text-sky-100">日本語を見てチャンクを即作文＋例文確認</div>
        </button>
        <button
          onClick={() => navigate('/cloze')}
          className="w-full rounded-2xl bg-rose-500 px-5 py-4 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="text-lg font-bold">🧩 文脈穴埋め</div>
          <div className="text-sm text-rose-100">例文の穴からチャンクを思い出す</div>
        </button>
        <button
          onClick={() => navigate('/long-reading')}
          className="w-full rounded-2xl bg-amber-500 px-5 py-4 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="text-lg font-bold">📖 長文音読</div>
          <div className="text-sm text-amber-100">長文をお手本に続けて音読</div>
        </button>
        <button
          onClick={() => navigate('/chat')}
          className="w-full rounded-2xl bg-violet-500 px-5 py-4 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="text-lg font-bold">💬 チャット練習</div>
          <div className="text-sm text-violet-100">AIコーチと会話して覚えたチャンクを使う</div>
        </button>
        <button
          onClick={() => navigate('/stock')}
          className="w-full rounded-2xl bg-teal-500 px-5 py-4 text-left text-white shadow active:scale-[0.99]"
        >
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-bold">🗂 表現ストック</div>
            {stockCount > 0 && (
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-medium">
                {stockCount}件
              </span>
            )}
          </div>
          <div className="text-sm text-teal-100">
            {stockCount > 0
              ? 'ためた表現をAIで教材化してデッキに追加'
              : 'チャットで出会った表現をためて教材にする'}
          </div>
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
