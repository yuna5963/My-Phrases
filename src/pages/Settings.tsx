import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ALL_STATUSES, useSettings } from '../store/useSettings'
import { useDeck } from '../store/useDeck'
import { isNativeApp } from '../lib/platform'
import { useStock } from '../store/useStock'
import {
  getEnglishVoices,
  getVoiceStatus,
  loadVoices,
  resolveVoice,
  speak,
  type TtsVoice,
} from '../lib/tts'
import { csvFilename, phrasesToCsv } from '../lib/export'
import { excludeSentenceEngine, isSentenceEngine } from '../lib/sentenceEngine'
import { shareOrDownloadCsv, shareOrDownloadText } from '../lib/share'
import {
  backupFilename,
  collectBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from '../lib/backup'
import UsageBadge from '../components/UsageBadge'

/** モデル選択の候補。これ以外は「その他（手入力）」で自由に指定できる。 */
const MODEL_PRESETS = [
  { id: 'gemma-4-31b-it', label: 'Gemma 4（既定・無料枠が広め）' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash（応答が速め）' },
] as const

export default function Settings() {
  const s = useSettings()
  const reset = useDeck((d) => d.reset)
  const importFiles = useDeck((d) => d.importFiles)
  const importSentenceEngine = useDeck((d) => d.importSentenceEngine)
  const importBuiltinSentenceEngine = useDeck((d) => d.importBuiltinSentenceEngine)
  const clearImported = useDeck((d) => d.clearImported)
  const source = useDeck((d) => d.source)
  const phrases = useDeck((d) => d.phrases)
  const phraseCount = phrases.length
  const seCount = phrases.filter(isSentenceEngine).length
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [replaceMode, setReplaceMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const stockCount = useStock((st) => st.items.length)
  // プリセット外のモデル名が保存されている場合は「その他（手入力）」から始める。
  const [customModel, setCustomModel] = useState(
    () => !MODEL_PRESETS.some((m) => m.id === useSettings.getState().chatModel),
  )
  const [voiceStatus, setVoiceStatus] = useState(getVoiceStatus())
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [seImportMsg, setSeImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [seExportMsg, setSeExportMsg] = useState<string | null>(null)
  const [seSeedMsg, setSeSeedMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [seBusy, setSeBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const seFileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)

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
      const r = await importFiles(Array.from(files), replaceMode ? 'replace' : 'merge')
      setImportMsg({
        ok: true,
        text:
          r.mode === 'replace'
            ? `${r.total}件のフレーズを取り込みました（全置換）。`
            : `追加 ${r.added}件・更新 ${r.updated}件（既存 ${r.kept}件は保持）。`,
      })
    } catch (e) {
      setImportMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const exportDeck = async () => {
    setExportMsg(null)
    // Sentence Engine 教材（構文・意味ノード）はチャンクCSVに混ぜない（Notion往復を汚さない）。
    const outcome = await shareOrDownloadCsv(
      csvFilename('deck'),
      phrasesToCsv(excludeSentenceEngine(phrases)),
    )
    if (outcome === 'shared') setExportMsg('✓ 共有しました。')
    else if (outcome === 'downloaded') setExportMsg('✓ CSVをダウンロードしました。')
    else if (outcome === 'saved') setExportMsg('✓ スマホの Documents フォルダに保存しました。')
    else if (outcome === 'failed') setExportMsg('⚠ 保存に失敗しました。もう一度お試しください。')
  }

  const onPickSeFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setSeBusy(true)
    setSeImportMsg(null)
    try {
      const r = await importSentenceEngine(Array.from(files))
      setSeImportMsg({
        ok: true,
        text:
          `✓ 追加 ${r.added}件・更新 ${r.updated}件` +
          (r.rejected > 0 ? `（対象外の行 ${r.rejected}件はスキップ）` : ''),
      })
    } catch (e) {
      setSeImportMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSeBusy(false)
      if (seFileRef.current) seFileRef.current.value = ''
    }
  }

  const exportSentenceEngine = async () => {
    setSeExportMsg(null)
    const outcome = await shareOrDownloadCsv(
      csvFilename('sentence-engine'),
      phrasesToCsv(phrases.filter(isSentenceEngine)),
    )
    if (outcome === 'shared') setSeExportMsg('✓ 共有しました。')
    else if (outcome === 'downloaded') setSeExportMsg('✓ CSVをダウンロードしました。')
    else if (outcome === 'saved') setSeExportMsg('✓ スマホの Documents フォルダに保存しました。')
    else if (outcome === 'failed') setSeExportMsg('⚠ 保存に失敗しました。もう一度お試しください。')
  }

  const addBuiltinSe = async () => {
    setSeBusy(true)
    setSeSeedMsg(null)
    try {
      const r = await importBuiltinSentenceEngine()
      setSeSeedMsg({ ok: true, text: `✓ 追加 ${r.added}件・更新 ${r.updated}件` })
    } catch (e) {
      setSeSeedMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSeBusy(false)
    }
  }

  const exportFullBackup = async () => {
    setBackupMsg(null)
    const deck = useDeck.getState()
    const data = await collectBackup(deck.phrases, deck.progress, deck.streak)
    const outcome = await shareOrDownloadText(
      backupFilename(),
      serializeBackup(data),
      'application/json',
    )
    if (outcome === 'shared') setBackupMsg({ ok: true, text: '✓ バックアップを共有しました。' })
    else if (outcome === 'downloaded')
      setBackupMsg({ ok: true, text: '✓ バックアップをダウンロードしました。' })
    else if (outcome === 'saved')
      setBackupMsg({ ok: true, text: '✓ スマホの Documents フォルダに保存しました。' })
    else if (outcome === 'failed')
      setBackupMsg({ ok: false, text: '⚠ 保存に失敗しました。もう一度お試しください。' })
  }

  const onPickBackup = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBackupMsg(null)
    try {
      const data = parseBackup(await files[0].text())
      if (
        !confirm(
          `バックアップ（教材 ${data.phrases.length}件・進捗 ${data.progress.length}件）で、` +
            'この端末の教材・SRS進捗・ストリークをすべて置き換えます。よろしいですか？',
        )
      )
        return
      const r = await restoreBackup(data)
      await useDeck.getState().load()
      setBackupMsg({
        ok: true,
        text: `✓ 復元しました（教材 ${r.phrases}件・進捗 ${r.progress}件）。APIキーのみ再入力が必要です。`,
      })
    } catch (e) {
      setBackupMsg({ ok: false, text: `⚠ ${(e as Error).message}` })
    } finally {
      if (backupRef.current) backupRef.current.value = ''
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
            className="input max-w-[60%] px-2 py-1.5 text-sm"
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
        <Row label="カナ（音節）を表示">
          <Toggle checked={s.showKana} onChange={s.setShowKana} />
        </Row>
        {isNativeApp ? (
          <p className="text-xs t-subtle">
            🔋 アプリ版では、連続再生・長文音読は<strong>画面を消しても再生が続きます</strong>
            （再生中は通知が表示されます。通知を消すには再生を停止してください）。
          </p>
        ) : (
          <>
            <Row label="🔋 画面オフでも再生を試す（実験的）">
              <Toggle checked={s.bgPlayback} onChange={s.setBgPlayback} />
            </Row>
            {s.bgPlayback && (
              <p className="text-xs t-subtle">
                連続再生・長文音読の間、ほぼ無音の音声を流し続けてブラウザに「音を再生中のタブ」と
                認識させ、画面を消しても読み上げが続くことを狙う実験的な機能です。効果は端末や
                Chrome のバージョンに依存し、うまくいかない場合があります。効かないときは Android の
                設定 → アプリ → Chrome → バッテリーを「制限なし」にすると安定することがあります。
                確実に聞き流したいときは「🌙 暗くして再生」か、スマホアプリ版を使ってください
                （ONの間は通知に再生中のメディアが表示され、電池消費がやや増えます。
                通知の⏸やイヤホンを抜くと再生ごと停止します）。
              </p>
            )}
          </>
        )}
        <button
          onClick={runTest}
          className="btn-primary w-full px-4 py-2.5 font-medium"
        >
          🔊 テスト再生
        </button>
        {testMsg && (
          <p className={`text-sm ${testMsg.ok ? 'text-carbon-success' : 'text-carbon-error'}`}>
            {testMsg.text}
          </p>
        )}
        <p className="text-xs t-subtle">
          診断: 読み上げ {voiceStatus.supported ? '対応' : '非対応'} / 英語の音声{' '}
          {voiceStatus.english}個 / 全{voiceStatus.total}個
        </p>

        {voiceStatus.english === 0 && (
          <div className="rounded-none border-l-4 border-carbon-warning bg-carbon-surface p-3 text-sm dark:bg-carbon-layer">
            <p className="font-medium">英語の読み上げ音声が端末にありません</p>
            <p className="mt-1">
              端末に音声合成エンジンが無いと、どのアプリでも英語を読み上げできません。
              「Google テキスト読み上げ」を入れて英語(US)の音声を追加してください。
            </p>
            <a
              href="https://play.google.com/store/apps/details?id=com.google.android.tts"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-medium underline"
            >
              ▶ Google テキスト読み上げを入手（Playストア）
            </a>
            <ol className="ml-4 mt-2 list-decimal space-y-0.5 text-xs">
              <li>上のアプリをインストール</li>
              <li>
                端末の設定で<strong>「読み上げ」で検索</strong> → テキスト読み上げの出力
                （多くは 設定 → ユーザー補助 の中）
              </li>
              <li>エンジンを「Google テキスト読み上げ」に設定</li>
              <li>歯車 → 音声データをインストール → English (US) をダウンロード</li>
              <li>このアプリを再読み込みして「テスト再生」</li>
            </ol>
          </div>
        )}

        <details className="text-sm t-muted">
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

      {isNativeApp && (
        <Section title="🎤 音声入力">
          <Row label="アプリ内のマイクボタンを使う">
            <Toggle checked={s.inAppMic} onChange={s.setInAppMic} />
          </Row>
          <p className="text-xs t-subtle">
            🎤 意味ノード英語思考で<strong>日本語を音声入力</strong>するときの設定です。Android
            の音声認識は<strong>少し黙ると自動で区切れる</strong>ので、長い文だと途中で切れて
            しまいます。長文を話すときは<strong>テキスト欄をタップしてキーボードのマイクキー</strong>
            を使うほうが快適です（途切れずに続けて入力できます）。この設定をONにすると、
            アプリ内の🎤ボタンも表示できます。
          </p>
        </Section>
      )}

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
          <p className="mb-2 text-sm t-muted">練習対象のステータス</p>
          <div className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((st) => (
              <button
                key={st}
                onClick={() => s.toggleStatus(st)}
                className={`px-4 py-1.5 text-sm ${
 s.includeStatuses.includes(st) ? 'chip-active' : 'chip'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="チャット練習（AI）">
        <p className="text-sm t-muted">
          AIコーチとの英会話練習に使う設定です。Google AI Studio で無料の APIキーを取得して貼り付けてください。
        </p>
        <Row label="APIキー">
          <input
            type="password"
            value={s.chatApiKey}
            onChange={(e) => s.setChatApiKey(e.target.value.trim())}
            placeholder="AIza..."
            autoComplete="off"
            className="input max-w-[60%] px-2 py-1.5 text-sm"
          />
        </Row>
        <Row label="モデル">
          <select
            value={customModel ? '__custom__' : s.chatModel}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomModel(true)
              } else {
                setCustomModel(false)
                s.setChatModel(e.target.value)
              }
            }}
            className="input max-w-[60%] px-2 py-1.5 text-sm"
          >
            {MODEL_PRESETS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="__custom__">その他（手入力）</option>
          </select>
        </Row>
        {customModel && (
          <Row label="モデル名">
            <input
              type="text"
              value={s.chatModel}
              onChange={(e) => s.setChatModel(e.target.value.trim())}
              placeholder="gemma-4-31b-it"
              autoComplete="off"
              className="input max-w-[60%] px-2 py-1.5 text-sm"
            />
          </Row>
        )}
        <Row label="解説を日本語にする">
          <Toggle checked={s.chatFeedbackJa} onChange={s.setChatFeedbackJa} />
        </Row>
        <Row label={`1回の対象チャンク数 ${s.chatTargetCount}個`}>
          <input
            type="range"
            min={2}
            max={6}
            step={1}
            value={s.chatTargetCount}
            onChange={(e) => s.setChatTargetCount(Number(e.target.value))}
          />
        </Row>
        <UsageBadge />
        <p className="text-xs t-subtle">
          残り回数は「この端末のこのアプリから送った回数」で数えた目安です（AI Studio
          や他端末での利用は含まれません）。無料枠は毎日太平洋時間の深夜
          （日本時間の夕方16〜17時ごろ）にリセットされます。
        </p>
        <p className="text-xs t-subtle">
          キーはこの端末内（ブラウザ）にのみ保存され、Google 以外へは送信されません。
          モデルはチャット練習・教材化・AI長文で共通です。混雑エラー（500）が続くときは
          モデルを切り替えると回避できることがあります。
        </p>
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm font-medium link underline"
        >
          ▶ Google AI Studio でAPIキーを取得
        </a>
        <Link
          to="/stock"
          className="block text-sm font-medium link underline"
        >
          📥 表現ストックを開く（{stockCount}件）
        </Link>
      </Section>

      <Section title="フレーズの取り込み">
        <p className="text-sm t-muted">
          現在のデータ:{' '}
          <span className="font-medium ">
            {source === 'imported' ? '取り込み済み' : 'サンプル'} / {phraseCount}件
          </span>
        </p>
        <div className="space-y-2 text-sm t-muted">
          <p className="font-medium t-muted">
            次のいずれかを取り込めます
          </p>
          <p>
            <span className="font-medium">① CSVを直接</span>（
            <code className="rounded-none bg-carbon-surface px-1 dark:bg-carbon-line-dark">.csv</code>
            ）— 列: ID, Type, Category, Level, Priority, Chunk, 日本語, Example1, 日本語訳1, … Example5, 日本語訳5, Note。任意で <strong>音節</strong>（チャンクのカナ）/ <strong>音節1〜音節5</strong>（各例文のカナ）列を追加できます。強勢の音節は <code className="rounded-none bg-carbon-surface px-1 dark:bg-carbon-line-dark">*</code> で囲むと太字表示されます（例: ス・*ティ*‿ラ）
          </p>
          <p>
            <span className="font-medium">② Notionエクスポート</span> — DBの「•••」→
            エクスポート →「Markdown &amp; CSV」でDLした{' '}
            <code className="rounded-none bg-carbon-surface px-1 dark:bg-carbon-line-dark">.zip</code>{' '}
            をそのまま選択（解凍不要）
          </p>
        </div>

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
          className="btn-primary w-full px-4 py-3 font-medium"
        >
          {busy ? '取り込み中…' : '📥 ファイルを選択（.csv / .zip）'}
        </button>
        <label className="flex items-start gap-2 text-sm t-muted">
          <input
            type="checkbox"
            checked={replaceMode}
            onChange={(e) => setReplaceMode(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            取り込み前に既存データを全て削除（全置換）
            <span className="block text-xs t-subtle">
              通常はマージ（ID一致は上書き・アプリで追加した教材は保持）。Notion側で削除した行を反映したいときだけチェック。
            </span>
          </span>
        </label>

        {importMsg && (
          <p className={`text-sm ${importMsg.ok ? 'text-carbon-success' : 'text-carbon-error'}`}>
            {importMsg.text}
          </p>
        )}

        <button
          onClick={exportDeck}
          className="btn-tertiary w-full px-4 py-2.5 text-sm font-medium"
        >
          📤 デッキをCSVでバックアップ（{phraseCount - seCount}件）
        </button>
        <p className="text-xs t-subtle">
          ステータスやカナも含めた全列を出力します。このCSVはそのまま再取り込みできます。
          構文・意味ノード（Sentence Engine）はこのチャンクCSVには含めません（下の専用セクションで書き出し）。
        </p>
        {exportMsg && <p className="text-sm text-carbon-success">{exportMsg}</p>}

        {source === 'imported' && (
          <button
            onClick={() => {
              if (confirm('取り込んだフレーズと、アプリで追加した教材を消去してサンプルに戻します。よろしいですか？（学習進捗は残ります。必要なら先に「CSVでバックアップ」を）')) {
                clearImported()
              }
            }}
            className="text-sm t-subtle underline"
          >
            取り込みデータを消去してサンプルに戻す
          </button>
        )}
      </Section>

      <Section title="🧱 Sentence Engine デッキ（構文・意味ノード）">
        <p className="text-sm t-muted">
          構文ドリル・意味ノード生成の教材は、チャンク（Notion往復用CSV）とは
          <strong>別データとして管理</strong>します。取り込みは<strong>マージ</strong>
          （ID一致は上書き・SRS進捗は保持）。CSVの列はチャンクCSVと同じで、
          <code className="rounded-none bg-carbon-surface px-1 dark:bg-carbon-line-dark">Type</code>
          列が
          <code className="rounded-none bg-carbon-surface px-1 dark:bg-carbon-line-dark">Structure</code>
          /
          <code className="rounded-none bg-carbon-surface px-1 dark:bg-carbon-line-dark">Message</code>
          の行だけを取り込みます（現在 {seCount}件）。
        </p>

        <input
          ref={seFileRef}
          type="file"
          accept=".zip,.csv,.md,.markdown,.txt"
          multiple
          className="hidden"
          onChange={(e) => onPickSeFiles(e.target.files)}
        />
        <button
          disabled={seBusy}
          onClick={() => seFileRef.current?.click()}
          className="btn-primary w-full px-4 py-3 font-medium"
        >
          {seBusy ? '取り込み中…' : '📥 CSVを取り込む（.csv / .zip）'}
        </button>
        {seImportMsg && (
          <p className={`text-sm ${seImportMsg.ok ? 'text-carbon-success' : 'text-carbon-error'}`}>
            {seImportMsg.text}
          </p>
        )}

        <button
          onClick={exportSentenceEngine}
          disabled={seCount === 0}
          className="btn-tertiary w-full px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          📤 CSVを書き出す（{seCount}件）
        </button>
        {seExportMsg && <p className="text-sm text-carbon-success">{seExportMsg}</p>}

        <button
          disabled={seBusy}
          onClick={addBuiltinSe}
          className="btn-tertiary w-full px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          📦 内蔵デッキを取込・更新（構文16・意味ノード50）
        </button>
        <p className="text-xs t-subtle">
          内蔵の見本デッキを取り込みます。旧28枚版（構文16・意味ノード12）から
          50場面版へ更新するときもこのボタンで上書きできます。
        </p>
        {seSeedMsg && (
          <p className={`text-sm ${seSeedMsg.ok ? 'text-carbon-success' : 'text-carbon-error'}`}>
            {seSeedMsg.text}
          </p>
        )}
      </Section>

      <Section title="データ">
        <p className="text-sm t-muted">
          フルバックアップは教材に加えて<strong>SRS進捗・ストリークも含みます</strong>
          （APIキーは含みません）。スマホアプリ版への移行や機種変更はこれで行います。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={exportFullBackup}
            className="btn-primary px-4 py-2.5 text-sm font-medium"
          >
            📦 フルバックアップ
          </button>
          <button
            onClick={() => backupRef.current?.click()}
            className="btn-tertiary px-4 py-2.5 text-sm font-medium"
          >
            📥 バックアップを復元
          </button>
        </div>
        <input
          ref={backupRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => onPickBackup(e.target.files)}
        />
        {backupMsg && (
          <p className={`text-sm ${backupMsg.ok ? 'text-carbon-success' : 'text-carbon-error'}`}>
            {backupMsg.text}
          </p>
        )}
        <button
          onClick={() => {
            if (confirm('学習の進捗（ボックス・連続日数）をすべて消去します。よろしいですか？')) {
              reset()
            }
          }}
          className="rounded-none border border-carbon-error px-4 py-2 text-sm text-carbon-error active:opacity-80"
        >
          学習進捗をリセット
        </button>
      </Section>

      <Section title="アプリについて">
        <p className="text-sm t-muted">
          バージョン{' '}
          <span className="font-medium ">
            {__APP_VERSION__}
          </span>
          {isNativeApp ? '（Androidアプリ版）' : '（Web/PWA版）'}
        </p>
        {isNativeApp && (
          <a
            href="https://github.com/yuna5963/My-Phrases/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm font-medium link underline"
          >
            ▶ 最新版APKを入手（GitHub Releases）
          </a>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 tile p-4 ">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm t-muted">{label}</span>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${
 checked ? 'bg-carbon-blue' : 'bg-carbon-surface-2 dark:bg-carbon-line-dark'
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
