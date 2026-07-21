import { useSpeechInput } from '../hooks/useSpeechInput'
import { useSettings } from '../store/useSettings'
import { isNativeApp } from '../lib/platform'

/**
 * 日本語のテキスト入力欄に音声入力を足す小さなボタン。
 * 確定した断片は onText で親へ渡し、既存テキストへの足し方（改行/空白）は親が決める。
 *
 * 表示はプラットフォームで変わる:
 * - Web/PWA: 従来どおりボタンを出す。Web Speech API は continuous で連続入力でき、
 *   そもそもデスクトップのブラウザにはキーボードのマイクキーが無い。
 * - ネイティブアプリ: 既定ではボタンを出さず、キーボードのマイクキーを案内する。
 *   Android の音声認識（SpeechRecognizer）は短い発話向けで、少し黙ると自動で区切れるため
 *   長文が途切れてしまう。キーボードのマイクは連続ディクテーションで途切れない。
 *   設定「🎤 音声入力 → アプリ内のマイクボタンを使う」をONにすると従来のボタンも出る。
 *
 * 音声認識に対応していない端末では（ボタンを出す場合は）何も描画しない。
 * キーボードのマイクの案内は自前の音声認識エンジンに依存しないので常に出す。
 */
export default function VoiceInput({
  onText,
  label,
}: {
  onText: (text: string) => void
  label?: string
}) {
  const { supported, listening, interim, error, start, stop } = useSpeechInput({
    lang: 'ja-JP',
    onFinal: onText,
  })
  const inAppMic = useSettings((s) => s.inAppMic)
  // Web は Web Speech API が連続入力に対応していて途切れないので従来どおりボタンを出す。
  // ネイティブは Android の音声認識が無音で区切れてしまうため、既定ではキーボードの
  // マイクキーを案内し、アプリ内ボタンは設定でONにしたときだけ出す。
  const showButton = !isNativeApp || inAppMic

  if (!showButton) {
    return (
      <p className="t-subtle text-xs">
        🎤 キーボードの マイクキー から音声入力できます（長文でも途切れません）
      </p>
    )
  }

  if (!supported) return null

  return (
    <div>
      <button
        onClick={listening ? stop : start}
        className={`btn-tertiary w-full px-4 py-2.5 text-sm font-medium ${listening ? 'animate-pulse' : ''}`}
      >
        {listening ? '⏹ 停止（聞き取り中…）' : (label ?? '🎤 音声入力')}
      </button>
      {isNativeApp && (
        <p className="t-subtle mt-1 text-xs">長文はキーボードの🎤のほうが途切れません</p>
      )}
      {listening && interim !== '' && <p className="t-subtle text-xs">{interim}</p>}
      {error && <p className="mt-1 text-xs text-carbon-error">⚠ {error}</p>}
    </div>
  )
}
