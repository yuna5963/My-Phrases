// 声の選択ロジック（純関数）。エンジン非依存でテスト可能にするため分離。
import type { TtsVoice } from './types'

export function pickVoiceForLang(voices: TtsVoice[], prefix: string): TtsVoice | undefined {
  const p = prefix.toLowerCase()
  const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(p))
  // Prefer on-device (localService) voices so audio works offline; some Android
  // "online" voices stay silent when the app is offline.
  const local = matches.filter((v) => v.localService)
  const pool = local.length ? local : matches
  const preferred = p === 'en' ? 'en-us' : p === 'ja' ? 'ja-jp' : p
  return (
    pool.find((v) => v.lang.toLowerCase() === preferred) ||
    pool.find((v) => v.default) ||
    pool[0]
  )
}

/** 保存された voiceURI と要求言語から、実際に使う声を決める。 */
export function resolveVoiceFrom(
  voices: TtsVoice[],
  voiceURI: string | null | undefined,
  lang: string,
): TtsVoice | undefined {
  const prefix = lang.slice(0, 2).toLowerCase()
  let v: TtsVoice | undefined
  if (voiceURI) {
    // Only honour the saved voice when it matches the requested language;
    // the user's stored preference is an English voice.
    const match = voices.find((x) => x.voiceURI === voiceURI)
    if (match && match.lang.toLowerCase().startsWith(prefix)) v = match
  }
  if (!v) v = pickVoiceForLang(voices, prefix)
  return v
}
