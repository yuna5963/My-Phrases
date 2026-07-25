import { NavLink, useLocation } from 'react-router-dom'

// ラベルはネイティブアプリのフォント拡大（端末のフォントサイズ設定が
// WebView に反映される）でも1行に収まる短さにする。
const tabs = [
  { to: '/', label: 'ホーム', icon: '🏠' },
  { to: '/browse', label: 'チャンク', icon: '📚' },
  { to: '/examples', label: '例文', icon: '📝' },
  { to: '/chat', label: 'チャット', icon: '💬' },
  { to: '/settings', label: '設定', icon: '⚙️' },
]

// Full-screen practice routes hide the nav so its fixed bar can't overlap
// the on-screen action buttons.
// '/example/'（例文カード）は末尾スラッシュ付きで判定する（'/examples' と前方一致で衝突するため）。
// チャット練習はタブの1つなのでナビを出したまま（v1.0.1で全画面をやめ、他タブと統一。
// 入力バーはナビの上に収まり、キーボード表示中はビューポート縮小で全体が持ち上がる）。
const HIDDEN_PREFIXES = ['/daily', '/compose', '/long-reading', '/phrase', '/example/']

export default function BottomNav() {
  const { pathname } = useLocation()
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-carbon-hairline bg-white dark:border-carbon-line-dark dark:bg-carbon-ink">
      <ul className="flex">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.to === '/'}
              // Carbonのタブ選択＝2pxの青バー＋ink文字（下部ナビでは上辺に置く）
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 whitespace-nowrap border-t-2 py-2.5 text-xs ${
                  isActive
                    ? 'border-carbon-blue font-semibold text-carbon-ink dark:border-carbon-blue-40 dark:text-white'
                    : 'border-transparent text-carbon-ink-subtle'
                }`
              }
            >
              <span className="text-lg">{t.icon}</span>
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
