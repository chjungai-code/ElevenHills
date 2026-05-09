import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { CartesianViz } from '../types'
import { resolveFormatter } from '../formatters'
import { CHART_THEME } from '../theme'

type Props = {
  viz: CartesianViz
  data: Record<string, unknown>[]
}

export function CartesianChart({ viz, data }: Props) {
  const yFmt = resolveFormatter(viz.yFormat)
  const height = viz.height ?? 220

  const axisCommon = {
    tick: { fill: CHART_THEME.textLabel, fontSize: 11 },
    axisLine: false,
    tickLine: false,
  } as const

  const tooltipProps = {
    contentStyle: {
      background: CHART_THEME.panelBg,
      border: `1px solid ${CHART_THEME.cardBorder}`,
      borderRadius: 8,
    },
    labelStyle: { color: CHART_THEME.textMuted, fontSize: 12 },
    itemStyle: { color: CHART_THEME.text },
    formatter: (v: number, name: string) => [yFmt(v), name],
  } as const

  const showLegend = viz.series.length > 1

  const renderSeries = () => {
    if (viz.kind === 'bar') {
      return viz.series.map((s) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label ?? s.key}
          fill={s.color ?? CHART_THEME.gold}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          stackId={viz.stacked ? 'stack' : undefined}
        />
      ))
    }
    if (viz.kind === 'line') {
      return viz.series.map((s) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label ?? s.key}
          stroke={s.color ?? CHART_THEME.gold}
          strokeWidth={2}
          dot={false}
        />
      ))
    }
    return viz.series.map((s) => (
      <Area
        key={s.key}
        type="monotone"
        dataKey={s.key}
        name={s.label ?? s.key}
        stroke={s.color ?? CHART_THEME.gold}
        fill={s.color ?? CHART_THEME.gold}
        fillOpacity={0.2}
        stackId={viz.stacked ? 'stack' : undefined}
      />
    ))
  }

  const ChartComponent =
    viz.kind === 'bar' ? BarChart : viz.kind === 'line' ? LineChart : AreaChart

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent data={data} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
        <XAxis dataKey={viz.xKey} {...axisCommon} />
        <YAxis tickFormatter={yFmt} width={60} {...axisCommon} />
        <Tooltip {...tooltipProps} />
        {showLegend && (
          <Legend wrapperStyle={{ fontSize: 11, color: CHART_THEME.textMuted }} />
        )}
        {renderSeries()}
      </ChartComponent>
    </ResponsiveContainer>
  )
}
