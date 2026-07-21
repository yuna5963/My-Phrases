/** 認識エラーコードを、利用者が次の行動を取れる日本語にする。両エンジン共用。 */
export function messageFor(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'マイクの使用が許可されていません。端末の設定を確認してください'
    case 'no-speech':
      return '音声が聞き取れませんでした'
    case 'audio-capture':
      return 'マイクが見つかりませんでした'
    default:
      return '音声入力でエラーが発生しました'
  }
}
