import { useEffect, useState, type ReactNode } from 'react'
import { speak, stopSpeaking } from '../lib/tts'
import { useSettings } from '../store/useSettings'

export interface ReproItem {
  en: string
  ja: string
}

// 英文を読み終えてから次の項目（日本語訳）へ進むまでの間。
const GAP_NEXT = 2000

/**
 * 再現練習カード（フレーズ再生・瞬間英作文で共有）。
 * 日本語訳を表示・再生 → タッチ → その項目の英文を表示・再生 → 2秒後に
 * 自動で次の項目の日本語訳へ。英文はタッチするまで非表示。
 * `items` の identity が変わると先頭の項目から再開する。
 */
export default function ReproCard({
  items,
  meta,
  accentClass = 'text-violet-600 dark:text-violet-400',
}: {
  items: ReproItem[]
  /** カード上部に表示する補足（メタ情報チップなど）。 */
  meta?: ReactNode
  /** 公開した英文の文字色。画面テーマに合わせる。 */
  accentClass?: string
}) {
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.rate)
  const [st, setSt] = useState<{ idx: number; revealed: boolean }>({ idx: 0, revealed: false })

  // 対象項目が変わったら先頭から再開。
  useEffect(() => {
    setSt({ idx: 0, revealed: false })
  }, [items])

  // 音声ドライバ: 未公開→和訳を読み上げ、公開後→英文を読み上げて
  // 2秒空けてから次の項目（和訳）へ自動で進む。タッチは onTap が担う。
  useEffect(() => {
    const it = items[st.idx]
    if (!it) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const toNext = () => {
      timer = setTimeout(() => {
        if (!cancelled) {
          setSt((s) => (s.idx + 1 < items.length ? { idx: s.idx + 1, revealed: false } : s))
        }
      }, GAP_NEXT)
    }
    stopSpeaking()
    if (!st.revealed) {
      if (it.ja) speak(it.ja, { voiceURI, rate, lang: 'ja-JP' })
    } else {
      speak(it.en, { voiceURI, rate, lang: 'en-US', onEnd: toNext, onError: toNext })
    }
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      stopSpeaking()
    }
  }, [st.idx, st.revealed, items, voiceURI, rate])

  if (!items.length) return null
  const it = items[st.idx]

  // 未公開→英文を公開、公開済み→次の項目へ即送り。
  const onTap = () => {
    if (!st.revealed) setSt((s) => ({ ...s, revealed: true }))
    else setSt((s) => (s.idx + 1 < items.length ? { idx: s.idx + 1, revealed: false } : s))
  }

  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl bg-white p-6 text-center shadow-sm active:opacity-90 dark:bg-slate-900"
    >
      <p className="text-xs text-slate-400">
        {st.idx + 1} / {items.length}
      </p>
      {meta}
      <p className="mt-3 text-lg font-medium leading-relaxed text-slate-700 dark:text-slate-200">
        {it.ja}
      </p>
      {st.revealed ? (
        <p
          className={`mt-4 border-t border-slate-100 pt-4 text-xl font-bold leading-relaxed dark:border-slate-800 ${accentClass}`}
        >
          {it.en}
        </p>
      ) : (
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-400 dark:border-slate-800">
          タッチして英文を表示 👆
        </p>
      )}
    </button>
  )
}
