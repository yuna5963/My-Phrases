import { describe, expect, it } from 'vitest'
import { lintKana, lintPhraseKana } from './kanaLint'
import type { Phrase } from '../types'

describe('lintKana: 記法ドキュメントの正例は全て合格する', () => {
  const cases: Array<[string, string]> = [
    ['still', '*ス・ティル*'],
    ['I still have a headache.', 'アイ ス・*ティル* ハ・ヴァ *ヘッ*・デイク'],
    ['focus on', '*フォウ*・カ‿*ソン*'],
    ['I am not out of the woods yet.', 'アイム *ナ*・タウ・タ ザ *ウッヅ* *イェッ(ト)*'],
    [
      'Even though it is hard, I want to keep going.',
      '*イー*・ヴン・*ゾウ* イ・*ティズ* *ハー(ド)* アイ *ワナ* *キープ* *ゴウ*・イング',
    ],
    ['not', 'ナッ(ト)'],
    ['keep going', '*キープ* *ゴウ*・イング'],
  ]
  for (const [en, kana] of cases) {
    it(`${en} → ${kana}`, () => {
      expect(lintKana(kana, en)).toEqual([])
    })
  }
})

describe('lintKana: 書式違反（error）', () => {
  it('空文字・空白のみ', () => {
    expect(lintKana('', 'still').map((i) => i.code)).toContain('empty')
    expect(lintKana('   ', 'still').map((i) => i.code)).toContain('empty')
  })

  it('記法にない文字（ひらがな・英字・全角かっこ）', () => {
    expect(lintKana('す・てぃる', 'still').map((i) => i.code)).toContain('chars')
    expect(lintKana('ス・till', 'still').map((i) => i.code)).toContain('chars')
    expect(lintKana('ナッ（ト）', 'not').map((i) => i.code)).toContain('chars')
  })

  it('強勢 * が奇数個', () => {
    expect(lintKana('*ス・ティル', 'still').map((i) => i.code)).toContain('star-pair')
  })

  it('空の強勢 **', () => {
    expect(lintKana('ス**ティル', 'still').map((i) => i.code)).toContain('star-empty')
  })

  it('丸かっこの不対応・入れ子・空', () => {
    expect(lintKana('ナッ(ト', 'not').map((i) => i.code)).toContain('paren-balance')
    expect(lintKana('ナッ((ト))', 'not').map((i) => i.code)).toContain('paren-nest')
    expect(lintKana('ナッ()', 'not').map((i) => i.code)).toContain('paren-empty')
  })

  it('区切り記号の位置異常', () => {
    expect(lintKana('・スティル', 'still').map((i) => i.code)).toContain('sep-edge')
    expect(lintKana('スティル‿', 'still').map((i) => i.code)).toContain('sep-edge')
    expect(lintKana('ス・・ティル', 'still').map((i) => i.code)).toContain('sep-run')
    expect(lintKana('キープ ・ゴウ', 'keep going').map((i) => i.code)).toContain('sep-space')
  })
})

describe('lintKana: ソフト検査（warn）', () => {
  it('カナの語数が英語より多い', () => {
    const codes = lintKana('*キープ* *ゴウ* *イング*', 'keep going').map((i) => i.code)
    expect(codes).toContain('words-over')
  })

  it('カナの語数が英語の半分未満', () => {
    const codes = lintKana('*アイム*', 'I am not out of the woods yet.').map((i) => i.code)
    expect(codes).toContain('words-under')
  })

  it('リンキング ‿ は語数に数え戻すので focus on は警告なし', () => {
    expect(lintKana('*フォウ*・カ‿*ソン*', 'focus on')).toEqual([])
  })

  it('3語以上の文で強勢ゼロは警告', () => {
    const issues = lintKana('アイ ハヴ タイム', 'I have time.')
    expect(issues.map((i) => i.code)).toContain('no-stress')
    expect(issues.every((i) => i.level === 'warn')).toBe(true)
  })

  it('短いチャンクは強勢なしでも合格（弱化した機能語など）', () => {
    expect(lintKana('タ ミー', 'to me')).toEqual([])
  })
})

describe('lintPhraseKana', () => {
  const base: Phrase = {
    id: 'p_1',
    en: 'still',
    ja: 'まだ',
    examples: [],
    type: 'Chunk',
    category: '',
    level: '',
    priority: '',
    note: '',
    status: '未着手',
    createdTime: '',
  }

  it('不合格フィールドのラベルだけを返す', () => {
    const p: Phrase = {
      ...base,
      kana: '*ス・ティル*', // 合格
      examples: [
        { en: 'I still have a headache.', ja: '', kana: 'アイ ス・*ティル* ハ・ヴァ *ヘッ*・デイク' }, // 合格
        { en: 'Still working.', ja: '', kana: 'すてぃる' }, // 不合格
      ],
    }
    expect(lintPhraseKana(p)).toEqual(['音節2'])
  })

  it('カナ未入力の欄は対象外', () => {
    expect(lintPhraseKana({ ...base, examples: [{ en: 'Hi.', ja: '' }] })).toEqual([])
  })
})
