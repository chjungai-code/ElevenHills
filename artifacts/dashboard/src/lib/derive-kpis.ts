import type {
  FinancialStatement,
  FinancialStatementLine,
} from '@workspace/api-client-react'

type AmountKey = 'amount' | 'prior_amount'

function flatten(
  nodes: readonly FinancialStatementLine[] | undefined,
): FinancialStatementLine[] {
  const out: FinancialStatementLine[] = []
  const walk = (ns: readonly FinancialStatementLine[] | undefined) => {
    if (!ns) return
    for (const n of ns) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

const collapse = (s: string) => s.replace(/\s+/g, '')

function readAmount(line: FinancialStatementLine, key: AmountKey): number | null {
  const raw = line[key]
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return isFinite(n) ? n : null
}

function findAmount(
  lines: FinancialStatementLine[],
  target: string,
  key: AmountKey,
): number | null {
  const t = collapse(target)
  // Prefer exact collapsed match so e.g. target `장기차입금` does not
  // accidentally bind to `유동성장기차입금`.
  for (const l of lines) {
    if (collapse(l.account_name_ko) === t) return readAmount(l, key)
  }
  for (const l of lines) {
    if (collapse(l.account_name_ko).endsWith(t)) return readAmount(l, key)
  }
  return null
}

export type DerivedKpis = {
  // values are in won (raw); ratio is unitless
  gri: { current: number | null; prior: number | null }
  noi: { current: number | null; prior: number | null }
  ffo: { current: number | null; prior: number | null }
  netDebtEbitda: { current: number | null; prior: number | null }
}

function computeNoi(lines: FinancialStatementLine[], key: AmountKey): number | null {
  const rent = findAmount(lines, '임대료수입', key)
  if (rent == null) return null
  const repair = findAmount(lines, '수선비', key) ?? 0
  const tax = findAmount(lines, '세금과공과금', key) ?? 0
  const insurance = findAmount(lines, '보험료', key) ?? 0
  return rent - (repair + tax + insurance)
}

function computeFfo(lines: FinancialStatementLine[], key: AmountKey): number | null {
  const ni = findAmount(lines, '당기순이익', key)
  const dep = findAmount(lines, '감가상각비', key)
  if (ni == null || dep == null) return null
  return ni + dep
}

function computeNetDebtEbitda(
  income: FinancialStatementLine[],
  balance: FinancialStatementLine[],
  key: AmountKey,
): number | null {
  const opIncome = findAmount(income, '영업이익', key)
  const dep = findAmount(income, '감가상각비', key)
  const cash = findAmount(balance, '보통예금', key)
  if (opIncome == null || dep == null || cash == null) return null
  const ebitda = opIncome + dep
  if (ebitda === 0) return null
  const lt = findAmount(balance, '장기차입금', key) ?? 0
  const ltCurrent = findAmount(balance, '유동성장기차입금', key) ?? 0
  const ltOwner = findAmount(balance, '주.임.종 장기차입금', key) ?? 0
  const debt = lt + ltCurrent + ltOwner
  return (debt - cash) / ebitda
}

export function deriveKpis(
  income: FinancialStatement | null,
  balance: FinancialStatement | null,
): DerivedKpis {
  const inc = flatten(income?.lines)
  const bal = flatten(balance?.lines)
  return {
    gri: {
      current: findAmount(inc, '임대료수입', 'amount'),
      prior: findAmount(inc, '임대료수입', 'prior_amount'),
    },
    noi: {
      current: computeNoi(inc, 'amount'),
      prior: computeNoi(inc, 'prior_amount'),
    },
    ffo: {
      current: computeFfo(inc, 'amount'),
      prior: computeFfo(inc, 'prior_amount'),
    },
    netDebtEbitda: {
      current: computeNetDebtEbitda(inc, bal, 'amount'),
      prior: computeNetDebtEbitda(inc, bal, 'prior_amount'),
    },
  }
}

const EOK = 100_000_000 // 1억

export function formatEok(won: number | null): string {
  if (won == null) return '—억원'
  const v = won / EOK
  const sign = v < 0 ? '△' : ''
  return `${sign}${Math.abs(v).toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}억원`
}

export function formatRatio(x: number | null): string {
  if (x == null) return '— 배'
  const sign = x < 0 ? '△' : ''
  return `${sign}${Math.abs(x).toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} 배`
}

export type DeltaInfo = { text: string; up: boolean } | null

export function deltaEok(current: number | null, prior: number | null): DeltaInfo {
  if (current == null || prior == null || prior === 0) return null
  const diff = current - prior
  if (diff === 0) return null
  const up = diff > 0
  const eok = Math.abs(diff) / EOK
  const eokStr = eok.toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const prefix = up ? '+' : '△'
  const pct = Math.abs((diff / prior) * 100)
  const pctStr = ` (${prefix}${pct.toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%)`
  return { text: `${prefix}${eokStr}억원${pctStr}`, up }
}

export function deltaRatio(current: number | null, prior: number | null): DeltaInfo {
  if (current == null || prior == null || prior === 0) return null
  const diff = current - prior
  if (diff === 0) return null
  const up = diff > 0
  const v = Math.abs(diff).toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const prefix = up ? '+' : '△'
  return { text: `${prefix}${v}배`, up }
}
