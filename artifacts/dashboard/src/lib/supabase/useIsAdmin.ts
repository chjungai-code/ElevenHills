import { useEffect, useState } from 'react'
import { createClient, isSupabaseConfigured } from './client'

const adminEmails = ((import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

function checkAdmin(email: string | undefined, role: string | undefined): boolean {
  if (role === 'admin') return true
  if (email && adminEmails.includes(email.toLowerCase())) return true
  return false
}

const devBypassEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ADMIN_DEV_BYPASS === '1'

export function useIsAdmin(): boolean {
  // Default-deny. A dev bypass is available only when explicitly opted in
  // via VITE_ADMIN_DEV_BYPASS=1 in a non-production build.
  const [isAdmin, setIsAdmin] = useState<boolean>(
    !isSupabaseConfigured && devBypassEnabled,
  )

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = createClient()
    let mounted = true

    const apply = (user: { email?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined) => {
      if (!mounted) return
      const role =
        (user?.app_metadata?.role as string | undefined) ??
        (user?.user_metadata?.role as string | undefined)
      setIsAdmin(checkAdmin(user?.email, role))
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session?.user))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user))

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return isAdmin
}
