import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { stockKey, useStock } from '../store/useStock'
import { csvFilename, stockToCsv } from '../lib/export'
import { shareOrDownloadCsv } from '../lib/share'
import FormField from '../components/FormField'

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
    else if (outcome === 'saved') setShareMsg('✓ スマホの Documents フォルダに保存しました。')
    else if (outcome === 'failed') setShareMsg('⚠ 保存に失敗しました。もう一度お試しください。')
  }

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">📥 表現ストック</h1>
        <span className="text-sm text-slate-500">{items.length}件</span>
      </header>
      <p className="text-sm text-slate-500">
        チャット練習のまとめでチェックした表現や、自分で思いついた表現の置き場です。
        たまったら「教材化」でそのままデッキに追加できます。
      </p>

      <ManualAdd />

      {items.length > 0 && (
        <button
          onClick={() => navigate('/stock/enrich')}
          className="w-full rounded-2xl bg-violet-500 py-4 font-medium text-white active:scale-95"
        >
          ✨ 教材化する（AIが訳・例文・カナを補完）
        </button>
      )}

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

/**
 * 自分で思いついた表現の手動追加。英語だけでもよく（訳は教材化のAIが補完）、
 * 例文まで自分で書きたいときのためにチャンク追加フォームへの導線も置く。
 */
function ManualAdd() {
  const items = useStock((s) => s.items)
  const add = useStock((s) => s.add)
  const [open, setOpen] = useState(false)
  const [en, setEn] = useState('')
  const [ja, setJa] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 active:scale-[0.99] dark:border-slate-700 dark:text-slate-400"
      >
        ✍️ 自分で追加（思いついた表現をメモ）
      </button>
    )
  }

  const submit = () => {
    const trimmedEn = en.trim()
    if (!trimmedEn) return
    if (items.some((i) => stockKey(i.en) === stockKey(trimmedEn))) {
      setMsg('⚠ その表現は既にストックにあります')
      return
    }
    add({ en: trimmedEn, ja: ja.trim() })
    setEn('')
    setJa('')
    setMsg('✓ ストックに追加しました。続けて入力できます')
  }

  return (
    <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">✍️ 自分で追加</h2>
        <button
          onClick={() => {
            setOpen(false)
            setMsg(null)
          }}
          className="text-xs text-slate-400 underline"
        >
          閉じる
        </button>
      </div>
      <FormField
        label="英語（必須）"
        value={en}
        onChange={(v) => {
          setMsg(null)
          setEn(v)
        }}
        placeholder="I'll get back to you."
      />
      <FormField
        label="日本語（空欄なら教材化のAIが補完）"
        value={ja}
        onChange={(v) => {
          setMsg(null)
          setJa(v)
        }}
        placeholder="あとで折り返すね"
      />
      <button
        onClick={submit}
        disabled={!en.trim()}
        className="w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.99]"
      >
        📥 ストックに追加
      </button>
      {msg && (
        <p className={`text-sm ${msg.startsWith('✓') ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-400'}`}>
          {msg}
        </p>
      )}
      <p className="text-xs text-slate-400">
        例文やカナまで自分で書きたいときは{' '}
        <Link to="/chunk/new" className="font-medium text-sky-500 underline">
          チャンクを直接追加 →
        </Link>
      </p>
    </div>
  )
}
