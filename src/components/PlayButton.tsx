import { speak } from '../lib/tts'
import { useSettings } from '../store/useSettings'

interface Props {
  text: string
  className?: string
  label?: string
}

/** Speaks `text` via TTS using the user's voice/rate settings. */
export default function PlayButton({ text, className = '', label = '🔊 再生' }: Props) {
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.rate)
  return (
    <button
      type="button"
      onClick={() => speak(text, { voiceURI, rate })}
      className={`rounded-full bg-sky-500 px-5 py-2.5 font-medium text-white active:scale-95 ${className}`}
    >
      {label}
    </button>
  )
}
