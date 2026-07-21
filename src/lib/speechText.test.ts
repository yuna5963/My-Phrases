import { describe, expect, it } from 'vitest'
import { appendSpoken } from './speechText'

describe('appendSpoken', () => {
  it('空の入力欄には断片をそのまま置く', () => {
    expect(appendSpoken('', '会議を減らすべき')).toBe('会議を減らすべき')
  })

  it('空白だけの入力欄も空とみなす', () => {
    expect(appendSpoken('   \n ', '  会議を減らすべき  ')).toBe('会議を減らすべき')
  })

  it('空の断片は入力欄を変えない', () => {
    expect(appendSpoken('主張: A', '')).toBe('主張: A')
    expect(appendSpoken('主張: A', '   ')).toBe('主張: A')
  })

  it('自由記述は空白で続ける', () => {
    expect(appendSpoken('主張: A', '根拠: B')).toBe('主張: A 根拠: B')
  })

  it('意味ノードは1発話=1行で足す', () => {
    expect(appendSpoken('主張: A', '根拠: B', { newline: true })).toBe('主張: A\n根拠: B')
  })

  it('すでに改行で終わっていれば区切りを重ねない', () => {
    expect(appendSpoken('主張: A\n', '根拠: B', { newline: true })).toBe('主張: A\n根拠: B')
    expect(appendSpoken('主張: A\n', '根拠: B')).toBe('主張: A\n根拠: B')
  })

  it('末尾が空白なら空白を重ねない', () => {
    expect(appendSpoken('主張: A ', '根拠: B')).toBe('主張: A 根拠: B')
  })
})
