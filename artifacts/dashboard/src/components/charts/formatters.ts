export type Formatter = (value: number) => string

export const formatKRW: Formatter = (value) => {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${Math.round(value / 10_000)}만`
  return value.toLocaleString()
}

export const formatKRWFull: Formatter = (value) => {
  if (value >= 100_000_000) return `₩${(value / 100_000_000).toFixed(2)}억`
  return `₩${Math.round(value / 10_000).toLocaleString()}만`
}

export const formatPercent: Formatter = (value) => `${value.toFixed(1)}%`

export const formatNumber: Formatter = (value) => value.toLocaleString()

export const FORMATTERS: Record<string, Formatter> = {
  krw: formatKRW,
  krwFull: formatKRWFull,
  percent: formatPercent,
  number: formatNumber,
}

export function resolveFormatter(
  f: Formatter | keyof typeof FORMATTERS | undefined,
): Formatter {
  if (!f) return formatNumber
  if (typeof f === 'function') return f
  return FORMATTERS[f] ?? formatNumber
}
