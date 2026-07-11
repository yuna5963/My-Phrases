import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStock } from '../store/useStock'
import { csvFilename, stockToCsv } from '../lib/export'
import { shareOrDownloadCsv } from '../lib/share'

/**
 * 表現ストック: チャット練習のまとめでチェックした「追加候補の表現」の一覧。
 * 数日分ためて PC でまとめて例文作成 → Notion に追加する運用のための画面。
 * コピーはタブ区切り（en TAB ja）なので、表計算や Notion のテーブルにそのまま貼れる。
 */
export default function ExpressionStock() {
  const navigate = useNavigate()
  const items = useStock((s) => s.items)
  const remove = useStock((s) => s.remove)
  const clear = useStock((s) => s.clear)
  const [copied, setCopied] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  const tsv = items.map((i) => `${i.en}\t${i.ja}`).join('\n')
  const mailBody = items.map((i) => `${i.en}${i.ja ? ` — ${i.ja}` : ''}`).join('\n')

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(tsv)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const shareCsv = async () => {
    setShareMsg(null)
    const outcome = await shareOrDownloadCsv(csvFilename('stock'), stockToCsv(items))
    if (outcome === 'shared') setShareMsg('✓ 共有しました。')
    else if (outcome === 'downloaded') setShareMsg('✓ CSVをダウンロードしました。')
  }

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">📥 表現ストック</h1>
        <span className="text-sm text-slate-500">{items.length}件</span>
      </header>
      <p className="text-sm text-slate-500">
        チャット練習のまとめでチェックした表現の置き場です。数日分たまったら PC
        でコピーして、例文を作って Notion に追加しましょう。
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm dark:bg-slate-900">
          <p>まだ何もありません。</p>
          <p className="mt-1">
            チャット練習の終了まとめで「➕ 追加すると良さそうな表現」にチェックすると、ここにたまります。
          </p>
          <button onClick={() => navigate('/chat')} className="mt-4 font-medium text-sky-500">
            💬 チャット練習へ →
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyAll}
              className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white active:scale-[0.99]"
            >
              {copied ? '✓ コピーしました' : '📋 全てコピー'}
            </button>
            <a
              href={`mailto:?subject=${encodeURIComponent('表現ストック')}&body=${encodeURIComponent(mailBody)}`}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300 active:scale-[0.99]"
            >
              ✉️ メールで送る
            </a>
          </div>
          <button
            onClick={shareCsv}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300 active:scale-[0.99]"
          >
            📤 CSVで共有 / 保存
          </button>
          {shareMsg && <p className="text-sm text-emerald-500">{shareMsg}</p>}
          <p className="text-xs text-slate-400">
            コピーはタブ区切りなので、表計算や Notion のテーブルにそのまま貼り付けられます。CSVは共有シートからメールや Drive に送れます。
          </p>

          <ul className="space-y-2">
            {items.map((i) => (
              <li
                key={i.en}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.en}</p>
                  {i.ja && <p className="text-sm text-slate-500">{i.ja}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">{i.addedAt}</p>
                </div>
                <button
                  onClick={() => remove(i.en)}
                  aria-label={`${i.en} を削除`}
                  className="shrink-0 rounded-full px-2 py-1 text-slate-400 active:scale-95"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={() => {
              if (confirm('ストックを空にします（Notionへ追加し終えたら）。よろしいですか？')) clear()
            }}
            className="text-sm text-slate-400 underline"
          >
            全て削除（追加し終えたら）
          </button>
        </>
      )}
    </div>
  )
}
