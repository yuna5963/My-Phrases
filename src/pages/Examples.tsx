import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { speak } from '../lib/tts'
import { useSettings } from '../store/useSettings'
import { usePhraseFilter } from '../hooks/usePhraseFilter'
import FacetFilters from '../components/FacetFilters'
import Pager from '../components/Pager'
import KanaLine from '../components/KanaLine'
import type { Phrase } from '../types'

const PAGE_SIZE = 100

/** 一覧に並べる1行＝あるチャンクの1例文（英文＋カナ＋和訳＋親チャンク情報）。 */
interface ExampleRow {
  key: string
  phraseId: string
  index: number // 例文1..5 の番号（表示用）
  en: string
  ja: string
  kana?: string // シラブル音節カナ（任意）
  chunkEn: string
}

/** フィルタ済みチャンクを例文1〜5に展開し、空の例文は除外する。 */
function flattenExamples(phrases: Phrase[]): ExampleRow[] {
  const rows: ExampleRow[] = []
  for (const p of phrases) {
    p.examples.forEach((ex, i) => {
      if (!ex.en) return
      rows.push({
        key: `${p.id}-${i}`,
        phraseId: p.id,
        index: i + 1,
        en: ex.en,
        ja: ex.ja,
        kana: ex.kana,
        chunkEn: p.en,
      })
    })
  }
  return rows
}

/**
 * 例文一覧。チャンク一覧と同じ上部フィルタを流用し、各チャンクの例文1〜5を
 * すべて平坦に並べる。件数が多いのでページング表示。行をタッチすると
 * その例文の**例文カード**（ExampleDetail: 日本語→タッチ→英文＋Word Spark）へ遷移する。
 */
export default function Examples() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.rate)

  const filter = usePhraseFilter(phrases)
  const { filtered } = filter

  const rows = useMemo(() => flattenExamples(filtered), [filtered])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))

  const [page, setPage] = useState(0)
  // フィルタが変わったら先頭ページに戻す（結果は上から見たいので）。
  useEffect(() => {
    setPage(0)
  }, [rows])

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  // 例文カードで前後送りできるよう、絞り込み後の例文参照列（全ページ分）を渡す。
  const itemRefs = useMemo(
    () => rows.map((r) => ({ phraseId: r.phraseId, index: r.index - 1 })),
    [rows],
  )

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">例文一覧</h1>

      <FacetFilters filter={filter} />

      <p className="text-xs t-subtle">{rows.length} 件</p>

      <ul className="space-y-2">
        {pageRows.map((r) => (
          <li
            key={r.key}
            className="tile flex items-center gap-2 p-3"
          >
            <button
              onClick={() =>
                navigate(`/example/${r.phraseId}/${r.index - 1}`, {
                  state: { items: itemRefs, backTo: '/examples' },
                })
              }
              className="min-w-0 flex-1 text-left active:opacity-70"
            >
              <p className="font-medium leading-relaxed">{r.en}</p>
              <KanaLine kana={r.kana} />
              {r.ja && <p className="mt-0.5 text-sm t-muted">{r.ja}</p>}
              <p className="mt-1 truncate text-xs t-subtle">
                例文{r.index}・{r.chunkEn}
              </p>
            </button>
            <button
              onClick={() => speak(r.en, { voiceURI, rate })}
              className="btn-tertiary shrink-0 px-3 py-2"
            >
              🔊
            </button>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="py-10 text-center text-sm t-subtle">
          該当する例文がありません
        </p>
      )}

      <Pager
        page={page}
        pageCount={pageCount}
        onPrev={() => setPage((n) => Math.max(0, n - 1))}
        onNext={() => setPage((n) => Math.min(pageCount - 1, n + 1))}
      />
    </div>
  )
}
