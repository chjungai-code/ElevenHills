import type { TableViz } from '../types'
import { resolveFormatter } from '../formatters'
import { CHART_THEME } from '../theme'

type Props = {
  viz: TableViz
  data: Record<string, unknown>[]
}

const COL_SPAN: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4',
  5: 'col-span-5', 6: 'col-span-6', 7: 'col-span-7', 8: 'col-span-8',
  9: 'col-span-9', 10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
}

export function DataTable({ viz, data }: Props) {
  const cols = viz.columns
  const baseSpan = Math.max(1, Math.floor(12 / cols.length))
  const lastSpan = 12 - baseSpan * (cols.length - 1)
  const spanFor = (i: number) => COL_SPAN[i === cols.length - 1 ? lastSpan : baseSpan]

  if (data.length === 0) {
    return (
      <p className="text-sm text-center py-8" style={{ color: CHART_THEME.textLabel }}>
        {viz.emptyMessage ?? '데이터가 없습니다.'}
      </p>
    )
  }

  // Pre-compute totals once for percent and total row.
  const numericTotals: Record<string, number> = {}
  for (const c of cols) {
    if (c.format === 'krw' || c.format === 'krwFull' || c.format === 'number') {
      let sum = 0
      for (const row of data) {
        const v = row[c.key]
        if (typeof v === 'number') sum += v
      }
      numericTotals[c.key] = sum
    }
  }

  const renderCell = (row: Record<string, unknown>, c: typeof cols[number]) => {
    const v = row[c.key]
    const fmt = resolveFormatter(c.format)
    const colorVal = c.colorKey ? (row[c.colorKey] as string | undefined) : undefined

    if (c.percentOf) {
      const total = numericTotals[c.percentOf] ?? 0
      const base = typeof row[c.percentOf] === 'number' ? (row[c.percentOf] as number) : 0
      const pct = total > 0 ? (base / total) * 100 : 0
      return (
        <span className="text-sm font-mono" style={{ color: colorVal ?? CHART_THEME.text }}>
          {pct.toFixed(1)}%
        </span>
      )
    }

    const displayValue = typeof v === 'number' ? fmt(v) : (v == null ? '' : String(v))

    if (c.colorKey && c.align !== 'right') {
      return (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: colorVal ?? '#888' }}
          />
          <span className="text-sm truncate" style={{ color: CHART_THEME.text }}>
            {displayValue}
          </span>
        </div>
      )
    }

    return (
      <span className="text-sm font-mono" style={{ color: CHART_THEME.text }}>
        {displayValue}
      </span>
    )
  }

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-12 gap-2 pb-2"
        style={{ borderBottom: `1px solid ${CHART_THEME.cardBorder}` }}
      >
        {cols.map((c, i) => (
          <span
            key={`${c.key}:${i}`}
            className={`${spanFor(i)} text-[10px] font-mono tracking-widest uppercase ${
              c.align === 'right' ? 'text-right' : ''
            }`}
            style={{ color: CHART_THEME.textLabel }}
          >
            {c.label}
          </span>
        ))}
      </div>

      {data.map((row, idx) => (
        <div
          key={(row.id as string) ?? idx}
          className="grid grid-cols-12 gap-2 py-2 items-center rounded-lg px-2 -mx-2 hover:bg-white/[0.02] transition-colors"
        >
          {cols.map((c, i) => (
            <div key={`${c.key}:${i}`} className={`${spanFor(i)} ${c.align === 'right' ? 'text-right' : ''}`}>
              {renderCell(row, c)}
            </div>
          ))}
        </div>
      ))}

      {viz.totalRow && (
        <div
          className="grid grid-cols-12 gap-2 py-2 items-center rounded-lg px-2 -mx-2 mt-1"
          style={{ borderTop: `1px solid ${CHART_THEME.cardBorder}` }}
        >
          {cols.map((c, i) => {
            const isFirst = i === 0
            const fmt = resolveFormatter(c.format)
            let content: React.ReactNode = ''
            if (isFirst) content = '합계'
            else if (c.percentOf) content = '100%'
            else if (numericTotals[c.key] !== undefined) content = fmt(numericTotals[c.key])
            return (
              <span
                key={`${c.key}:${i}`}
                className={`${spanFor(i)} text-sm font-semibold ${
                  c.align === 'right' || !isFirst ? 'text-right font-mono' : ''
                }`}
                style={{ color: CHART_THEME.gold }}
              >
                {content}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
