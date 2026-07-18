// テキストファイル（CSV・バックアップJSON）を端末に保存/共有する。
// ネイティブアプリ（Capacitor WebView）では blob の <a download> も
// navigator.share({files}) も機能しないため、Filesystem プラグインで
// 公開 Documents フォルダへ直接書き込む（Filesアプリ等から見える）。
// Webではこれまでどおり OS の共有シートを優先し、だめならダウンロードする。
import { isNativeApp } from './platform'

export type ShareOutcome = 'shared' | 'downloaded' | 'saved' | 'cancelled' | 'failed'

export async function shareOrDownloadCsv(filename: string, csv: string): Promise<ShareOutcome> {
  return shareOrDownloadText(filename, csv, 'text/csv')
}

export async function shareOrDownloadText(
  filename: string,
  content: string,
  mime: string,
): Promise<ShareOutcome> {
  if (isNativeApp) return saveToDocumentsNative(filename, content)

  const file = new File([content], filename, { type: mime })
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

/**
 * ネイティブ: 公開 Documents フォルダへ保存する。
 * Android 11+ ではアプリが作成したファイルへ無許可で書けるが、
 * Android 10 以前のために念のためストレージ権限を確認する。
 * プラグインは動的 import（Webバンドルに Capacitor を混入させないため）。
 */
async function saveToDocumentsNative(filename: string, content: string): Promise<ShareOutcome> {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try {
      const st = await Filesystem.checkPermissions()
      if (st.publicStorage === 'prompt') await Filesystem.requestPermissions()
    } catch {
      // 権限APIが無い/失敗しても書き込み自体を試す（Android 11+ は権限不要）。
    }
    await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return 'saved'
  } catch {
    return 'failed'
  }
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
