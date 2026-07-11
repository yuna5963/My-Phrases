import { describe, expect, it } from 'vitest'
import { extractJson, stripCodeFences } from './aiJson'
import {
  buildEnrichPrompt,
  draftToPhrase,
  parseEnrichResponse,
  type EnrichDraft,
} from './enrich'
import { stableId } from './import'

const ITEM = (n: number, over: Record<string, unknown> = {}) => ({
  n,
  en: `Phrase ${n}`,
  ja: `訳${n}`,
  kana: '*フレイズ*',
  example_en: `I use phrase ${n} daily.`,
  example_ja: `毎日フレーズ${n}を使う。`,
  example_kana: 'アイ *ユーズ* イッ(ト)',
  type: 'Phrase',
  category: 'Daily Status',
  level: 'Basic',
  ...over,
})

describe('extractJson', () => {
  it('素のJSON配列を読める', () => {
    expect(extractJson('[{"a":1}]')).toEqual([{ a: 1 }])
  })

  it('コードフェンス・<thought>・前後の散文があっても読める', () => {
    const text = `<thought>考え中…</thought>Here is the result:
\`\`\`json
[{"n":1,"en":"hi"}]
\`\`\`
Hope this helps!`
    expect(extractJson(text)).toEqual([{ n: 1, en: 'hi' }])
  })

  it('文字列内の括弧に惑わされない', () => {
    expect(extractJson('x [{"a":"th{is] ok"}] y')).toEqual([{ a: 'th{is] ok' }])
  })

  it('JSONが無ければ throw', () => {
    expect(() => extractJson('ただの文章です')).toThrow()
  })

  it('stripCodeFences はフェンス記号だけ剥がす', () => {
    expect(stripCodeFences('```json\n[1]\n```')).toBe('[1]\n')
  })
})

describe('buildEnrichPrompt', () => {
  it('given / MISSING のマークと件数・カテゴリ一覧を含む', () => {
    const p = buildEnrichPrompt(
      [{ en: 'No worries.', ja: '気にしないで' }, { en: 'It turned out' }],
      ['Work', 'Health', 'Work'],
    )
    expect(p).toContain('1. en: "No worries." (ja: given "気にしないで")')
    expect(p).toContain('2. en: "It turned out" (ja: MISSING)')
    expect(p).toContain('exactly 2 element(s)')
    expect(p).toContain('Work, Health') // 重複除去
  })

  it('カテゴリが無ければ既定候補を出す', () => {
    expect(buildEnrichPrompt([{ en: 'x' }], [])).toContain('Daily Status')
  })
})

describe('parseEnrichResponse', () => {
  const inputs = [{ en: 'Phrase 1' }, { en: 'Phrase 2' }]

  it('正常なJSON配列をドラフトに変換し、カナをlintする', () => {
    const drafts = parseEnrichResponse(JSON.stringify([ITEM(1), ITEM(2)]), inputs)!
    expect(drafts).toHaveLength(2)
    expect(drafts[0].error).toBeUndefined()
    expect(drafts[0].ja).toBe('訳1')
    expect(drafts[0].kanaIssues.kana).toEqual([])
  })

  it('壊れたカナは kanaIssues に載る', () => {
    const drafts = parseEnrichResponse(
      JSON.stringify([ITEM(1, { kana: '*フレイズ' })]),
      [inputs[0]],
    )!
    expect(drafts[0].kanaIssues.kana.map((i) => i.code)).toContain('star-pair')
  })

  it('JSONとして読めなければ null（呼び出し側がリトライ）', () => {
    expect(parseEnrichResponse('すみません、できませんでした。', inputs)).toBeNull()
  })

  it('件数不足は欠けた項目だけ error 付きドラフトになる', () => {
    const drafts = parseEnrichResponse(JSON.stringify([ITEM(1)]), inputs)!
    expect(drafts[0].error).toBeUndefined()
    expect(drafts[1].error).toBeTruthy()
    expect(drafts[1].en).toBe('Phrase 2')
  })

  it('given の en / ja はモデル出力で上書きされない（防御）', () => {
    const drafts = parseEnrichResponse(
      JSON.stringify([ITEM(1, { en: '改ざんされたen', ja: '改ざんされた訳' })]),
      [{ en: 'Phrase 1', ja: '元の訳' }],
    )!
    expect(drafts[0].en).toBe('Phrase 1')
    expect(drafts[0].ja).toBe('元の訳')
  })

  it('type / level は候補外なら既定値に落とす', () => {
    const drafts = parseEnrichResponse(
      JSON.stringify([ITEM(1, { type: 'Verb', level: 'S+' })]),
      [inputs[0]],
    )!
    expect(drafts[0].type).toBe('Chunk')
    expect(drafts[0].level).toBe('Core')
  })

  it('訳が生成されなかった項目は error になる', () => {
    const drafts = parseEnrichResponse(JSON.stringify([ITEM(1, { ja: '' })]), [
      inputs[0],
    ])!
    expect(drafts[0].error).toBeTruthy()
  })
})

describe('draftToPhrase', () => {
  const draft: EnrichDraft = {
    en: 'No worries.',
    ja: '気にしないで',
    kana: 'ノウ *ワ*・リーズ',
    exampleEn: 'No worries, I can wait.',
    exampleJa: '気にしないで、待てるから。',
    exampleKana: 'ノウ *ワ*・リーズ',
    type: 'Phrase',
    category: 'Daily Status',
    level: 'Basic',
    kanaIssues: { kana: [], exampleKana: [] },
  }

  it('id は stableId(en)、status 既定、createdTime 付き（アプリ内追加の印）', () => {
    const p = draftToPhrase(draft)
    expect(p.id).toBe(stableId('No worries.'))
    expect(p.status).toBe('未着手')
    expect(p.createdTime).not.toBe('')
    expect(p.examples).toEqual([
      { en: 'No worries, I can wait.', ja: '気にしないで、待てるから。', kana: 'ノウ *ワ*・リーズ' },
    ])
    expect(p.kanaWarnings).toBeUndefined()
  })

  it('lint不合格のフィールドは kanaWarnings に載る', () => {
    const p = draftToPhrase({
      ...draft,
      kanaIssues: {
        kana: [{ code: 'star-pair', level: 'error', message: '' }],
        exampleKana: [{ code: 'no-stress', level: 'warn', message: '' }],
      },
    })
    expect(p.kanaWarnings).toEqual(['音節', '音節1'])
  })

  it('例文が空なら examples は空配列', () => {
    const p = draftToPhrase({ ...draft, exampleEn: '', exampleKana: '' })
    expect(p.examples).toEqual([])
  })
})
