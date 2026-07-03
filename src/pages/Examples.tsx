import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { speak } from '../lib/tts'
import { useSettings } from '../store/useSettings'
import { usePhraseFilter } from '../hooks/usePhraseFilter'
import FacetFilters from '../components/FacetFilters'
import type { Phrase } from '../types'

const PAGE_SIZE = 30

/** 一覧に並べる1行＝あるチャンクの1例文（英文＋和訳＋親チャンク情報）。 */
interface ExampleRow {
  key: string
  phraseId: string
  index: number // 例文1..5 の番号（表示用）
  en: string
  ja: string
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
        chunkEn: p.en,
      })
    })
  }
  return rows
}

/**
 * 例文一覧。チャンク一覧と同じ上部フィルタを流用し、各チャンクの例文1〜5を
 * すべて平坦に並べる。件数が多いのでページング表示。行をタッチすると親チャンクの
 * フレーズ再生（PhraseDetail）へ遷移する。
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
  // 親チャンクのフレーズ再生で前後送りできるよう、絞り込み後の id 列を渡す。
  const ids = useMemo(() => filtered.map((p) => p.id), [filtered])

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">例文一覧</h1>

      <FacetFilters filter={filter} />

      <p className="text-xs text-slate-400">{rows.length} 件</p>

      <ul className="space-y-2">
        {pageRows.map((r) => (
          <li
            key={r.key}
            className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900"
          >
            <button
              onClick={() =>
                navigate(`/chunk/${r.phraseId}`, {
                  state: { ids, backTo: '/examples' },
                })
              }
              className="min-w-0 flex-1 text-left active:opacity-70"
            >
              <p className="font-medium leading-relaxed">{r.en}</p>
              {r.ja && <p className="mt-0.5 text-sm text-slate-500">{r.ja}</p>}
              <p className="mt-1 truncate text-xs text-slate-400">
                例文{r.index}・{r.chunkEn}
              </p>
            </button>
            <button
              onClick={() => speak(r.en, { voiceURI, rate })}
              className="shrink-0 rounded-full bg-sky-100 px-3 py-2 text-sky-600 active:scale-95 dark:bg-sky-900/40 dark:text-sky-400"
            >
              🔊
            </button>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">
          該当する例文がありません
        </p>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={() => setPage((n) => Math.max(0, n - 1))}
            disabled={page === 0}
            className="rounded-full bg-slate-200 px-5 py-2 text-sm font-medium text-slate-600 active:scale-95 disabled:opacity-40 disabled:active:scale-100 dark:bg-slate-800 dark:text-slate-300"
          >
            ← 前
          </button>
          <span className="text-sm text-slate-400">
            {page + 1} / {pageCount}
          </span>
          <button
            onClick={() => setPage((n) => Math.min(pageCount - 1, n + 1))}
            disabled={page >= pageCount - 1}
            className="rounded-full bg-slate-200 px-5 py-2 text-sm font-medium text-slate-600 active:scale-95 disabled:opacity-40 disabled:active:scale-100 dark:bg-slate-800 dark:text-slate-300"
          >
            次 →
          </button>
        </div>
      )}
    </div>
  )
}
