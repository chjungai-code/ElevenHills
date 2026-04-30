import { useEffect, useState } from 'react'
import { Switch, Route, Router as WouterRouter, useLocation } from 'wouter'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import Sidebar from '@/components/layout/Sidebar'
import MobileTopBar from '@/components/layout/MobileTopBar'
import MobileBottomNav from '@/components/layout/MobileBottomNav'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

import LoginPage from '@/pages/login'
import HomePage from '@/pages/home'
import GovernancePage from '@/pages/governance'
import CompanyDetailPage from '@/pages/governance-detail'
import RevenuePage from '@/pages/revenue'
import ReportsPage from '@/pages/reports'
import NotFound from '@/pages/not-found'

const queryClient = new QueryClient()

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col md:flex-row min-h-screen w-full overflow-x-hidden"
      style={{ background: '#0b0c10', color: '#e8e4dc' }}
    >
      <MobileTopBar />
      <Sidebar />
      <main
        className="flex-1 min-w-0 overflow-y-auto px-4 pt-4 md:p-8 main-mobile-pb"
      >
        {children}
      </main>
      <MobileBottomNav />
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation()
  const [checked, setChecked] = useState(!isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (!user) {
        setLocation('/login')
      } else {
        setChecked(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [setLocation])

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0b0c10' }}>
        <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#6a6a80' }}>
          Loading…
        </p>
      </div>
    )
  }

  return <DashboardLayout>{children}</DashboardLayout>
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <Protected>
          <HomePage />
        </Protected>
      </Route>
      <Route path="/governance">
        <Protected>
          <GovernancePage />
        </Protected>
      </Route>
      <Route path="/governance/:id">
        <Protected>
          <CompanyDetailPage />
        </Protected>
      </Route>
      <Route path="/revenue">
        <Protected>
          <RevenuePage />
        </Protected>
      </Route>
      <Route path="/reports">
        <Protected>
          <ReportsPage />
        </Protected>
      </Route>
      <Route component={NotFound} />
    </Switch>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  )
}

export default App
