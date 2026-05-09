import { Link, useLocation } from 'wouter'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/supabase/useCurrentUser'

const NAV = [
  { href: '/',            label: '전체 현황',   icon: '◈' },
  { href: '/governance',  label: '지배구조',    icon: '⬡' },
  { href: '/revenue',     label: '매출 현황',   icon: '◉' },
  { href: '/reports',     label: '성과지표',     icon: '▦' },
]

export default function Sidebar() {
  const [pathname, setLocation] = useLocation()
  const userLabel = useCurrentUser()

  async function handleLogout() {
    if (isSupabaseConfigured) {
      const supabase = createClient()
      await supabase.auth.signOut()
    }
    setLocation('/login')
  }

  return (
    <aside
      className="hidden md:flex w-56 min-h-screen flex-col py-6 px-4 shrink-0"
      style={{ background: '#0f1014', borderRight: '1px solid #1e1f2a' }}
    >
      {/* Brand */}
      <div className="mb-8 pl-3 border-l-2" style={{ borderColor: '#c8a96e' }}>
        <p className="text-[10px] font-mono tracking-widest uppercase mb-0.5" style={{ color: '#6a6a80' }}>
          Corporate Gov.
        </p>
        <span className="text-base font-bold" style={{ color: '#f4eedd' }}>일레븐힐스</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
              style={{
                background: active ? '#1c1d26' : 'transparent',
                color: active ? '#c8a96e' : '#8a8a9a',
                border: active ? '1px solid #272836' : '1px solid transparent',
              }}
            >
              <span className="text-xs">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="flex flex-col gap-1">
        {userLabel && (
          <div
            className="px-3 pt-2 pb-1 text-[10px] font-mono truncate"
            style={{ color: '#8a8a9a' }}
            title={userLabel}
          >
            {userLabel}
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors hover:opacity-70"
          style={{ color: '#6a6a80' }}
        >
          <span className="text-xs">⇥</span>
          로그아웃
        </button>
      </div>
    </aside>
  )
}
