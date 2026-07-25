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
  accentClass = 'text-carbon-blue dark:text-carbon-blue-40',
  onStep,
  speakJa = true,
  revealNote,
  commitGate = false,
  onPredict,
}: {
  items: ReproItem[]
  /** カード上部に表示する補足（メタ情報チップなど）。 */
  meta?: ReactNode
  /** 公開した英文の文字色。画面テーマに合わせる。 */
  accentClass?: string
  /** 進行状態（現在の項目・英文公開済みか）の変化を親へ通知する。 */
  onStep?: (st: { idx: number; revealed: boolean }) => void
  /** 和訳面を TTS で読み上げるか（既定 true）。意味ノードは日本語を読まないので false。 */
  speakJa?: boolean
  /** 開示面の英文の下に小さく表示する注記（例: 参考出力の断り書き）。未指定なら非表示。 */
  revealNote?: string
  /**
   * 開示前に「言える／あやしい」の申告を挟む（検索コミットゲート）。
   * ONのときカード全体のタップでは開示できず、2択のどちらかを押して初めて英文が出る。
   * 声に出す前に答えを見てしまうと、自己採点が後知恵バイアスで甘くなるため。
   */
  commitGate?: boolean
  /** 開示前の申告を親へ通知する（採点ログに残して過信の度合いを測る）。 */
  onPredict?: (p: 'can' | 'unsure') => void
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

  // 開示した英文の読み上げ位置を Word Spark ハイライトする。
  const tracker = useSpokenWordTracker()
  // 再生し直し時、キャンセルされた旧発話の onEnd/onError が
  // 新しいハイライトを消さないよう、世代トークンで判別する。
  const playSeq = useRef(0)

  // 英文を読み上げつつ単語ハイライトを追跡する（🔊もう一度でも使う）。
  const speakEn = (en: string) => {
    const id = ++playSeq.current
    tracker.start(en, rate)
    const done = () => {
      if (playSeq.current === id) tracker.stop()
    }
    speak(en, {
      voiceURI,
      rate,
      lang: 'en-US',
      onBoundary: tracker.onBoundary,
      onStart: tracker.onStart,
      onEnd: () => {
        tracker.onEnd()
        done()
      },
      onError: done,
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
      if (it.ja && speakJa) speak(it.ja, { voiceURI, rate, lang: 'ja-JP' })
    } else {
      if (it.en) speakEn(it.en)
    }
    return () => {
      stopSpeaking()
      tracker.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.idx, st.revealed, items, voiceURI, rate, speakJa])

  if (!items.length) return null
  const it = items[st.idx]

  // 未公開→英文を公開、公開済み→次の項目へ即送り。
  // コミットゲートON時は、未公開のタップでは開示しない（2択を押させる）。
  const onTap = () => {
    if (!st.revealed) {
      if (commitGate) return
      setSt((s) => ({ ...s, revealed: true }))
    } else setSt((s) => (s.idx + 1 < items.length ? { idx: s.idx + 1, revealed: false } : s))
  }

  // 申告と開示を1タップにまとめる（宣言してから見る、を最短の操作で成立させる）。
  const predictAndReveal = (p: 'can' | 'unsure') => {
    onPredict?.(p)
    setSt((s) => ({ ...s, revealed: true }))
  }

  // 再生ボタンを内側に置くため、外側はボタンではなく div のタッチ領域にする
  // （button の入れ子は不可）。🔊 のタッチはカード送りに伝播させない。
  return (
    <div
      onClick={onTap}
      className="tile w-full cursor-pointer select-none p-6 text-center active:opacity-90"
    >
      <p className="t-subtle text-xs">
        {st.idx + 1} / {items.length}
      </p>
      {meta}
      <p className="mt-3 whitespace-pre-line text-lg font-medium leading-relaxed">{it.ja}</p>
      {st.revealed ? (
        <div className="mt-4 border-t border-carbon-hairline pt-4 dark:border-carbon-line-dark">
          <p className={`whitespace-pre-line text-xl font-semibold leading-relaxed ${accentClass}`}>
            <SpokenText text={it.en} current={tracker.current} />
          </p>
          <KanaLine kana={it.kana} />
          {revealNote && <p className="t-subtle mt-2 text-xs">{revealNote}</p>}
          <button
            onClick={(e) => {
              e.stopPropagation()
              stopSpeaking()
              if (it.en) speakEn(it.en)
            }}
            className="btn-tertiary mt-3 px-4 py-2 text-sm font-medium"
          >
            🔊 もう一度
          </button>
        </div>
      ) : commitGate ? (
        <div className="mt-4 border-t border-carbon-hairline pt-4 dark:border-carbon-line-dark">
          <p className="t-subtle text-sm">声に出してから、どちらかを選ぶ 👇</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                predictAndReveal('can')
              }}
              className="btn-tertiary flex-1 py-3 text-sm font-medium"
            >
              ◯ 言えた
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                predictAndReveal('unsure')
              }}
              className="btn-tertiary flex-1 py-3 text-sm font-medium"
            >
              △ あやしい
            </button>
          </div>
        </div>
      ) : (
        <p className="t-subtle mt-4 border-t border-carbon-hairline pt-4 text-sm dark:border-carbon-line-dark">
          タッチして英文を表示 👆
        </p>
      )}
    </div>
  )
}
