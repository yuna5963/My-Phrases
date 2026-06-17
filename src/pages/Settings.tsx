import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ALL_STATUSES, useSettings } from '../store/useSettings'
import { useDeck } from '../store/useDeck'
import {
  getEnglishVoices,
  getVoiceStatus,
  loadVoices,
  resolveVoice,
  speak,
} from '../lib/tts'

export default function Settings() {
  const s = useSettings()
  const reset = useDeck((d) => d.reset)
  const importFiles = useDeck((d) => d.importFiles)
  const clearImported = useDeck((d) => d.clearImported)
  const source = useDeck((d) => d.source)
  const phraseCount = useDeck((d) => d.phrases.length)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState(getVoiceStatus())
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadVoices().then(() => {
      setVoices(getEnglishVoices())
      setVoiceStatus(getVoiceStatus())
    })
  }, [])

  const runTest = () => {
    const v = resolveVoice(s.voiceURI)
    const vinfo = v
      ? `${v.name}（${v.localService ? '端末内' : 'オンライン'}）`
      : '英語音声なし'
    setTestMsg({ ok: true, text: `再生中… 使用音声: ${vinfo}` })
    let started = false
    speak('Hello, this is a test.', {
      voiceURI: s.voiceURI,
      rate: s.rate,
      onStart: () => {
        started = true
        setTestMsg({ ok: true, text: `✓ 再生されました / 音声: ${vinfo}（音量も確認）` })
      },
      onEnd: () => {
        if (!started) setTestMsg({ ok: false, text: '⚠ 再生イベントが発生しませんでした' })
      },
      onError: (m) => setTestMsg({ ok: false, text: `⚠ エラー: ${m} / 音声: ${vinfo}` }),
    })
    // If nothing fired at all, the engine is likely missing/silent.
    setTimeout(() => {
      if (!started) {
        setTestMsg({
          ok: false,
          text:
            voiceStatus.english === 0
              ? '⚠ 英語の音声データが見つかりません。端末設定で英語の読み上げを追加してください'
              : '⚠ 音が出ない場合はメディア音量・マナーモードを確認してください',
        })
      }
    }, 1500)
  }

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setImportMsg(null)
    try {
      const n = await importFiles(Array.from(files))
      setImportMsg({ ok: true, text: `${n}件のフレーズを取り込みました。` })
    } catch (e) {
      setImportMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">設定</h1>

      <Section title="音声（TTS）">
        <Row label="読み上げ音声">
          <select
            value={s.voiceURI ?? ''}
            onChange={(e) => s.setVoiceURI(e.target.value || null)}
            className="max-w-[60%] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">自動（端末内を優先）</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}){v.localService ? ' ・端末内' : ' ・オンライン'}
              </option>
            ))}
          </select>
        </Row>
        <Row label={`再生速度 ${s.rate.toFixed(1)}x`}>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.1}
            value={s.rate}
            onChange={(e) => s.setRate(Number(e.target.value))}
            onMouseUp={() => speak('This is a test.', { voiceURI: s.voiceURI, rate: s.rate })}
          />
        </Row>
        <Row label="解答時に自動で読み上げ">
          <Toggle checked={s.autoPlay} onChange={s.setAutoPlay} />
        </Row>
        <button
          onClick={runTest}
          className="w-full rounded-xl bg-sky-500 px-4 py-2.5 font-medium text-white"
        >
          🔊 テスト再生
        </button>
        {testMsg && (
          <p className={`text-sm ${testMsg.ok ? 'text-emerald-500' : 'text-rose-500'}`}>
            {testMsg.text}
          </p>
        )}
        <p className="text-xs text-slate-400">
          診断: 読み上げ {voiceStatus.supported ? '対応' : '非対応'} / 英語の音声{' '}
          {voiceStatus.english}個 / 全{voiceStatus.total}個
        </p>
        <details className="text-sm text-slate-500">
          <summary className="cursor-pointer">音が出ないとき（Android）</summary>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>
              <strong>メディア音量</strong>を上げる（着信音量とは別。動画など他の音が鳴るか確認）／マナーモード解除
            </li>
            <li>
              上の診断で「英語の音声 0個」の場合は、端末の
              <strong>設定 → システム → 言語と入力 → テキスト読み上げ（音声出力）</strong>
              で英語（English）の音声データをインストール
            </li>
            <li>Google テキスト読み上げエンジンが有効か確認（無効なら有効化）</li>
            <li>
              テスト再生で音声が「オンライン」と出てオフライン時に鳴らない場合は、上の「読み上げ音声」で
              <strong>「端末内」</strong>と付いた音声を選ぶ（または英語の音声データを端末にインストール）
            </li>
            <li>まず「テスト再生」など<strong>ボタンをタップ</strong>してから練習する</li>
          </ul>
        </details>
      </Section>

      <Section title="セッション">
        <Row label={`1回の出題数 ${s.sessionSize}枚`}>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={s.sessionSize}
            onChange={(e) => s.setSessionSize(Number(e.target.value))}
          />
        </Row>
        <div>
          <p className="mb-2 text-sm text-slate-500">練習対象のステータス</p>
          <div className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((st) => (
              <button
                key={st}
                onClick={() => s.toggleStatus(st)}
                className={`rounded-full px-4 py-1.5 text-sm ${
                  s.includeStatuses.includes(st)
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="フレーズの取り込み">
        <p className="text-sm text-slate-500">
          現在のデータ:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {source === 'imported' ? '取り込み済み' : 'サンプル'} / {phraseCount}件
          </span>
        </p>
        <ol className="ml-4 list-decimal space-y-1 text-sm text-slate-500">
          <li>Notionでフレーズ集DBを開き「•••」→ エクスポート</li>
          <li>形式は「Markdown &amp; CSV」を選択してダウンロード</li>
          <li>下のボタンでその <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">.zip</code> をそのまま選択（解凍不要）</li>
        </ol>

        <input
          ref={fileRef}
          type="file"
          accept=".zip,.csv,.md,.markdown,.txt"
          multiple
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl bg-sky-500 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? '取り込み中…' : '📥 エクスポートファイルを選択'}
        </button>

        {importMsg && (
          <p className={`text-sm ${importMsg.ok ? 'text-emerald-500' : 'text-rose-500'}`}>
            {importMsg.text}
          </p>
        )}

        {source === 'imported' && (
          <button
            onClick={() => {
              if (confirm('取り込んだフレーズを消去してサンプルに戻します。よろしいですか？（学習進捗は残ります）')) {
                clearImported()
              }
            }}
            className="text-sm text-slate-400 underline"
          >
            取り込みデータを消去してサンプルに戻す
          </button>
        )}
      </Section>

      <Section title="データ">
        <button
          onClick={() => {
            if (confirm('学習の進捗（ボックス・連続日数）をすべて消去します。よろしいですか？')) {
              reset()
            }
          }}
          className="rounded-xl border border-rose-300 px-4 py-2 text-sm text-rose-500 dark:border-rose-800"
        >
          学習進捗をリセット
        </button>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${
        checked ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
