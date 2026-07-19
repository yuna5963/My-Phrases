import { useSettings } from '../store/useSettings'

/**
 * カナ文字列を描画用ノードに変換する。
 * 「*…*」で囲まれた部分は強勢（ストレス）として太字＋濃色で表示する。
 * 例: "アイ ス・*ティ*‿ラ ヴァ *ヘッ*・デイク" → ティ / ヘッ を強調。
 * アスタリスク自体は表示しない（区切りとして消費する）。
 */
function renderKana(kana: string) {
  return kana.split('*').map((seg, i) =>
    i % 2 === 1 ? (
      <strong
        key={i}
        className="font-semibold t-muted"
      >
        {seg}
      </strong>
    ) : (
      <span key={i}>{seg}</span>
    ),
  )
}

/**
 * 英文の下に添えるシラブル音節カナの小さな1行。
 * 設定の「カナ表示」がOFF、またはカナ未入力のときは何も描画しない。
 * 英文側のスタイルは各画面に任せ、ここはカナ行だけを担う（最小侵襲）。
 */
export default function KanaLine({
  kana,
  className,
}: {
  kana?: string
  className?: string
}) {
  const showKana = useSettings((s) => s.showKana)
  if (!showKana || !kana) return null
  return (
    <p className={`mt-0.5 text-xs leading-snug t-subtle ${className ?? ''}`}>
      {renderKana(kana)}
    </p>
  )
}
