import type { Formatter, FORMATTERS } from './formatters'

export type FormatHint = Formatter | keyof typeof FORMATTERS

export type Series = {
  key: string
  label?: string
  color?: string
}

export type CartesianViz = {
  kind: 'line' | 'bar' | 'area'
  xKey: string
  series: Series[]
  yFormat?: FormatHint
  height?: number
  stacked?: boolean
}

export type KpiViz = {
  kind: 'kpi'
  valueKey?: string
  format?: FormatHint
  accent?: string
}

export type TableColumn = {
  key: string
  label: string
  align?: 'left' | 'right'
  format?: FormatHint
  /** Render a coloured dot before the cell value. Pass a row key whose value is the colour. */
  colorKey?: string
  /** When set, format value as a share of `totalKey`'s sum and colour with row's `colorKey`. */
  percentOf?: string
}

export type TableViz = {
  kind: 'table'
  columns: TableColumn[]
  totalRow?: boolean
  emptyMessage?: string
}

export type Viz = CartesianViz | KpiViz | TableViz

export type ChartSpec<TRow = Record<string, unknown>> = {
  id: string
  title_ko?: string
  /** Reserved for the future SQL/JSON query layer. Not consumed by the renderer yet. */
  query?: unknown
  viz: Viz
  /** Optional sub-label rendered next to the title (e.g. KPI subtitle). */
  subtitle_ko?: string
  /** Inline data; pages compute this from API hooks for now. */
  data?: TRow[]
}
