import { describe, expect, it } from 'vitest'
import {
  draftKanaIssues,
  draftToPhraseFromForm,
  emptyDraft,
  phraseToDraft,
  validateDraft,
} from './phraseForm'
import { stableId } from './import'
import type { Phrase } from '../types'

const base: Phrase = {
  id: 'abc123',
  en: 'It slipped my mind.',
  ja: 'うっかり忘れてた',
  kana: 'イッ(ト) *スリッ*(プト) マイ *マインド*',
  examples: [
    {
      en: 'Sorry, it slipped my mind.',
      ja: 'ごめん、うっかり忘れてた。',
      kana: '*ソ*・リ イッ(ト) *スリッ*(プト) マイ *マインド*',
    },
    { en: 'It totally slipped my mind.', ja: '完全に忘れてた。' },
  ],
  type: 'Phrase',
  category: 'Daily Status',
  level: 'Core',
  priority: '★★★',
  note: 'メモ',
  status: '進行中',
  createdTime: '2026-07-01T00:00:00.000Z',
}

describe('phraseToDraft / draftToPhraseFromForm ラウンドトリップ', () => {
  it('編集で id・createdTime・全フィールドが維持される', () => {
    const draft = phraseToDraft(base)
    const out = draftToPhraseFromForm(draft, { existingPhrase: base })
    expect(out).toEqual(base)
  })

  it('英文を変えても id は変わらない（SRS進捗保持）', () => {
    const draft = phraseToDraft(base)
    draft.en = 'It slipped my mind completely.'
    const out = draftToPhraseFromForm(draft, { existingPhrase: base })
    expect(out.id).toBe('abc123')
    expect(out.createdTime).toBe(base.createdTime)
    expect(out.en).toBe('It slipped my mind completely.')
  })

  it('例文が無い Phrase は編集用に空行1つを用意し、保存時は0件に戻る', () => {
    const noEx: Phrase = { ...base, examples: [] }
    const draft = phraseToDraft(noEx)
    expect(draft.examples).toHaveLength(1)
    const out = draftToPhraseFromForm(draft, { existingPhrase: noEx })
    expect(out.examples).toEqual([])
  })
})

describe('draftToPhraseFromForm 新規', () => {
  it('id = stableId(en)、createdTime 付与、既定値が入る', () => {
    const d = emptyDraft()
    d.en = ' No worries. '
    d.ja = ' 気にしないで '
    const out = draftToPhraseFromForm(d, { now: () => '2026-07-12T00:00:00.000Z' })
    expect(out.id).toBe(stableId('No worries.'))
    expect(out.en).toBe('No worries.')
    expect(out.ja).toBe('気にしないで')
    expect(out.createdTime).toBe('2026-07-12T00:00:00.000Z')
    expect(out.type).toBe('Chunk')
    expect(out.level).toBe('Core')
    expect(out.status).toBe('未着手')
    expect(out.examples).toEqual([])
    expect(out).not.toHaveProperty('kana')
    expect(out).not.toHaveProperty('kanaWarnings')
  })

  it('英文が空の例文行は除外し、残りを詰めて保存する', () => {
    const d = emptyDraft()
    d.en = 'Sleep on it.'
    d.ja = '一晩考える'
    d.examples = [
      { en: 'First example.', ja: '1つ目', kana: '' },
      { en: '', ja: '英文なし（捨てられる）', kana: '' },
      { en: 'Third example.', ja: '3つ目', kana: '' },
    ]
    const out = draftToPhraseFromForm(d)
    expect(out.examples).toEqual([
      { en: 'First example.', ja: '1つ目' },
      { en: 'Third example.', ja: '3つ目' },
    ])
  })
})

describe('kanaWarnings 再計算', () => {
  it('不正カナ（ひらがな混入）で「音節」、例文側は詰め後の番号でラベル付けする', () => {
    const d = emptyDraft()
    d.en = 'Still here.'
    d.ja = 'まだいる'
    d.kana = 'すてぃる ヒア' // ひらがな = 記法違反
    d.examples = [
      { en: '', ja: '', kana: '' }, // 除外される行
      { en: 'I am still here.', ja: '', kana: 'アイム すてぃる ヒア' }, // 詰め後は例文1
    ]
    const out = draftToPhraseFromForm(d)
    expect(out.kanaWarnings).toEqual(['音節', '音節1'])
  })

  it('正しいカナなら kanaWarnings プロパティ自体が付かない（要確認の解除）', () => {
    const warned: Phrase = { ...base, kana: 'すりっぷと', kanaWarnings: ['音節'] }
    const draft = phraseToDraft(warned)
    draft.kana = 'イッ(ト) *スリッ*(プト) マイ *マインド*'
    const out = draftToPhraseFromForm(draft, { existingPhrase: warned })
    expect(out).not.toHaveProperty('kanaWarnings')
  })

  it('カナが空なら検証せず kana プロパティも付けない', () => {
    const d = emptyDraft()
    d.en = 'OK.'
    d.ja = '了解'
    d.kana = '   '
    const out = draftToPhraseFromForm(d)
    expect(out).not.toHaveProperty('kana')
    expect(out).not.toHaveProperty('kanaWarnings')
  })
})

describe('draftKanaIssues', () => {
  it('カナ・英文が揃っている欄だけ検証する', () => {
    const d = emptyDraft()
    d.en = 'Still here.'
    d.kana = 'すてぃる'
    d.examples = [
      { en: 'Example.', ja: '', kana: '' }, // カナ空 → 検証しない
      { en: '', ja: '', kana: 'カナだけ' }, // 英文空 → 検証しない
    ]
    const issues = draftKanaIssues(d)
    expect(issues.kana.length).toBeGreaterThan(0)
    expect(issues.examples[0]).toEqual([])
    expect(issues.examples[1]).toEqual([])
  })
})

describe('validateDraft', () => {
  it('en / ja が必須', () => {
    const d = emptyDraft()
    expect(validateDraft(d)).toHaveLength(2)
    d.en = 'OK.'
    expect(validateDraft(d)).toHaveLength(1)
    d.ja = '了解'
    expect(validateDraft(d)).toEqual([])
  })

  it('空白のみ（半角・全角とも）は未入力扱い', () => {
    const d = emptyDraft()
    d.en = '  '
    d.ja = '　' // 全角スペースも trim で落ちる
    expect(validateDraft(d)).toHaveLength(2)
  })
})
