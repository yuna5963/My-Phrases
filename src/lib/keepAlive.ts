// 【実験的】バックグラウンド再生のキープアライブ。
// モバイルブラウザは非表示・画面オフのページを凍結し、speechSynthesis の
// onend→setTimeout 連鎖（speakSequence）が死ぬ。一方で「音声を再生中のタブ」は
// 凍結・タイマー抑制の対象外になるため、連続再生中にほぼ聞こえない実音声
// （デジタル無音は「再生中」と判定されないので不可）をループ再生して
// タブを生かし、画面オフでも読み上げの継続を狙う。
// 非公式なハックであり、端末・Chrome のバージョンによっては効かない。
// あわせて Media Session で通知/ロック画面に再生中の教材を表示し、
// 通知の⏸やイヤホン抜去では再生全体を止める（キープアライブだけが止まって
// ハックが静かに死ぬのを防ぐ）。

/** キープアライブ用WAVの生成パラメータ。既定: 40Hz・約-34dBFS・8kHz・30秒。 */
export interface KeepAliveWavSpec {
  sampleRate?: number
  seconds?: number
  freqHz?: number
  /** フルスケール比 0..1。小さすぎると「無音」と判定される恐れがあるため既定 0.02。 */
  amplitude?: number
}

/**
 * ほぼ聞こえないループ用WAV（RIFF/PCM16LE・モノラル）をバイト列で生成する。
 * 40Hz はスマホのスピーカーではほぼ再生できない低さだがデジタル的には非無音。
 * 既定の 30 秒 = 1200 周期ちょうどで、ループ境界が位相連続になりクリック音が出ない。
 * ※ Android Chrome は**5秒未満のメディアをメディア再生として扱わない**
 * （通知が出ず、バックグラウンド凍結の免除も受けられない）ため、既定は十分長い30秒にする。
 */
export function generateKeepAliveWav(spec: KeepAliveWavSpec = {}): Uint8Array {
  const { sampleRate = 8000, seconds = 30, freqHz = 40, amplitude = 0.02 } = spec
  const numSamples = Math.round(sampleRate * seconds)
  const dataSize = numSamples * 2 // 16bit モノラル
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt チャンクサイズ
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // モノラル
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byteRate
  view.setUint16(32, 2, true) // blockAlign
  view.setUint16(34, 16, true) // bitsPerSample
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)
  const peak = amplitude * 32767
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(peak * Math.sin((2 * Math.PI * freqHz * i) / sampleRate))
    view.setInt16(44 + i * 2, sample, true)
  }
  return new Uint8Array(buf)
}

export interface KeepAliveMeta {
  title: string
  artist?: string
}

export interface KeepAliveOptions extends KeepAliveMeta {
  /** 通知の⏸・イヤホン抜去・他アプリの音声フォーカス奪取などで止められたとき。 */
  onExternalPause?: () => void
}

let audio: HTMLAudioElement | null = null
let blobUrl: string | null = null
let active = false
let stoppingInternally = false
let externalPauseHandler: (() => void) | undefined

function mediaSessionOf(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
    ? navigator.mediaSession
    : null
}

function setMetadata(meta: KeepAliveMeta) {
  const ms = mediaSessionOf()
  if (!ms || typeof MediaMetadata === 'undefined') return
  try {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './'
    ms.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist ?? 'My Phrases',
      artwork: [
        { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    })
  } catch {
    // Media Session はあくまで表示の補助。失敗しても再生は続ける。
  }
}

function stopFromSession() {
  const handler = externalPauseHandler
  stopKeepAlive()
  handler?.()
}

function setupMediaSession() {
  const ms = mediaSessionOf()
  if (!ms) return
  try {
    ms.playbackState = 'playing'
    // ⏸/⏹ はキープアライブだけでなく再生全体を止める。
    ms.setActionHandler('pause', stopFromSession)
    ms.setActionHandler('stop', stopFromSession)
    // play を登録しておくと通知のコントロールが残るが、ロック画面からの
    // 再開は v1 では非対応（プレイヤー画面の ▶ から再開する）。
    ms.setActionHandler('play', () => {})
  } catch {
    // 未対応アクションで例外を投げるブラウザがある。表示の補助なので無視。
  }
}

function teardownMediaSession() {
  const ms = mediaSessionOf()
  if (!ms) return
  try {
    ms.playbackState = 'none'
    ms.metadata = null
    ms.setActionHandler('pause', null)
    ms.setActionHandler('stop', null)
    ms.setActionHandler('play', null)
  } catch {
    // no-op
  }
}

/**
 * キープアライブ音声の再生を開始する。**ユーザージェスチャのハンドラ内で
 * 同期的に呼ぶこと**（autoplay 制限）。既に再生中ならメタデータだけ更新する。
 * 拒否・非対応時は false（呼び出し側は従来どおり続行してよい）。
 */
export async function startKeepAlive(opts: KeepAliveOptions): Promise<boolean> {
  if (typeof Audio === 'undefined') return false
  externalPauseHandler = opts.onExternalPause
  if (active && audio) {
    setMetadata(opts)
    return true
  }
  if (!audio) {
    blobUrl = URL.createObjectURL(
      new Blob([generateKeepAliveWav().buffer as ArrayBuffer], { type: 'audio/wav' }),
    )
    audio = new Audio(blobUrl)
    audio.loop = true
    // 静かさはサンプル振幅側で確保する（volume を下げすぎると
    // 「無音タブ」と判定されてハックが無効になる恐れがある）。
    audio.volume = 1
    audio.addEventListener('pause', () => {
      if (active && !stoppingInternally) {
        // 通知の⏸・イヤホン抜去・音声フォーカス喪失など外からの停止。
        const handler = externalPauseHandler
        stopKeepAlive()
        handler?.()
      }
    })
  }
  try {
    await audio.play()
  } catch {
    return false // autoplay 拒否など。再生自体は従来どおり続ける。
  }
  active = true
  setMetadata(opts)
  setupMediaSession()
  return true
}

/** 通知/ロック画面の表示を今のカードに合わせる（キープアライブ停止中は no-op）。 */
export function updateKeepAliveMetadata(meta: KeepAliveMeta): void {
  if (!active) return
  setMetadata(meta)
}

/** キープアライブを止める（冪等・例外を投げない）。 */
export function stopKeepAlive(): void {
  if (!active && !audio) return
  stoppingInternally = true
  try {
    audio?.pause()
    if (audio) audio.currentTime = 0
  } catch {
    // no-op
  }
  active = false
  stoppingInternally = false
  externalPauseHandler = undefined
  teardownMediaSession()
}

export function isKeepAliveActive(): boolean {
  return active
}
