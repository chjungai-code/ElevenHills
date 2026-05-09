import type { KpiViz } from '../types'
import { resolveFormatter } from '../formatters'
import { CHART_THEME } from '../theme'

type Props = {
  viz: KpiViz
  data: Record<string, unknown>[]
  title_ko?: string
  subtitle_ko?: string
}

export function KpiCard({ viz, data, title_ko, subtitle_ko }: Props) {
  const row = data[0] ?? {}
  const valueKey = viz.valueKey ?? 'value'
  const raw = row[valueKey]
  const fmt = resolveFormatter(viz.format)
  const accent = viz.accent ?? CHART_THEME.text
  const display = typeof raw === 'number' ? fmt(raw) : (raw == null ? '—' : String(raw))

  return (
    <>
      <p
        className="text-[10px] font-mono tracking-widest uppercase mb-2"
        style={{ color: CHART_THEME.textLabel }}
      >
        {title_ko}
      </p>
      <p className="text-xl md:text-2xl font-bold" style={{ color: accent }}>
        {display}
      </p>
      {subtitle_ko && (
        <p
          className="text-[10px] font-mono tracking-widest uppercase mt-2"
          style={{ color: CHART_THEME.textLabel }}
        >
          {subtitle_ko}
        </p>
      )}
    </>
  )
}
