import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  useGetRevenue,
  useTriggerRevenueSync,
  runQuery,
} from '@workspace/api-client-react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { COMPANIES_SEED, COMPANY_IDS } from '@/lib/data/companies'

const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

// Companies that have revenue (exclude the holding company)
const REVENUE_COMPANIES = COMPANIES_SEED.filter(c => c.id !== COMPANY_IDS.ELEVEN_HILLS)

// Colour palette for companies
const COMPANY_COLORS: Record<string, string> = {
  [COMPANY_IDS.COD_RETAIL]:     '#c8a96e',
  [COMPANY_IDS.COD_VISION]:     '#7eb8d4',
  [COMPANY_IDS.TAEMAN_WORLD]:   '#85c49a',
  [COMPANY_IDS.SGD_PARTNERS]:   '#b88ecb',
  [COMPANY_IDS.NRD]:            '#e07b7b',
  [COMPANY_IDS.CITY_OF_DREAMS]: '#f0c060',
  [COMPANY_IDS.COD_SPORTS]:     '#60c0c0',
  [COMPANY_IDS.BNF_SPORTS]:     '#c07860',
}

// Palette for per-store colours (cycles through these)
const STORE_PALETTE = [
  '#c8a96e','#7eb8d4','#85c49a','#b88ecb','#e07b7b',
  '#f0c060','#60c0c0','#c07860','#a0c0a0','#d4a0b0',
  '#80a8d0','#d0b080','#90d0b0','#c0a0d0','#d09080',
]

