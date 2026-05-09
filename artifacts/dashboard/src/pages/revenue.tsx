import { useState, useMemo } from 'react'
import {
  useGetRevenue,
  useTriggerRevenueSync,
  runQuery,
} from '@workspace/api-client-react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { COMPANIES_SEED, COMPANY_IDS } from '@/lib/data/companies'
import { ChartRenderer, CHART_THEME, type ChartSpec } from '@/components/charts'

const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

const REVENUE_COMPANIES = COMPANIES_SEED.filter(c => c.id !== COMPANY_IDS.ELEVEN_HILLS)

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

const STORE_PALETTE = [
  '#c8a96e','#7eb8d4','#85c49a','#b88ecb','#e07b7b',
  '#f0c060','#60c0c0','#c07860','#a0c0a0','#d4a0b0',
  '#80a8d0','#d0b080','#90d0b0','#c0a0d0','#d09080',
]

const GOLD = CHART_THEME.gold

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

  const companyBreakdown = useMemo(() => {
    const byCompany: Record<string, number> = {}
    for (const r of combinedRows) {
      byCompany[r.company_id] = (byCompany[r.company_id] ?? 0) + parseFloat(r.amount)
    }

    return REVENUE_COMPANIES
      .map(c => ({
        id: c.id,
        name: c.name,
        amount: byCompany[c.id] ?? 0,
        color: COMPANY_COLORS[c.id] ?? '#888',
      }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [combinedRows])

  const storeBreakdown = useMemo(() => {
    const byStore: Record<string, number> = {}
    for (const r of storeRows) {
      const storeName = (r.category ?? '').replace(/^매출 - /, '')
      byStore[storeName] = (byStore[storeName] ?? 0) + parseFloat(r.amount)
    }

    return Object.entries(byStore)
      .map(([name, amount], i) => ({
        id: name,
        name,
        amount,
        color: STORE_PALETTE[i % STORE_PALETTE.length],
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [storeRows])

  const years = [currentYear - 1, currentYear]

  // ── Chart specs ──────────────────────────────────────────────────────────
  const totalKpi: ChartSpec = {
    id: 'kpi.totalRevenue',
    title_ko: `연간 총 매출 (${selectedYear})`,
    viz: { kind: 'kpi', format: 'krwFull', accent: GOLD },
    data: [{ value: totalRevenue }],
  }

  const companyCountKpi: ChartSpec = {
    id: 'kpi.companyCount',
    title_ko: '회사 수',
    viz: { kind: 'kpi', format: (v) => `${v}개` },
    data: [{ value: companyBreakdown.length }],
  }

  const monthlyAvgKpi: ChartSpec = {
    id: 'kpi.monthlyAverage',
    title_ko: '월 평균 매출',
    viz: { kind: 'kpi', format: 'krwFull' },
    data: [{ value: totalRevenue / 12 }],
  }

  const monthlyTrendSpec: ChartSpec = {
    id: 'chart.monthlyTrend',
    title_ko: '월별 매출 추이',
    viz: {
      kind: 'bar',
      xKey: 'month',
      yFormat: 'krw',
      series: [{ key: 'amount', label: '매출', color: GOLD }],
    },
    data: monthlyTrendData,
  }

  const companyTableSpec: ChartSpec = {
    id: 'table.companyBreakdown',
    title_ko: '회사별 연간 매출',
    viz: {
      kind: 'table',
      totalRow: true,
      emptyMessage: '해당 연도의 매출 데이터가 없습니다.',
      columns: [
        { key: 'name', label: '회사', colorKey: 'color' },
        { key: 'amount', label: '연간 매출', align: 'right', format: 'krwFull' },
        { key: 'amount', label: '비중', align: 'right', percentOf: 'amount', colorKey: 'color' },
      ],
    },
    data: companyBreakdown,
  }

  const storeTableSpec: ChartSpec = {
    id: 'table.storeBreakdown',
    viz: {
      kind: 'table',
      totalRow: true,
      columns: [
        { key: 'name', label: '매장', colorKey: 'color' },
        { key: 'amount', label: '누적 매출', align: 'right', format: 'krwFull' },
        { key: 'amount', label: '비중', align: 'right', percentOf: 'amount', colorKey: 'color' },
      ],
    },
    data: storeBreakdown,
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="border-l-2 pl-4" style={{ borderColor: GOLD }}>
          <p className="text-[11px] font-mono tracking-widest uppercase mb-1" style={{ color: CHART_THEME.textLabel }}>
            Revenue
          </p>
          <h1 className="text-2xl font-bold" style={{ color: CHART_THEME.text }}>매출 현황</h1>
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
              style={{ color: syncMessage.ok ? CHART_THEME.success : CHART_THEME.danger }}
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

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <ChartRenderer
          spec={totalKpi}
          isLoading={isTotalsLoading}
          className="col-span-2 md:col-span-1"
        />
        <ChartRenderer spec={companyCountKpi} />
        <ChartRenderer spec={monthlyAvgKpi} isLoading={isTotalsLoading} />
      </div>

      {/* Monthly trend chart */}
      <ChartRenderer
        spec={monthlyTrendSpec}
        isLoading={isLoading}
        isError={isError}
        headerRight={
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
        }
      />

      {/* Per-company breakdown table */}
      <ChartRenderer spec={companyTableSpec} isLoading={isLoading} />

      {/* City of Dreams per-store breakdown */}
      {!isLoading && storeBreakdown.length > 0 && (
        <div className="rounded-xl p-5 md:p-6" style={CHART_THEME.card}>
          <div className="flex items-center gap-3 mb-4">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: COMPANY_COLORS[COMPANY_IDS.CITY_OF_DREAMS] }}
            />
            <p className="text-sm font-semibold" style={{ color: CHART_THEME.text }}>
              씨티오브드림스 — 매장별 매출 ({selectedYear})
            </p>
          </div>
          <ChartRenderer spec={storeTableSpec} card={false} />
        </div>
      )}

      {/* Data Studio embedded report */}
      <div className="rounded-xl p-5 md:p-6" style={CHART_THEME.card}>
        <p className="text-sm font-semibold mb-4" style={{ color: CHART_THEME.text }}>리포트</p>
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
