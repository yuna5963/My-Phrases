import { useSpeechInput } from '../hooks/useSpeechInput'

/**
 * 日本語のテキスト入力欄に音声入力を足す小さなボタン。
 * 確定した断片は onText で親へ渡し、既存テキストへの足し方（改行/空白）は親が決める。
 * 音声認識に対応していない端末では何も描画しない。
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

  if (!supported) return null

  return (
    <div>
      <button
        onClick={listening ? stop : start}
        className={`btn-tertiary w-full px-4 py-2.5 text-sm font-medium ${listening ? 'animate-pulse' : ''}`}
      >
        {listening ? '⏹ 停止（聞き取り中…）' : (label ?? '🎤 音声入力')}
      </button>
      {listening && interim !== '' && <p className="t-subtle text-xs">{interim}</p>}
      {error && <p className="mt-1 text-xs text-carbon-error">⚠ {error}</p>}
    </div>
  )
}
