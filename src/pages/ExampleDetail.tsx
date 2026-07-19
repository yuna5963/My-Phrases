import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import ReproCard from '../components/ReproCard'
import StepNav from '../components/StepNav'

/** 一覧から渡される例文の参照（チャンクID＋例文番号0始まり）。 */
interface ExampleRef {
  phraseId: string
  index: number
}

/**
 * 例文カード: 例文一覧でタップした例文を1枚のカードで練習する。
 * 瞬間英作文の例文表示と同じ「日本語 → タッチ → 英文＋カナ＋Word Spark ハイライト」
 * （共通 `ReproCard`）。「← 戻る / 進む →」で絞り込み結果内の例文を移動できる。
 */
export default function ExampleDetail() {
  const { phraseId, index } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const phrases = useDeck((s) => s.phrases)

  const state = (location.state ?? {}) as { items?: ExampleRef[]; backTo?: string }
  const backTo = state.backTo ?? '/examples'

  // 一覧から渡された絞り込み結果。直接URLで来たときはこのチャンクの例文だけで組む。
  const items = useMemo<ExampleRef[]>(() => {
    if (state.items?.length) return state.items
    const p = phrases.find((x) => x.id === phraseId)
    if (!p) return []
    return p.examples
      .map((ex, i) => ({ phraseId: p.id, index: i, en: ex.en }))
      .filter((r) => r.en)
      .map(({ phraseId: pid, index: i }) => ({ phraseId: pid, index: i }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases, phraseId])

  const initial = items.findIndex(
    (r) => r.phraseId === phraseId && r.index === Number(index),
  )
  const [pos, setPos] = useState(Math.max(0, initial))

  const ref = items[pos]
  const phrase = ref ? phrases.find((x) => x.id === ref.phraseId) : undefined
  const example = phrase?.examples[ref?.index ?? 0]

  if (!phrase || !example?.en) {
    return (
      <div className="pt-20 text-center t-muted">
        <p>例文が見つかりませんでした。</p>
        <button onClick={() => navigate(backTo)} className="mt-4 link">
          一覧へ戻る
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">例文カード</span>
        <span className="t-subtle">
          {pos + 1} / {items.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
        <ReproCard
          key={pos}
          items={[{ en: example.en, ja: example.ja, kana: example.kana }]}
          meta={
            <p className="mt-1 text-xs t-subtle">
              例文{ref.index + 1}・{phrase.en}
            </p>
          }
          accentClass="link"
        />
        <button
          onClick={() =>
            navigate(`/chunk/${phrase.id}`, {
              state: { ids: [...new Set(items.map((r) => r.phraseId))], backTo },
            })
          }
          className="text-sm t-subtle active:opacity-70"
        >
          📚 チャンク詳細（{phrase.en}）を見る →
        </button>
        <button
          onClick={() => navigate(`/chat?focus=${phrase.id}&example=${ref.index}`)}
          className="btn-primary px-5 py-2.5 text-sm font-medium"
        >
          💬 この例文で会話練習
        </button>
      </div>

      <StepNav
        onPrev={() => setPos((p) => Math.max(0, p - 1))}
        onNext={() => setPos((p) => Math.min(items.length - 1, p + 1))}
        canPrev={pos > 0}
        canNext={pos < items.length - 1}
      />

      {/* 片手で押せるよう、終了は画面下部に置く。 */}
      <button
        onClick={() => navigate(backTo)}
        className="mt-2 w-full py-2 text-center text-sm t-subtle active:opacity-80"
      >
        ← 一覧へ
      </button>
    </div>
  )
}
