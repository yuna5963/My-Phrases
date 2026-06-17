import { useState } from 'react'

/**
 * Shown when the browser can't do speech synthesis (e.g. Firefox for Android),
 * pointing the user to a supported browser. Dismissal is remembered locally.
 */
export default function SupportBanner({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('tts-warn-dismissed') === '1',
  )
  if (!show || dismissed) return null
  return (
    <div className="safe-top bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <span aria-hidden>🔇</span>
        <p className="flex-1">
          このブラウザは音声読み上げに対応していません。発音・読み上げを使うには{' '}
          <strong>Chrome</strong>（Android）や <strong>Safari</strong>（iPhone）で開いてください。
          <br />
          <span className="text-amber-700 dark:text-amber-200/80">
            ※ 音声以外の練習はこのまま使えます。
          </span>
        </p>
        <button
          onClick={() => {
            localStorage.setItem('tts-warn-dismissed', '1')
            setDismissed(true)
          }}
          aria-label="閉じる"
          className="shrink-0 px-1 text-amber-700 dark:text-amber-300"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
