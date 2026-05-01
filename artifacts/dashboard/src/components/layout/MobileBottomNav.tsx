import { Link, useLocation } from 'wouter'

const NAV = [
  { href: '/',           label: '현황',     icon: '◈' },
  { href: '/governance', label: '지배구조', icon: '⬡' },
  { href: '/revenue',    label: '매출',     icon: '◉' },
  { href: '/reports',    label: '성과지표',  icon: '▦' },
]

export default function MobileBottomNav() {
  const [pathname] = useLocation()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        background: 'rgba(11, 12, 16, 0.94)',
        borderTop: '1px solid #1e1f2a',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV.map(({ href, label, icon }) => {
        const active =
          pathname === href ||
          (href !== '/' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors active:opacity-70"
            style={{
              color: active ? '#c8a96e' : '#6a6a80',
            }}
          >
            <span className="text-base leading-none">{icon}</span>
            <span
              className="text-[10px] font-medium tracking-wider"
              style={{ color: active ? '#c8a96e' : '#8a8a9a' }}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
