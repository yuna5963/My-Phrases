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
const HIDDEN_PREFIXES = ['/daily', '/compose', '/long-reading', '/cloze', '/phrase', '/example/']

export default function BottomNav() {
  const { pathname } = useLocation()
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <ul className="flex">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 whitespace-nowrap py-2.5 text-xs ${
                  isActive
                    ? 'text-sky-500'
                    : 'text-slate-400 dark:text-slate-500'
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
