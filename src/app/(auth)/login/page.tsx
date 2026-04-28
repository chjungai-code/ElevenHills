'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // No Supabase configured — dev bypass
      router.push('/')
      router.refresh()
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0b0c10' }}>
      <div className="w-full max-w-sm">
        {/* Logo block */}
        <div className="mb-8 pl-4 border-l-2" style={{ borderColor: '#c8a96e' }}>
          <p className="text-xs font-mono tracking-widest uppercase mb-1" style={{ color: '#6a6a80' }}>
            Corporate Governance
          </p>
          <h1 className="text-2xl font-bold" style={{ color: '#f4eedd' }}>
            일레븐힐스
          </h1>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-xl p-6 space-y-4"
          style={{ background: '#13141a', border: '1px solid #272836' }}
        >
          <h2 className="text-sm font-mono tracking-widest uppercase" style={{ color: '#6a6a80' }}>
            로그인
          </h2>

          <div className="space-y-1">
            <label className="block text-xs" style={{ color: '#6a6a80' }}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: '#1c1d26', border: '1px solid #272836', color: '#e8e4dc' }}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs" style={{ color: '#6a6a80' }}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: '#1c1d26', border: '1px solid #272836', color: '#e8e4dc' }}
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#c8a96e', color: '#0b0c10' }}
          >
            {loading ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
