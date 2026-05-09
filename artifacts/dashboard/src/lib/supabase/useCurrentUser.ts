import { useEffect, useState } from 'react'
import { createClient, isSupabaseConfigured } from './client'

export function useCurrentUser(): string | null {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = createClient()
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const user = data.session?.user
      setLabel(user ? (user.email ?? user.user_metadata?.name ?? null) : null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setLabel(user ? (user.email ?? user.user_metadata?.name ?? null) : null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return label
}
