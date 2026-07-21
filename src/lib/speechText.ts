/**
 * 音声認識で確定した断片を、いま入力済みのテキストへ足す。
 * newline=true（意味ノード）なら1発話=1行、false（自由記述）なら空白区切りで続ける。
 */
export function appendSpoken(
  current: string,
  fragment: string,
  opts?: { newline?: boolean },
): string {
  const piece = fragment.trim()
  if (piece === '') return current
  // 何も書いていない状態（空白だけを含む）から始めるときは区切りを足さない。
  if (current.trim() === '') return piece
  const sep = opts?.newline ? '\n' : ' '
  // すでに区切り（改行や空白）で終わっているなら重ねない。
  if (/\s$/.test(current)) return current + piece
  return current + sep + piece
}
