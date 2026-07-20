import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'

/**
 * Sentence Engine の内蔵デッキ（構文16・意味ノード50）を1タップで取り込むためのロジック。
 * 取り込み後は渡された `restart` を呼んで useSession のキューを組み直し、
 * そのまま出題が始まるようにする（addPhrases → デッキ更新 → 次レンダーで restart）。
 *
 * restart は毎レンダーで identity が変わるため ref 経由で最新を参照し、
 * 取り込み完了フラグ（pending）を立てた次のレンダーで一度だけ呼ぶ。
 */
export function useSeedDeck(restart: () => void) {
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const pending = useRef(false)
  const restartRef = useRef(restart)
  restartRef.current = restart

  useEffect(() => {
    if (pending.current) {
      pending.current = false
      restartRef.current()
    }
  })

  const addSeed = async () => {
    setSeeding(true)
    setSeedError(null)
    try {
      await useDeck.getState().importBuiltinSentenceEngine()
      pending.current = true
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : String(e))
    } finally {
      setSeeding(false)
    }
  }

  return { addSeed, seeding, seedError }
}

/**
 * 構文/意味ノードのデッキが空のときに出す共通の空表示。
 * 「内蔵デッキを追加」ボタンで seed 教材を取り込む。ロード中・失敗を表示する。
 */
export default function SeedDeckEmpty({
  title,
  onAdd,
  seeding,
  seedError,
}: {
  /** 「まだ〜デッキがありません」の見出し。 */
  title: string
  onAdd: () => void
  seeding: boolean
  seedError: string | null
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center gap-4 pt-20 text-center">
      <p className="t-muted">{title}</p>
      <button
        onClick={onAdd}
        disabled={seeding}
        className="btn-primary px-5 py-3 font-medium disabled:opacity-60"
      >
        {seeding ? '追加中…' : '📦 内蔵デッキを追加（構文16・意味ノード50）'}
      </button>
      {seedError && (
        <p className="text-sm text-carbon-error">追加に失敗しました: {seedError}</p>
      )}
      <button onClick={() => navigate('/')} className="link text-sm">
        ホームへ戻る
      </button>
    </div>
  )
}
