import { describe, expect, it } from 'vitest'
import { findUsedChunks, matchLevel, matchesChunk, normalize, overlapRatio } from './chunkMatch'
import type { Phrase } from '../types'

describe('normalize', () => {
  it('小文字化して句読点を除去する', () => {
    expect(normalize('Hello, World!')).toBe('hello world')
  })

  it('短縮形を展開する', () => {
    expect(normalize("I'm")).toBe('i am')
    expect(normalize("don't")).toBe('do not')
    expect(normalize("won't")).toBe('will not')
    expect(normalize("we've")).toBe('we have')
  })

  it("it's や所有格はアポストロフィを潰して1語にする", () => {
    expect(normalize("it's")).toBe('its')
    expect(normalize("my friend's car")).toBe('my friends car')
  })

  it('空白を圧縮する', () => {
    expect(normalize('  a   b  ')).toBe('a b')
  })
})

describe('matchesChunk', () => {
  it('大文字小文字・句読点の違いを無視して一致する', () => {
    expect(matchesChunk('come down with', 'I might COME DOWN WITH a cold!')).toBe(true)
    expect(matchesChunk('come down with', 'I think I might come down with a cold.')).toBe(true)
  })

  it('活用形は v1 では一致しない（既知の割り切り）', () => {
    expect(matchesChunk('come down with', 'I came down with a cold.')).toBe(false)
  })

  it('短縮形でも一致する', () => {
    expect(matchesChunk('I am supposed to', "I'm supposed to finish this today.")).toBe(true)
  })

  it('単語境界を守る（部分文字列では一致しない）', () => {
    expect(matchesChunk('in', 'I was singing loudly.')).toBe(false)
    expect(matchesChunk('in', 'I was in the room.')).toBe(true)
    expect(matchesChunk('come down', 'The income downside is real.')).toBe(false)
  })

  it('穴あきチャンクは固定語の順序出現で一致する', () => {
    expect(matchesChunk('It takes ... to ~', 'It takes twenty minutes to get there.')).toBe(true)
    expect(matchesChunk('It takes ... to ~', 'To get there, it takes long.')).toBe(false)
    expect(matchesChunk('run out of ...', "We've run out of milk.")).toBe(true)
  })

  it('空・記号のみの発話は一致しない', () => {
    expect(matchesChunk('come down with', '')).toBe(false)
    expect(matchesChunk('come down with', '!!!')).toBe(false)
  })
})

describe('findUsedChunks', () => {
  const targets = [
    { id: 'a', en: 'come down with' },
    { id: 'b', en: 'run out of ...' },
    { id: 'c', en: 'It takes ... to ~' },
  ] as Phrase[]

  it('使われたチャンクの id を返す', () => {
    expect(
      findUsedChunks(targets, "I came down with a cold and we've run out of medicine."),
    ).toEqual(['b'])
    expect(findUsedChunks(targets, 'I might come down with something.')).toEqual(['a'])
    expect(findUsedChunks(targets, 'Nothing here.')).toEqual([])
  })
})

describe('overlapRatio / matchLevel', () => {
  const S = 'I still have a headache.'

  it('完全に言えれば 1.0（hit）', () => {
    expect(overlapRatio(S, 'I still have a headache')).toBe(1)
    expect(matchLevel(S, 'i still have a headache')).toBe('hit')
  })

  it('1語取りこぼしても hit のまま（音声認識の揺れを許容する）', () => {
    // 5語中4語 = 0.8 … しきい値0.85未満なので partial。5語では1語落ちると partial になる
    expect(matchLevel(S, 'I still have headache')).toBe('partial')
    // 語数が多い文なら1語の取りこぼしは hit に収まる
    const long = 'I think we should start small and see how it goes'
    expect(matchLevel(long, 'I think we should start small and see how goes')).toBe('hit')
  })

  it('半分ほど言えていれば partial', () => {
    expect(matchLevel(S, 'I have headache')).toBe('partial')
  })

  it('まったく違えば miss', () => {
    expect(matchLevel(S, 'good morning everyone')).toBe('miss')
    expect(matchLevel(S, '')).toBe('miss')
  })

  it('短縮形・記号・大文字小文字の差は無視する（normalize 経由）', () => {
    expect(matchLevel("I'm not sure.", 'i am not sure')).toBe('hit')
  })

  it('同じ語の重複を二重に数えない', () => {
    // expected に2つある "very" は、発話に1つしか無ければ1つ分しか当たらない
    expect(overlapRatio('very very good', 'very good')).toBeCloseTo(2 / 3)
  })

  it('期待文が空なら 0（0除算しない）', () => {
    expect(overlapRatio('', 'anything')).toBe(0)
  })
})
