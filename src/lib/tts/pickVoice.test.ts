import { describe, expect, it } from 'vitest'
import { pickVoiceForLang, resolveVoiceFrom } from './pickVoice'
import type { TtsVoice } from './types'

const v = (voiceURI: string, lang: string, opts: Partial<TtsVoice> = {}): TtsVoice => ({
  voiceURI,
  name: voiceURI,
  lang,
  localService: false,
  default: false,
  ...opts,
})

const VOICES: TtsVoice[] = [
  v('en-gb-online', 'en-GB'),
  v('en-us-online', 'en-US'),
  v('en-us-local', 'en-US', { localService: true }),
  v('en-au-local', 'en-AU', { localService: true }),
  v('ja-jp-local', 'ja-JP', { localService: true }),
  v('de-de-default', 'de-DE', { default: true }),
]

describe('pickVoiceForLang', () => {
  it('端末内（localService）の声を優先する', () => {
    expect(pickVoiceForLang(VOICES, 'en')?.voiceURI).toBe('en-us-local')
  })

  it('en は en-US、ja は ja-JP を優先する', () => {
    expect(pickVoiceForLang(VOICES, 'en')?.lang).toBe('en-US')
    expect(pickVoiceForLang(VOICES, 'ja')?.voiceURI).toBe('ja-jp-local')
  })

  it('localService が無い言語はオンライン声にフォールバック', () => {
    const online = [v('en-gb-1', 'en-GB'), v('en-us-1', 'en-US')]
    expect(pickVoiceForLang(online, 'en')?.voiceURI).toBe('en-us-1')
  })

  it('優先地域が無ければ default → 先頭 の順', () => {
    expect(pickVoiceForLang(VOICES, 'de')?.voiceURI).toBe('de-de-default')
    expect(pickVoiceForLang([v('fr-ca-1', 'fr-CA'), v('fr-fr-1', 'fr-FR')], 'fr')?.voiceURI).toBe(
      'fr-ca-1',
    )
  })

  it('該当言語が無ければ undefined', () => {
    expect(pickVoiceForLang(VOICES, 'ko')).toBeUndefined()
  })
})

describe('resolveVoiceFrom', () => {
  it('保存済み voiceURI が要求言語と一致すればそれを使う', () => {
    expect(resolveVoiceFrom(VOICES, 'en-gb-online', 'en-US')?.voiceURI).toBe('en-gb-online')
  })

  it('保存済み voiceURI の言語が合わなければ自動選択（英語声の設定で日本語を読むケース）', () => {
    expect(resolveVoiceFrom(VOICES, 'en-us-local', 'ja-JP')?.voiceURI).toBe('ja-jp-local')
  })

  it('保存が無い/見つからないときは自動選択', () => {
    expect(resolveVoiceFrom(VOICES, null, 'en-US')?.voiceURI).toBe('en-us-local')
    expect(resolveVoiceFrom(VOICES, 'gone-voice', 'en-US')?.voiceURI).toBe('en-us-local')
  })
})
