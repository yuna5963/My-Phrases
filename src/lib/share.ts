// CSV を端末に保存/共有する。モバイルでは OS の共有シート（メール・Drive 等）を優先し、
// 使えない環境ではファイルとしてダウンロードする。
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

export async function shareOrDownloadCsv(
  filename: string,
  csv: string,
): Promise<ShareOutcome> {
  const file = new File([csv], filename, { type: 'text/csv' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      // ユーザーが共有シートを閉じただけならダウンロードに切り替えない。
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(file, filename)
  return 'downloaded'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // click 直後に revoke するとダウンロードが始まらない端末があるため遅延させる。
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
