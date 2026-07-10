import { describe, expect, it } from 'vitest'
import { extractSuggestions, filterNewSuggestions } from './suggestions'
import type { Phrase } from '../types'

describe('extractSuggestions', () => {
  it('➕ 行を抽出し、本文からは取り除く', () => {
    const text = `よくできました！

➕ How about you? — あなたはどう？
➕ That works for me. — それで大丈夫です`
    const { body, suggestions } = extractSuggestions(text)
    expect(body).toBe('よくできました！')
    expect(suggestions).toEqual([
      { en: 'How about you?', ja: 'あなたはどう？' },
      { en: 'That works for me.', ja: 'それで大丈夫です' },
    ])
  })

  it('箇条書き記号付き・引用符付き・ハイフン区切りも許容する', () => {
    const { suggestions } = extractSuggestions(
      '- ➕ "Sounds good." - いいね\n* ➕ Let me check – 確認させて',
    )
    expect(suggestions).toEqual([
      { en: 'Sounds good.', ja: 'いいね' },
      { en: 'Let me check', ja: '確認させて' },
    ])
  })

  it('訳が無い行は ja 空で拾う', () => {
    const { suggestions } = extractSuggestions('➕ No worries.')
    expect(suggestions).toEqual([{ en: 'No worries.', ja: '' }])
  })

  it('➕ 行が無ければ本文そのまま・候補なし', () => {
    const { body, suggestions } = extractSuggestions('まとめだけ')
    expect(body).toBe('まとめだけ')
    expect(suggestions).toEqual([])
  })
})

describe('filterNewSuggestions', () => {
  const phrases = [{ id: 'a', en: "I'm not sure if ~" }, { id: 'b', en: 'come down with' }] as Phrase[]

  it('デッキに既にある表現を除外する（正規化一致）', () => {
    const out = filterNewSuggestions(
      [
        { en: "I'm not sure if", ja: '' }, // 既存（記号差のみ）
        { en: 'Come down with!', ja: '' }, // 既存（大文字・記号差）
        { en: 'No worries.', ja: '気にしないで' },
      ],
      phrases,
    )
    expect(out).toEqual([{ en: 'No worries.', ja: '気にしないで' }])
  })

  it('候補同士の重複も除く', () => {
    const out = filterNewSuggestions(
      [
        { en: 'No worries', ja: '' },
        { en: 'no worries!', ja: '' },
      ],
      phrases,
    )
    expect(out).toHaveLength(1)
  })
})
