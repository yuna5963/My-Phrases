import { describe, expect, it } from 'vitest'
import { messageFor } from './messages'

describe('messageFor', () => {
  it('権限拒否は端末設定の確認を促す', () => {
    expect(messageFor('not-allowed')).toBe(
      'マイクの使用が許可されていません。端末の設定を確認してください',
    )
    expect(messageFor('service-not-allowed')).toBe(
      'マイクの使用が許可されていません。端末の設定を確認してください',
    )
  })

  it('無音は聞き取れなかった旨を返す', () => {
    expect(messageFor('no-speech')).toBe('音声が聞き取れませんでした')
  })

  it('マイク未検出はその旨を返す', () => {
    expect(messageFor('audio-capture')).toBe('マイクが見つかりませんでした')
  })

  it('未知のコードは汎用メッセージにフォールバックする', () => {
    expect(messageFor('network')).toBe('音声入力でエラーが発生しました')
    expect(messageFor('')).toBe('音声入力でエラーが発生しました')
  })
})
