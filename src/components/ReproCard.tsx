import { useEffect, useRef, useState, type ReactNode } from 'react'
import { speak, stopSpeaking } from '../lib/tts'
import { useSettings } from '../store/useSettings'
import { useSpokenWordTracker } from '../hooks/useSpokenWordTracker'
import type { Phrase } from '../types'
import KanaLine from './KanaLine'
import SpokenText from './SpokenText'

export interface ReproItem {
  en: string
  ja: string
  kana?: string // シラブル音節カナ（任意）
}

/**
 * 瞬間英作文の練習列: チャンク → 例文1 → 例文2 …。
 * 日本語訳のない例文は出題できないため飛ばす（和訳は元データ側で用意する前提）。
 */
export function chunkAndExampleItems(p: Phrase): ReproItem[] {
  const items: ReproItem[] = [{ en: p.en, ja: p.ja, kana: p.kana }]
  for (const ex of p.examples) {
    if (ex.en && ex.ja) items.push({ en: ex.en, ja: ex.ja, kana: ex.kana })
  }
  return items
}

/**
 * 再現練習カード（フレーズ再生・瞬間英作文で共有）。
 * 日本語訳を表示・再生 → タッチ → その項目の英文を表示・再生 → タッチ →
 * 次の項目の日本語訳へ。各ステップはタッチで進み、自動では遷移しない。
 * 英文はタッチするまで非表示。
 * `items` の identity が変わると先頭の項目から再開する。
 */
export default function ReproCard({
  items,
  meta,
  accentClass = 'text-violet-600 dark:text-violet-400',
  onStep,
}: {
  items: ReproItem[]
  /** カード上部に表示する補足（メタ情報チップなど）。 */
  meta?: ReactNode
  /** 公開した英文の文字色。画面テーマに合わせる。 */
  accentClass?: string
  /** 進行状態（現在の項目・英文公開済みか）の変化を親へ通知する。 */
  onStep?: (st: { idx: number; revealed: boolean }) => void
}) {
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.rate)
  const [st, setSt] = useState<{ idx: number; revealed: boolean }>({ idx: 0, revealed: false })

  // 通知は ref 経由にして、親の再レンダーでコールバックの identity が変わっても
  // 効果が再実行されない（無限ループしない）ようにする。
  const onStepRef = useRef(onStep)
  onStepRef.current = onStep
  useEffect(() => {
    onStepRef.current?.(st)
  }, [st])

  // 対象項目が変わったら先頭から再開。
  useEffect(() => {
    setSt({ idx: 0, revealed: false })
  }, [items])

  // 開示した英文の読み上げ位置をカラオケ式にハイライトする。
  const tracker = useSpokenWordTracker()

  // 英文を読み上げつつ単語ハイライトを追跡する（🔊もう一度でも使う）。
  const speakEn = (en: string) => {
    tracker.start(en, rate)
    speak(en, {
      voiceURI,
      rate,
      lang: 'en-US',
      onBoundary: tracker.onBoundary,
      onEnd: tracker.stop,
      onError: tracker.stop,
    })
  }

  // 音声ドライバ: 未公開→和訳を読み上げ、公開後→英文を読み上げる。
  // 次の項目への遷移は自動では行わず、タッチ（onTap）でのみ進む。
  useEffect(() => {
    const it = items[st.idx]
    if (!it) return
    stopSpeaking()
    tracker.stop()
    if (!st.revealed) {
      if (it.ja) speak(it.ja, { voiceURI, rate, lang: 'ja-JP' })
    } else {
      if (it.en) speakEn(it.en)
    }
    return () => {
      stopSpeaking()
      tracker.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.idx, st.revealed, items, voiceURI, rate])

  if (!items.length) return null
  const it = items[st.idx]

  // 未公開→英文を公開、公開済み→次の項目へ即送り。
  const onTap = () => {
    if (!st.revealed) setSt((s) => ({ ...s, revealed: true }))
    else setSt((s) => (s.idx + 1 < items.length ? { idx: s.idx + 1, revealed: false } : s))
  }

  // 再生ボタンを内側に置くため、外側はボタンではなく div のタッチ領域にする
  // （button の入れ子は不可）。🔊 のタッチはカード送りに伝播させない。
  return (
    <div
      onClick={onTap}
      className="w-full cursor-pointer select-none rounded-2xl bg-white p-6 text-center shadow-sm active:opacity-90 dark:bg-slate-900"
    >
      <p className="text-xs text-slate-400">
        {st.idx + 1} / {items.length}
      </p>
      {meta}
      <p className="mt-3 text-lg font-medium leading-relaxed text-slate-700 dark:text-slate-200">
        {it.ja}
      </p>
      {st.revealed ? (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className={`text-xl font-bold leading-relaxed ${accentClass}`}>
            <SpokenText text={it.en} current={tracker.current} />
          </p>
          <KanaLine kana={it.kana} />
          <button
            onClick={(e) => {
              e.stopPropagation()
              stopSpeaking()
              if (it.en) speakEn(it.en)
            }}
            className="mt-3 rounded-full bg-sky-100 px-4 py-2 text-sm font-medium text-sky-600 active:scale-95 dark:bg-sky-900/40 dark:text-sky-400"
          >
            🔊 もう一度
          </button>
        </div>
      ) : (
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-400 dark:border-slate-800">
          タッチして英文を表示 👆
        </p>
      )}
    </div>
  )
}
