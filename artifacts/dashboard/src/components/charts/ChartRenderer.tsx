import type { ChartSpec } from './types'
import { CartesianChart } from './viz/CartesianChart'
import { KpiCard } from './viz/KpiCard'
import { DataTable } from './viz/DataTable'
import { CHART_THEME } from './theme'

type Props = {
  spec: ChartSpec
  /** Override spec.data — useful when data comes from a hook. */
  data?: Record<string, unknown>[]
  /** Loading state shows a placeholder appropriate to the viz kind. */
  isLoading?: boolean
  isError?: boolean
  /** Optional element rendered to the right of the title (e.g. a filter dropdown). */
  headerRight?: React.ReactNode
  /** Wrap in the dark card chrome (default true). Set false to embed in custom layout. */
  card?: boolean
  className?: string
}

export function ChartRenderer({
  spec,
  data,
  isLoading,
  isError,
  headerRight,
  card = true,
  className,
}: Props) {
  const rows = data ?? spec.data ?? []
  const padding = spec.viz.kind === 'kpi' ? 'p-4 md:p-5' : 'p-5 md:p-6'

  const body = (() => {
    if (isError) {
      return (
        <div className="h-32 flex items-center justify-center">
          <p className="text-xs" style={{ color: CHART_THEME.danger }}>
            데이터를 불러오지 못했습니다.
          </p>
        </div>
      )
    }
    if (isLoading) {
      return (
        <div className="h-32 flex items-center justify-center">
          <p
            className="text-xs font-mono tracking-widest uppercase animate-pulse"
            style={{ color: CHART_THEME.textLabel }}
          >
            데이터 로딩 중…
          </p>
        </div>
      )
    }
    switch (spec.viz.kind) {
      case 'kpi':
        return (
          <KpiCard
            viz={spec.viz}
            data={rows}
            title_ko={spec.title_ko}
            subtitle_ko={spec.subtitle_ko}
          />
        )
      case 'table':
        return <DataTable viz={spec.viz} data={rows} />
      case 'bar':
      case 'line':
      case 'area':
        return <CartesianChart viz={spec.viz} data={rows} />
    }
  })()

  if (!card) return <div className={className}>{body}</div>

  // KPI cards: title is rendered inside KpiCard for layout reasons.
  if (spec.viz.kind === 'kpi') {
    return (
      <div className={`rounded-xl ${padding} ${className ?? ''}`} style={CHART_THEME.card}>
        {body}
      </div>
    )
  }

  return (
    <div className={`rounded-xl ${padding} ${className ?? ''}`} style={CHART_THEME.card}>
      {(spec.title_ko || headerRight) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {spec.title_ko && (
            <p className="text-sm font-semibold" style={{ color: CHART_THEME.text }}>
              {spec.title_ko}
            </p>
          )}
          {headerRight}
        </div>
      )}
      {body}
    </div>
  )
}
