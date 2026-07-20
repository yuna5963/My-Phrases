import { describe, it, expect } from 'vitest'
import {
  buildDecomposePrompt,
  buildEnglishPrompt,
  DEFAULT_SCENE,
  nodesFromText,
  parseDecomposeFeedback,
  parseEnglishFeedback,
} from './thinkPrompt'

describe('nodesFromText', () => {
  it('splits lines, trims, and drops blanks', () => {
    expect(nodesFromText('主張: 会議を減らす\n\n  根拠: 集中時間が要る  \n')).toEqual([
      '主張: 会議を減らす',
      '根拠: 集中時間が要る',
    ])
  })
  it('caps at 5 lines', () => {
    const text = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].join('\n')
    expect(nodesFromText(text)).toHaveLength(5)
  })
  it('returns empty array for whitespace-only input', () => {
    expect(nodesFromText('   \n\n ')).toEqual([])
  })
})

describe('buildDecomposePrompt', () => {
  it('puts criteria in system and content in user', () => {
    const msgs = buildDecomposePrompt('会議が多すぎる', ['主張: 会議を減らす', '根拠: 集中時間'])
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('意味ノード')
    expect(msgs[1].role).toBe('user')
    expect(msgs[1].content).toContain('会議が多すぎる')
    expect(msgs[1].content).toContain('主張: 会議を減らす')
    expect(msgs[1].content).toContain('根拠: 集中時間')
  })
})

describe('buildEnglishPrompt', () => {
  it('includes nodes and sentences in the user message', () => {
    const msgs = buildEnglishPrompt(['主張: 会議を減らす'], ['We should have fewer meetings.'])
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('ビジネス英語')
    expect(msgs[1].content).toContain('主張: 会議を減らす')
    expect(msgs[1].content).toContain('We should have fewer meetings.')
  })
})

describe('parseDecomposeFeedback', () => {
  it('parses a well-formed response', () => {
    const text = JSON.stringify({
      comment: '結論が先で良いです。根拠を一つ足すと強くなります。',
      nodes: [
        { node: '主張: 会議を減らす', ok: true, issue: '', fix: '' },
        { node: '会議が多いと集中できないしメールも増える', ok: false, issue: '2つの機能が混在', fix: '根拠: 集中時間が減る' },
      ],
      suggested: ['主張: 会議を減らすべき', '根拠: 集中時間が減る', '結論: 会議を週2に'],
    })
    const fb = parseDecomposeFeedback(text)
    expect(fb.comment).toContain('結論が先')
    expect(fb.nodes).toHaveLength(2)
    expect(fb.nodes[0].ok).toBe(true)
    expect(fb.nodes[1].ok).toBe(false)
    expect(fb.nodes[1].fix).toBe('根拠: 集中時間が減る')
    expect(fb.suggested).toHaveLength(3)
  })

  it('parses a response wrapped in code fences', () => {
    const text = '```json\n' + JSON.stringify({ comment: 'ok', nodes: [], suggested: [] }) + '\n```'
    const fb = parseDecomposeFeedback(text)
    expect(fb.comment).toBe('ok')
    expect(fb.nodes).toEqual([])
  })

  it('defaults missing per-node fields', () => {
    const text = JSON.stringify({ nodes: [{ node: '主張: X' }], suggested: ['主張: X'] })
    const fb = parseDecomposeFeedback(text)
    expect(fb.comment).toBe('') // missing top-level comment → ''
    expect(fb.nodes[0]).toEqual({ node: '主張: X', ok: false, issue: '', fix: '' })
  })

  it('throws when nodes is missing/not an array', () => {
    expect(() => parseDecomposeFeedback(JSON.stringify({ comment: 'x' }))).toThrow()
  })

  it('throws on non-JSON', () => {
    expect(() => parseDecomposeFeedback('sorry, I cannot help')).toThrow()
  })
})

describe('parseEnglishFeedback', () => {
  it('parses a well-formed response', () => {
    const text = JSON.stringify({
      comment: '主語と動詞が明確で良いです。',
      scene: '進捗報告',
      sentences: [
        { original: 'We should have fewer meetings.', ok: true, issue: '', suggestion: 'We should have fewer meetings.', reason: '' },
        { original: 'Meeting is too much.', ok: false, issue: '主語が不自然', suggestion: 'We have too many meetings.', reason: '複数形で自然に' },
      ],
      expressions: [{ en: 'Let me get back to you.', ja: '後ほど連絡します' }],
    })
    const fb = parseEnglishFeedback(text)
    expect(fb.scene).toBe('進捗報告')
    expect(fb.sentences).toHaveLength(2)
    expect(fb.sentences[1].suggestion).toBe('We have too many meetings.')
    expect(fb.expressions).toHaveLength(1)
  })

  it('handles code fences and defaults scene when empty', () => {
    const text = '```\n' + JSON.stringify({ comment: 'ok', scene: '', sentences: [] }) + '\n```'
    const fb = parseEnglishFeedback(text)
    expect(fb.scene).toBe(DEFAULT_SCENE)
    expect(fb.expressions).toEqual([])
  })

  it('falls back suggestion to the original when suggestion missing', () => {
    const text = JSON.stringify({ sentences: [{ original: 'I go office.', ok: false, issue: '不自然' }] })
    const fb = parseEnglishFeedback(text)
    expect(fb.sentences[0].suggestion).toBe('I go office.')
  })

  it('caps expressions at 3 and drops empty en', () => {
    const text = JSON.stringify({
      sentences: [],
      expressions: [
        { en: 'a', ja: '1' },
        { en: '', ja: 'skip' },
        { en: 'b', ja: '2' },
        { en: 'c', ja: '3' },
        { en: 'd', ja: '4' },
      ],
    })
    const fb = parseEnglishFeedback(text)
    expect(fb.expressions.map((e) => e.en)).toEqual(['a', 'b', 'c'])
  })

  it('throws when sentences is missing/not an array', () => {
    expect(() => parseEnglishFeedback(JSON.stringify({ comment: 'x' }))).toThrow()
  })

  it('throws on non-JSON', () => {
    expect(() => parseEnglishFeedback('no json here')).toThrow()
  })
})