function formatKRW(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${Math.round(value / 10_000)}만`
  return value.toLocaleString()
}

function formatKRWFull(value: number): string {
  if (value >= 100_000_000) {
    return `₩${(value / 100_000_000).toFixed(2)}억`
  }
  return `₩${Math.round(value / 10_000).toLocaleString()}만`
}

const CARD_STYLE = { background: '#13141a', border: '1px solid #272836' }
const LABEL_STYLE = { color: '#6a6a80' }
const VALUE_STYLE = { color: '#f4eedd' }
const GOLD = '#c8a96e'

export default function RevenuePage() {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all')
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const queryClient = useQueryClient()
  const { mutate: triggerSync, isPending: isSyncing } = useTriggerRevenueSync({
    mutation: {
      onSuccess: (data) => {
        setSyncMessage({ ok: data.success, text: data.message })
        if (data.success) {
          queryClient.invalidateQueries({ queryKey: ['/api/revenue'] })
        }
        setTimeout(() => setSyncMessage(null), 6000)
      },
      onError: () => {
        setSyncMessage({ ok: false, text: '싱크 요청 중 오류가 발생했습니다.' })
        setTimeout(() => setSyncMessage(null), 6000)
      },
    },
  })

  const { data: allRows = [], isLoading, isError } = useGetRevenue({ year: selectedYear })

  // Separate combined ("매출") rows from per-store ("매출 - X") rows
  const combinedRows = useMemo(
    () => allRows.filter(r => r.category === '매출'),
    [allRows],
  )
  const storeRows = useMemo(
    () => allRows.filter(
      r => r.company_id === COMPANY_IDS.CITY_OF_DREAMS && (r.category ?? '').startsWith('매출 - '),
    ),
    [allRows],
  )

  // Total revenue for the selected year — computed by the server-side metric
  // registry (POST /api/query) instead of a client-side useMemo aggregation.
  // This ensures every page that asks for "total_revenue" gets the same number.
  const {
    data: totalsQuery,
    isLoading: isTotalsLoading,
  } = useQuery({
    queryKey: ['/api/query', 'total_revenue', selectedYear],
    queryFn: () =>
      runQuery({
        dataset: 'revenue',
        metrics: ['total_revenue'],
        time_range: { kind: 'year', year: selectedYear },
      }),
  })
  const totalRevenue = useMemo(() => {
    const v = totalsQuery?.rows?.[0]?.total_revenue
    return typeof v === 'number' ? v : 0
  }, [totalsQuery])

  // Monthly trend data — aggregated across all companies or filtered by company
  // Uses combined rows only to avoid double-counting store + total
  const monthlyTrendData = useMemo(() => {
    const source = selectedCompanyId === 'all'
      ? combinedRows
      : combinedRows.filter(r => r.company_id === selectedCompanyId)

    const byMonth: Record<number, number> = {}
    for (const r of source) {
      byMonth[r.month] = (byMonth[r.month] ?? 0) + parseFloat(r.amount)
    }

    return MONTH_LABELS.map((label, i) => ({
      month: label,
      amount: byMonth[i + 1] ?? 0,
    }))
  }, [combinedRows, selectedCompanyId])

  // Per-company YTD breakdown (combined rows only)
  const companyBreakdown = useMemo(() => {
    const byCompany: Record<string, number> = {}
    for (const r of combinedRows) {
      byCompany[r.company_id] = (byCompany[r.company_id] ?? 0) + parseFloat(r.amount)
    }

    return REVENUE_COMPANIES
      .map(c => ({
        id: c.id,
        name: c.name,
        short: c.short_name ?? c.name,
        amount: byCompany[c.id] ?? 0,
        color: COMPANY_COLORS[c.id] ?? '#888',
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [combinedRows])

  // Per-store breakdown for City of Dreams
  const storeBreakdown = useMemo(() => {
    const byStore: Record<string, number> = {}
    for (const r of storeRows) {
      const storeName = (r.category ?? '').replace(/^매출 - /, '')
      byStore[storeName] = (byStore[storeName] ?? 0) + parseFloat(r.amount)
    }

    return Object.entries(byStore)
      .map(([name, amount], i) => ({
        name,
        amount,
        color: STORE_PALETTE[i % STORE_PALETTE.length],
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [storeRows])

  const storeTotalRevenue = useMemo(
    () => storeBreakdown.reduce((sum, s) => sum + s.amount, 0),
    [storeBreakdown],
  )

  const years = [currentYear - 1, currentYear]

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="border-l-2 pl-4" style={{ borderColor: GOLD }}>
          <p className="text-[11px] font-mono tracking-widest uppercase mb-1" style={LABEL_STYLE}>
            Revenue
          </p>
          <h1 className="text-2xl font-bold" style={VALUE_STYLE}>매출 현황</h1>
        </div>
        <div className="flex flex-col items-end gap-2 pt-1">
          <button
            onClick={() => triggerSync()}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono transition-all disabled:opacity-50"
            style={{ background: '#13141a', border: `1px solid ${GOLD}40`, color: GOLD }}
          >
            <span
              className={isSyncing ? 'animate-spin inline-block' : 'inline-block'}
              style={{ fontSize: 14 }}
            >
              {isSyncing ? '⟳' : '↻'}
            </span>
            {isSyncing ? '싱크 중…' : '구글 시트 싱크'}
          </button>
          {syncMessage && (
            <p
              className="text-xs font-mono max-w-xs text-right"
              style={{ color: syncMessage.ok ? '#85c49a' : '#e07b7b' }}
            >
              {syncMessage.ok ? '✓ ' : '✗ '}{syncMessage.text}
            </p>
          )}
        </div>
      </div>

      {/* Year selector */}
      <div className="flex gap-2">
        {years.map(y => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className="px-4 py-1.5 rounded-lg text-sm font-mono transition-colors"
            style={
              selectedYear === y
                ? { background: GOLD, color: '#0b0c10' }
                : { background: '#13141a', border: '1px solid #272836', color: '#9a9ab0' }
            }
          >
            {y}년
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl p-4 md:p-5 col-span-2 md:col-span-1" style={CARD_STYLE}>
          <p className="text-[10px] font-mono tracking-widest uppercase mb-2" style={LABEL_STYLE}>
            연간 총 매출 ({selectedYear})
          </p>
          {isTotalsLoading ? (
            <p className="text-xl font-bold animate-pulse" style={{ color: '#6a6a80' }}>—</p>
          ) : (
            <p className="text-xl md:text-2xl font-bold" style={{ color: GOLD }}>
              {formatKRWFull(totalRevenue)}
            </p>
          )}
        </div>
        <div className="rounded-xl p-4 md:p-5" style={CARD_STYLE}>
          <p className="text-[10px] font-mono tracking-widest uppercase mb-2" style={LABEL_STYLE}>
            회사 수
          </p>
          <p className="text-xl md:text-2xl font-bold" style={VALUE_STYLE}>
            {companyBreakdown.filter(c => c.amount > 0).length}개
          </p>
        </div>
        <div className="rounded-xl p-4 md:p-5" style={CARD_STYLE}>
          <p className="text-[10px] font-mono tracking-widest uppercase mb-2" style={LABEL_STYLE}>
            월 평균 매출
          </p>
          {isTotalsLoading ? (
            <p className="text-xl font-bold animate-pulse" style={{ color: '#6a6a80' }}>—</p>
          ) : (
            <p className="text-xl md:text-2xl font-bold" style={VALUE_STYLE}>
              {formatKRWFull(totalRevenue / 12)}
            </p>
          )}
        </div>
      </div>

      {/* Monthly trend chart */}
      <div className="rounded-xl p-5 md:p-6" style={CARD_STYLE}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <p className="text-sm font-semibold" style={VALUE_STYLE}>월별 매출 추이</p>
          <select
            value={selectedCompanyId}
            onChange={e => setSelectedCompanyId(e.target.value)}
            className="text-xs rounded-lg px-3 py-1.5 font-mono outline-none"
            style={{ background: '#1a1b24', border: '1px solid #272836', color: '#e8e4dc' }}
          >
            <option value="all">전체 합산</option>
            {REVENUE_COMPANIES.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="h-56 flex items-center justify-center">
            <p className="text-xs font-mono tracking-widest uppercase animate-pulse" style={LABEL_STYLE}>
              데이터 로딩 중…
            </p>
          </div>
        ) : isError ? (
          <div className="h-56 flex items-center justify-center">
            <p className="text-xs" style={{ color: '#e07b7b' }}>데이터를 불러오지 못했습니다.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyTrendData} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#272836" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#6a6a80', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatKRW}
                tick={{ fill: '#6a6a80', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{ background: '#1a1b24', border: '1px solid #272836', borderRadius: 8 }}
                labelStyle={{ color: '#9a9ab0', fontSize: 12 }}
                itemStyle={{ color: '#f4eedd' }}
                formatter={(v: number) => [formatKRWFull(v), '매출']}
              />
              <Bar dataKey="amount" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-company breakdown table */}
      <div className="rounded-xl p-5 md:p-6" style={CARD_STYLE}>
        <p className="text-sm font-semibold mb-4" style={VALUE_STYLE}>회사별 연간 매출</p>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: '#1a1b24' }} />
            ))}
          </div>
        ) : companyBreakdown.filter(c => c.amount > 0).length === 0 ? (
          <p className="text-sm text-center py-8" style={LABEL_STYLE}>
            해당 연도의 매출 데이터가 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 pb-2" style={{ borderBottom: '1px solid #272836' }}>
              <span className="col-span-5 text-[10px] font-mono tracking-widest uppercase" style={LABEL_STYLE}>
                회사
              </span>
              <span className="col-span-4 text-[10px] font-mono tracking-widest uppercase text-right" style={LABEL_STYLE}>
                연간 매출
              </span>
              <span className="col-span-3 text-[10px] font-mono tracking-widest uppercase text-right" style={LABEL_STYLE}>
                비중
              </span>
            </div>
            {companyBreakdown.map(c => {
              if (c.amount === 0) return null
              const pct = totalRevenue > 0 ? (c.amount / totalRevenue) * 100 : 0
              return (
                <div key={c.id} className="grid grid-cols-12 gap-2 py-2 items-center rounded-lg px-2 -mx-2 hover:bg-white/[0.02] transition-colors">
                  <div className="col-span-5 flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: c.color }}
                    />
                    <span className="text-sm truncate" style={VALUE_STYLE}>{c.name}</span>
                  </div>
                  <div className="col-span-4 text-right">
                    <span className="text-sm font-mono" style={VALUE_STYLE}>
                      {formatKRWFull(c.amount)}
                    </span>
                  </div>
                  <div className="col-span-3 text-right">
                    <span className="text-sm font-mono" style={{ color: c.color }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}
            {/* Total row */}
            <div
              className="grid grid-cols-12 gap-2 py-2 items-center rounded-lg px-2 -mx-2 mt-1"
              style={{ borderTop: '1px solid #272836' }}
            >
              <span className="col-span-5 text-sm font-semibold" style={{ color: GOLD }}>합계</span>
              <span className="col-span-4 text-right text-sm font-semibold font-mono" style={{ color: GOLD }}>
                {formatKRWFull(totalRevenue)}
              </span>
              <span className="col-span-3 text-right text-sm font-mono" style={{ color: GOLD }}>100%</span>
            </div>
          </div>
        )}
      </div>

      {/* City of Dreams per-store breakdown */}
      {!isLoading && storeBreakdown.length > 0 && (
        <div className="rounded-xl p-5 md:p-6" style={CARD_STYLE}>
          <div className="flex items-center gap-3 mb-4">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: COMPANY_COLORS[COMPANY_IDS.CITY_OF_DREAMS] }}
            />
            <p className="text-sm font-semibold" style={VALUE_STYLE}>
              씨티오브드림스 — 매장별 매출 ({selectedYear})
            </p>
          </div>

          <div className="space-y-2">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 pb-2" style={{ borderBottom: '1px solid #272836' }}>
              <span className="col-span-5 text-[10px] font-mono tracking-widest uppercase" style={LABEL_STYLE}>
                매장
              </span>
              <span className="col-span-4 text-[10px] font-mono tracking-widest uppercase text-right" style={LABEL_STYLE}>
                누적 매출
              </span>
              <span className="col-span-3 text-[10px] font-mono tracking-widest uppercase text-right" style={LABEL_STYLE}>
                비중
              </span>
            </div>

            {storeBreakdown.map((store) => {
              const pct = storeTotalRevenue > 0 ? (store.amount / storeTotalRevenue) * 100 : 0
              return (
                <div
                  key={store.name}
                  className="grid grid-cols-12 gap-2 py-2 items-center rounded-lg px-2 -mx-2 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="col-span-5 flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: store.color }}
                    />
                    <span className="text-sm truncate" style={VALUE_STYLE}>{store.name}</span>
                  </div>
                  <div className="col-span-4 text-right">
                    <span className="text-sm font-mono" style={VALUE_STYLE}>
                      {formatKRWFull(store.amount)}
                    </span>
                  </div>
                  <div className="col-span-3 text-right">
                    <span className="text-sm font-mono" style={{ color: store.color }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Total row */}
            <div
              className="grid grid-cols-12 gap-2 py-2 items-center rounded-lg px-2 -mx-2 mt-1"
              style={{ borderTop: '1px solid #272836' }}
            >
              <span className="col-span-5 text-sm font-semibold" style={{ color: GOLD }}>합계</span>
              <span className="col-span-4 text-right text-sm font-semibold font-mono" style={{ color: GOLD }}>
                {formatKRWFull(storeTotalRevenue)}
              </span>
              <span className="col-span-3 text-right text-sm font-mono" style={{ color: GOLD }}>100%</span>
            </div>
          </div>
        </div>
      )}

      {/* Data Studio embedded report */}
      <div className="rounded-xl p-5 md:p-6" style={CARD_STYLE}>
        <p className="text-sm font-semibold mb-4" style={VALUE_STYLE}>리포트</p>
        <iframe
          width="100%"
          height={450}
          src="https://datastudio.google.com/embed/reporting/6e12f1aa-711f-4407-a937-e68c95230244/page/mCDxF"
          frameBorder={0}
          style={{ border: 0 }}
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  )
}
