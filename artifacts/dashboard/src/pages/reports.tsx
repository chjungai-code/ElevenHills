import { useState, useMemo } from 'react'
import {
  useGetFinancialStatements,
  getGetFinancialStatementsQueryKey,
  type FinancialStatement,
  type FinancialStatementLine,
  useGetCompanies,
} from '@workspace/api-client-react'

const PERIODS = ['월간', '분기', '연간', 'LTM'] as const
type Period = typeof PERIODS[number]

type Entity = { id: string; name: string; short: string | null | undefined }

const FALLBACK_ENTITY: Entity = { id: 'all', name: '포트폴리오 전체', short: '전체' }

const FISCAL_YEARS = [2025, 2024] as const
type StatementType = 'income_statement' | 'balance_sheet'
const STATEMENT_LABEL: Record<StatementType, string> = {
  income_statement: '손익계산서',
  balance_sheet: '재무상태표',
}

const C = {
  card: '#13141a',
  border: '#1e1f2a',
  faint: '#1e1f2a',
  ink: '#f4eedd',
  muted: '#8a8a9a',
  accent: '#8C4A2F',
  accentLight: 'rgba(140,74,47,0.18)',
  accentText: '#c87055',
  blue: '#1C3F6E',
  blueLight: 'rgba(28,63,110,0.2)',
  blueText: '#6b9fd4',
  green: '#1D5C3A',
  greenLight: 'rgba(29,92,58,0.2)',
  greenText: '#5aac7a',
  purple: '#3D2B6B',
  purpleLight: 'rgba(61,43,107,0.2)',
  purpleText: '#9b82d4',
  gold: '#c8a96e',
  goldLight: 'rgba(200,169,110,0.12)',
  up: '#4ade80',
  dn: '#f87171',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function flattenLines(
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

function formatComma(rawWon: string | null | undefined): string {
  if (rawWon == null || rawWon === '') return ''
  const n = Number(rawWon)
  if (!isFinite(n)) return ''
  if (n === 0) return '0'
  const sign = n < 0 ? '△' : ''
  return sign + Math.abs(n).toLocaleString('ko-KR')
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function Badge({ type, children }: { type: 'port' | 'income' | 'traffic' | 'fin' | 'gold'; children: React.ReactNode }) {
  const styles: Record<string, { bg: string; color: string }> = {
    port:    { bg: C.accentLight, color: C.accentText },
    income:  { bg: C.blueLight,   color: C.blueText },
    traffic: { bg: C.greenLight,  color: C.greenText },
    fin:     { bg: C.purpleLight, color: C.purpleText },
    gold:    { bg: C.goldLight,   color: C.gold },
  }
  const s = styles[type]
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 10, display: 'inline-block' }}>
      {children}
    </span>
  )
}

function KpiCard({
  stripe, badgeType, badge, name, en, val, delta, deltaUp, note, reit,
}: {
  stripe: string
  badgeType: 'port' | 'income' | 'traffic' | 'fin'
  badge: string
  name: string
  en: string
  val: string
  delta: string
  deltaUp?: boolean
  note: string
  reit: string
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 15px 14px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: stripe, borderRadius: '14px 14px 0 0' }} />
      <div style={{ marginBottom: 10 }}>
        <Badge type={badgeType}>{badge}</Badge>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, lineHeight: 1.4 }}>{name}</div>
      <div style={{ fontSize: 9.5, color: '#555566', marginBottom: 6 }}>{en}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 500, color: C.ink, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 10, marginTop: 5, color: deltaUp !== false ? C.up : C.dn }}>
        {delta ? `${deltaUp !== false ? '↑' : '↓'} ${delta}` : '\u00A0'}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.faint}`, lineHeight: 1.55 }}>{note}</div>
      <div style={{ fontSize: 9.5, color: C.gold, marginTop: 4, fontWeight: 500 }}>★ {reit}</div>
    </div>
  )
}

function MetricRow({ name, en, why, reit, badgeType, unit }: {
  name: string; en: string; why: string; reit?: string
  badgeType: 'port' | 'income' | 'traffic' | 'fin'; unit: string
}) {
  return (
    <div className="metric-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.faint}` }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.ink, lineHeight: 1.3 }}>{name}</div>
        <div style={{ fontSize: 9.5, color: '#555566', marginTop: 1 }}>{en}</div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{why}</div>
        {reit && <div style={{ fontSize: 9.5, color: C.gold, marginTop: 2 }}>★ {reit}</div>}
      </div>
      <span style={{
        fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 500,
        padding: '2px 8px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2,
        background: { port: C.accentLight, income: C.blueLight, traffic: C.greenLight, fin: C.purpleLight }[badgeType],
        color: { port: C.accentText, income: C.blueText, traffic: C.greenText, fin: C.purpleText }[badgeType],
      }}>{unit}</span>
    </div>
  )
}

function SectionCard({ title, badge, badgeType, children, fullWidth }: {
  title: string
  badge: string
  badgeType: 'port' | 'income' | 'traffic' | 'fin'
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: 0 }}>{title}</h3>
        <Badge type={badgeType}>{badge}</Badge>
      </div>
      {children}
    </div>
  )
}

function TierBar({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 14px' }}>
      <span style={{
        fontSize: 9, fontWeight: 700, background: C.ink, color: '#0b0c10',
        borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{num}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{title}</span>
      <span style={{ fontSize: 10.5, color: C.muted }}>{desc}</span>
      <div style={{ flex: 1, height: 1, background: C.faint }} />
    </div>
  )
}

// ─── Statement Table ────────────────────────────────────────────────────────

function StatementTable({ stmt }: { stmt: FinancialStatement }) {
  const periodLabel = stmt.period_end
    ? `${stmt.fiscal_year}년`
    : `${stmt.fiscal_year}년`
  const priorLabel = `${stmt.fiscal_year - 1}년`

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={{ textAlign: 'left', padding: '8px 10px', color: C.muted, fontWeight: 500, fontSize: 10.5, letterSpacing: '0.05em' }}>
              과 목
            </th>
            <th style={{ textAlign: 'right', padding: '8px 10px', color: C.gold, fontWeight: 600, fontSize: 10.5, letterSpacing: '0.05em', width: 160 }}>
              {periodLabel} (당기)
            </th>
            <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted, fontWeight: 500, fontSize: 10.5, letterSpacing: '0.05em', width: 160 }}>
              {priorLabel} (전기)
            </th>
          </tr>
        </thead>
        <tbody>
          {flattenLines(stmt.lines).map((line) => {
            const isSection = line.depth === 0
            const isSub = line.depth === 1
            const indent = line.depth * 16
            const fontWeight = line.is_subtotal ? 600 : 400
            const color = isSection ? C.ink : isSub ? C.ink : C.muted
            const bg = isSection
              ? 'rgba(200,169,110,0.05)'
              : isSub
              ? 'rgba(255,255,255,0.015)'
              : 'transparent'
            return (
              <tr
                key={line.sort_order}
                style={{ borderBottom: `1px solid ${C.faint}`, background: bg }}
              >
                <td
                  style={{
                    padding: '6px 10px',
                    paddingLeft: 10 + indent,
                    color,
                    fontWeight,
                    fontSize: isSection ? 12 : 11.5,
                  }}
                >
                  {line.section_code && (
                    <span style={{ color: C.gold, marginRight: 6 }}>
                      {line.section_code}.
                    </span>
                  )}
                  {line.section_code
                    ? line.account_name_ko.replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩVIX]+\.\s*/, '')
                    : line.account_name_ko}
                </td>
                <td
                  style={{
                    padding: '6px 10px',
                    textAlign: 'right',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11.5,
                    color: line.is_subtotal ? C.ink : C.muted,
                    fontWeight,
                  }}
                >
                  {formatComma(line.amount)}
                </td>
                <td
                  style={{
                    padding: '6px 10px',
                    textAlign: 'right',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11.5,
                    color: '#5a5a6a',
                    fontWeight,
                  }}
                >
                  {formatComma(line.prior_amount)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 10, textAlign: 'right' }}>
        단위: 원 ({stmt.currency})
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('분기')
  const [entityId, setEntityId] = useState<string>('c0000001-0000-0000-0000-000000000005') // SGD Partners default to showcase data
  const [fiscalYear, setFiscalYear] = useState<number>(2025)
  const [openStatement, setOpenStatement] = useState<StatementType | null>(null)

  const { data: companies = [] } = useGetCompanies()
  const ENTITIES: Entity[] = useMemo(
    () => [
      FALLBACK_ENTITY,
      ...companies.map(c => ({ id: c.id, name: c.name, short: c.short_name })),
    ],
    [companies],
  )

  const entity = ENTITIES.find(e => e.id === entityId) ?? ENTITIES[0]
  const isPortfolio = entityId === 'all'

  const { data: financials, isLoading } = useGetFinancialStatements(
    { company_id: entityId, year: fiscalYear },
    {
      query: {
        queryKey: getGetFinancialStatementsQueryKey({ company_id: entityId, year: fiscalYear }),
        enabled: !isPortfolio,
      },
    },
  )

  const income = financials?.income_statement ?? null
  const balance = financials?.balance_sheet ?? null

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${C.faint}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="text-[11px] font-mono tracking-widest uppercase mb-1" style={{ color: '#6a6a80' }}>
              성과지표 · Retail CRE
            </p>
            {/* Company + Year selector */}
            <div style={{ marginBottom: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={entityId}
                onChange={e => setEntityId(e.target.value)}
                style={selectStyle()}
              >
                {ENTITIES.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <select
                value={fiscalYear}
                onChange={e => setFiscalYear(Number(e.target.value))}
                style={selectStyle()}
              >
                {FISCAL_YEARS.map(y => (
                  <option key={y} value={y}>FY {y}</option>
                ))}
              </select>
            </div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: '#f4eedd' }}>
              {entity.name} <span style={{ color: C.muted, fontWeight: 400, fontSize: '0.8em' }}>핵심 지표 현황</span>
            </h1>
            <div className="text-xs mt-1" style={{ color: '#6a6a80' }}>
              리테일 상업용 부동산 임대인 관점 · 임차인 기반 수익 모델 · CEO 및 주주용
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, flexShrink: 0, flexWrap: 'wrap', paddingTop: 20 }}>
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  fontSize: 10.5, padding: '4px 11px', borderRadius: 20,
                  border: `1px solid ${period === p ? C.gold : C.border}`,
                  cursor: 'pointer',
                  background: period === p ? C.gold : 'transparent',
                  color: period === p ? '#0b0c10' : C.muted,
                  transition: 'all 0.15s', fontWeight: period === p ? 600 : 400,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* REIT 비교 인사이트 */}
      <div style={{
        background: C.goldLight, borderLeft: `3px solid ${C.gold}`,
        borderRadius: '0 10px 10px 0', padding: '12px 16px', marginBottom: 22,
      }}>
        <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, marginBottom: 5 }}>
          📊 REIT 지표와의 연관성
        </div>
        <p style={{ fontSize: 11.5, color: C.ink, lineHeight: 1.65 }}>
          리테일 상업용 부동산 임대 사업의 핵심 지표는 상장 리테일 REIT(리츠)가 투자자에게 보고하는 지표와 구조적으로 동일합니다. 아래는 주요 대응 관계입니다.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6, marginTop: 10 }}>
          {[
            ['REIT: FFO (운영자금)', 'NOI에서 출발하는 현금수익 지표'],
            ['REIT: 점유율', '포트폴리오 임대율 (GLA 기준)'],
            ['REIT: 동일자산 NOI 성장률', 'Same-store NOI growth'],
            ['REIT: WALE', '가중평균 잔여 임대기간'],
            ['REIT: 임대 역전율', '갱신 시 임대료 변동률'],
            ['REIT: LTV / ICR', '재무건전성 핵심 커버넌트'],
          ].map(([reit, ours]) => (
            <div key={reit} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11 }}>
              <span style={{ color: C.gold, fontWeight: 600, minWidth: 120 }}>{reit}</span>
              <span style={{ color: C.muted }}>→ {ours}</span>
            </div>
          ))}
        </div>
      </div>

      {/* TIER 1 */}
      <TierBar num={1} title="핵심 KPI" desc={`이사회 보고·주주 보고서용 — FY${fiscalYear} 기준`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }} className="kpi-grid-t1">
        <KpiCard stripe={C.accent} badgeType="port" badge="포트폴리오" name="포트폴리오 임대율" en="Portfolio Occupancy Rate" val="—%" delta="" note="전체 임대가능면적(GLA) 중 임대된 비율. 리테일 임대사업의 최우선 지표." reit="REIT 공시 핵심 지표" />
        <KpiCard stripe={C.blue} badgeType="income" badge="임대수익" name="총 임대수익 (GRI)" en="Gross Rental Income" val="—억원" delta="" note="청구된 임대료 총액. 임대사업 손익의 최상단 매출 항목." reit="REIT 공시 핵심 지표" />
        <KpiCard stripe={C.blue} badgeType="income" badge="임대수익" name="순영업이익 (NOI)" en="Net Operating Income" val="—억원" delta="" note="GRI에서 운영비용 차감. 모든 부동산 투자자가 주시하는 핵심 수익성 지표." reit="REIT FFO 산출의 출발점" />
        <KpiCard stripe={C.purple} badgeType="fin" badge="재무건전성" name="사업운영수익 (FFO)" en="Funds From Operations" val="—억원" delta="" note="당기순이익에 감가상각비를 더하고 자산매각수익을 차감한 포트폴리오의 실질 현금창출능력." reit="REIT 배당 재원 핵심 지표" />
        <KpiCard stripe={C.accent} badgeType="port" badge="포트폴리오" name="가중평균 잔여 임대기간 (WALE)" en="Weighted Avg. Lease Expiry" val="— 년" delta="" note="수익의 가시성 지표. WALE이 길수록 안정적인 미래 임대수익을 의미." reit="REIT 투자자 필수 확인 지표" />
        <KpiCard stripe={C.purple} badgeType="fin" badge="재무건전성" name="순자산가치 (NAV)" en="Net Asset Value" val="—억원" delta="" note="보유 부동산의 시장가치 총액에서 총부채를 차감한 포트폴리오의 순투자가치." reit="REIT 주가 및 기업가치 평가 기준" />
        <KpiCard stripe={C.green} badgeType="traffic" badge="집객·임차인" name="임차인 평당 매출" en="Tenant Sales per sqm" val="—만원" delta="" note="임차인의 리테일 생산성. 임대 갱신 가능성과 임대료 인상 여력의 예측 지표." reit="리테일 REIT 핵심 모니터링 항목" />
        <KpiCard stripe={C.purple} badgeType="fin" badge="재무건전성" name="순부채 / EBITDA" en="Net Debt / EBITDA" val="— 배" delta="" note="레버리지 비율. 금융기관과 주주가 리스크 지표로 가장 먼저 확인하는 수치." reit="REIT 신용등급 핵심 기준" />
      </div>

      {/* Statement dropdown panel */}
      <div style={{ marginTop: 22 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['income_statement', 'balance_sheet'] as StatementType[]).map(t => {
              const active = openStatement === t
              return (
                <button
                  key={t}
                  onClick={() => setOpenStatement(active ? null : t)}
                  style={{
                    fontSize: 11, padding: '6px 14px', borderRadius: 20,
                    border: `1px solid ${active ? C.gold : C.border}`,
                    background: active ? C.gold : 'transparent',
                    color: active ? '#0b0c10' : C.ink,
                    cursor: 'pointer', fontWeight: active ? 600 : 500,
                  }}
                >
                  {STATEMENT_LABEL[t]}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, fontFamily: "'DM Mono', monospace" }}>
            {entity.name} · FY{fiscalYear}
          </div>
        </div>

        {openStatement && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 18,
          }}>
            {isPortfolio ? (
              <EmptyState text="개별 법인을 선택하세요. 포트폴리오 합산은 지원되지 않습니다." />
            ) : isLoading ? (
              <EmptyState text="불러오는 중…" />
            ) : openStatement === 'income_statement' ? (
              income ? <StatementTable stmt={income} /> : <EmptyState text="해당 연도 재무제표 데이터가 없습니다." />
            ) : (
              balance ? <StatementTable stmt={balance} /> : <EmptyState text="해당 연도 재무제표 데이터가 없습니다." />
            )}
          </div>
        )}
      </div>

      {/* TIER 2 */}
      <TierBar num={2} title="운영 KPI" desc="CEO·경영진 월간 검토 — 자산별·구역별 드릴다운" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="kpi-grid-t2">

        <SectionCard title="임대 현황 및 공실 관리" badge="포트폴리오" badgeType="port">
          <div>
            <MetricRow name="자산·구역별 공실률" en="Vacancy Rate by Asset & Zone" why="빈 GLA가 어느 몰, 층, 구역에 집중되어 있는지 파악 → 임대 우선순위 결정." badgeType="port" unit="%" />
            <MetricRow name="향후 24개월 임대 만료 스케줄" en="Lease Expiry Schedule" why="연도별 만료 예정 임대료 비율. 재임대 리스크와 업무량을 선제적으로 파악." badgeType="port" unit="%" />
            <MetricRow name="임대 갱신율" en="Lease Renewal Rate" why="만료 임대 중 갱신 비율. 낮으면 임차인 불만 또는 상권 경쟁력 약화 신호." reit="REIT 임대 안정성 핵심 지표" badgeType="port" unit="%" />
            <MetricRow name="평균 공실 기간" en="Average Leasing Downtime" why="임차인 교체 시 공실 일수. 수익 공백에 직접 영향." badgeType="port" unit="일(日)" />
            <div style={{ borderBottom: 'none' }}>
              <MetricRow name="임대 협상 파이프라인 (LOI 체결 면적)" en="Leasing Pipeline" why="계약 협상 중인 GLA 면적. 향후 임대율 회복의 선행지표." badgeType="port" unit="㎡" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="임대수익 품질" badge="임대수익" badgeType="income">
          <div>
            <MetricRow name="임대료 역전율 (Rental Reversion)" en="Rental Reversion Rate" why="갱신 시 구 임대료 대비 신 임대료 변동률. 양수=임대료 성장, 음수=시장 압박." reit="리테일 REIT 핵심 성장 지표" badgeType="income" unit="%" />
            <MetricRow name="실효 임대료 vs 명목 임대료" en="Effective vs. Face Rent" why="명목 임대료에서 무상임대(rent-free) 등 인센티브 차감한 실제 수익." badgeType="income" unit="원/㎡" />
            <MetricRow name="고정 임대료 vs 매출연동 임대료" en="Base Rent vs. Turnover Rent" why="임차인 매출의 일정 비율로 받는 매출연동 임대료. 임차인 실적 호조 시 추가 수익 발생." badgeType="income" unit="억원" />
            <MetricRow name="자산별 NOI 마진" en="NOI Margin by Property" why="NOI ÷ GRI. 어느 자산이 운영 효율이 높고 낮은지 파악." reit="REIT 자산 효율성 분석 지표" badgeType="income" unit="%" />
            <MetricRow name="연체 및 무상임대 인센티브 현황" en="Arrears & Rent-Free Incentives" why="신규 임대 유치를 위해 제공된 양보 조건의 실제 비용 추적." badgeType="income" unit="억원" />
            <MetricRow name="임대료 수금률" en="Rent Collection Rate" why="청구된 임대료 중 기한 내 수금 비율. 임차인 재무 위기의 선행지표." badgeType="income" unit="%" />
          </div>
        </SectionCard>

        <SectionCard title="임차인 건강도 및 구성 (Tenant Mix)" badge="집객·임차인" badgeType="traffic" fullWidth>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>임차인 구성 예시 (GLA 기준 비율)</div>
          <div style={{ display: 'flex', height: 8, borderRadius: 6, overflow: 'hidden', margin: '12px 0 6px' }}>
            {[
              { w: '22%', bg: '#8C4A2F' },
              { w: '20%', bg: '#1C3F6E' },
              { w: '16%', bg: '#1D5C3A' },
              { w: '13%', bg: '#3D2B6B' },
              { w: '12%', bg: '#7A5230' },
              { w: '9%',  bg: '#2E6B8A' },
              { w: '8%',  bg: '#555566' },
            ].map((seg, i) => (
              <div key={i} style={{ width: seg.w, height: '100%', background: seg.bg }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 14px', marginBottom: 16 }}>
            {[
              { color: '#8C4A2F', label: '패션·의류' },
              { color: '#1C3F6E', label: 'F&B·외식' },
              { color: '#1D5C3A', label: '앵커·백화점' },
              { color: '#3D2B6B', label: '엔터테인먼트' },
              { color: '#7A5230', label: '뷰티·헬스' },
              { color: '#2E6B8A', label: '서비스·기타' },
              { color: '#555566', label: '기타' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.muted }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <MetricRow name="임차인 평당 매출 (업종별)" en="Tenant Sales per sqm by Category" why="업종별 리테일 생산성 비교. 실적 부진 임차인은 갱신 미참여 리스크." badgeType="traffic" unit="원/㎡" />
            <MetricRow name="임차인 임대비용 부담률" en="Occupancy Cost Ratio" why="임차인 임대료 ÷ 임차인 매출. 15% 초과 시 임차인 재무 부담 경보." reit="임차인 임대 지속가능성 지표" badgeType="traffic" unit="%" />
            <MetricRow name="앵커 임차인 실적" en="Anchor Tenant Performance" why="앵커가 몰 전체 집객을 견인. 앵커의 건강 = 몰의 건강." badgeType="traffic" unit="매출" />
            <MetricRow name="상위 5개 임차인 임대수익 집중도" en="Top-5 Tenant Rent Concentration" why="전체 GRI 중 상위 5개 임차인 비중. 높을수록 수익 집중 리스크." badgeType="traffic" unit="%" />
            <MetricRow name="임차인 구성 비율 (GLA 기준)" en="Tenant Mix by Category" why="F&B·패션·엔터·앵커·서비스 비율. 균형 잡힌 구성이 상권 노후화 리스크 감소." badgeType="traffic" unit="%" />
            <MetricRow name="임차인 신용·연체 위험 모니터링" en="Tenant Default Watch-list" why="연체 또는 매출 감소 임차인 내부 리스크 등급. 선제적 관리 근거." badgeType="traffic" unit="건수" />
          </div>
        </SectionCard>

        <SectionCard title="몰 집객력 및 방문객 경험" badge="집객·임차인" badgeType="traffic">
          <div>
            <MetricRow name="쇼핑몰 방문객 수" en="Shopper Foot Traffic" why="전체 포트폴리오 방문객 수 합계. 임차인 매출 및 임대료 납부 건전성의 선행지표." badgeType="traffic" unit="만명" />
            <MetricRow name="자산별 방문객 수 (Footfall)" en="Foot Traffic by Property" why="일·주간 방문객 수. 어느 몰이 집객력을 유지·잃고 있는지 파악." badgeType="traffic" unit="명" />
            <MetricRow name="체류 시간 (Dwell Time)" en="Dwell Time" why="방문당 평균 체류 시간. 길수록 소비 금액 증가. 몰 경험 품질의 핵심 결과 지표." badgeType="traffic" unit="분" />
            <MetricRow name="쇼핑 전환율" en="Shopper Conversion Rate" why="방문자 중 실제 구매자 비율. 낮으면 상품 구성·가격·동선에 문제." badgeType="traffic" unit="%" />
            <MetricRow name="고객 만족도 (NPS)" en="Shopper NPS / CSAT" why="방문 경험 품질 점수. 재방문 및 구전 효과와 직결." badgeType="traffic" unit="점수" />
            <MetricRow name="재방문율" en="Repeat Visit Rate" why="기간 내 재방문 방문객 비율. 개별 임차인이 아닌 몰 자체의 충성도 측정." badgeType="traffic" unit="%" />
          </div>
        </SectionCard>

        <SectionCard title="재무 건전성" badge="재무건전성" badgeType="fin">
          <div>
            <MetricRow name="잉여현금흐름 (FCF)" en="Free Cash Flow" why="영업 현금흐름 - CapEx. 배당, 부채 상환, 개발 투자의 실질 재원." badgeType="fin" unit="억원" />
            <MetricRow name="이자보상배율 (ICR)" en="Interest Coverage Ratio" why="EBIT ÷ 이자비용. 부동산 임대사업의 핵심 대출 커버넌트 지표." reit="REIT 신용등급 필수 지표" badgeType="fin" unit="배" />
            <MetricRow name="담보인정비율 (LTV)" en="Loan-to-Value Ratio" why="부채 ÷ 자산 가치. 리파이낸싱 및 금융기관 관계의 핵심 지표." reit="REIT 재무 안전성 기준" badgeType="fin" unit="%" />
            <MetricRow name="자본지출 (CapEx) 실적 vs 예산" en="CapEx vs. Budget" why="유지보수·리모델링·개발 자본지출의 예산 대비 집행 현황." badgeType="fin" unit="억원" />
            <MetricRow name="예산 대비 실적 편차 (자산별)" en="Budget vs. Actual Variance" why="자산별 수익·비용 가정의 실현 여부. 조기 이상 탐지 목적." badgeType="fin" unit="%" />
          </div>
        </SectionCard>

      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.faint}`, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', color: C.muted }}>구분</span>
        {[
          { color: C.accent, label: '포트폴리오·임대' },
          { color: C.blue, label: '임대수익' },
          { color: C.green, label: '집객·임차인' },
          { color: C.purple, label: '재무건전성' },
          { color: C.gold, label: '★ REIT 공통 지표' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: C.muted }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {label}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: C.muted, marginTop: 16, lineHeight: 1.75 }}>
        <strong style={{ color: C.ink }}>Tier 1</strong> — 이사회 보고 및 주주 보고서용 8개 핵심 KPI. 매 이사회 전 업데이트.<br />
        <strong style={{ color: C.ink }}>Tier 2</strong> — CEO·경영진 월간 운영 검토. 자산별·구역별 드릴다운 가능.<br />
        ★ 표시 지표는 상장 리테일 REIT(리츠)가 투자자에게 공시하는 지표와 동일하게 정의 및 산출 가능. ICSC, Nareit, NCREIF 기준 참조.
      </div>

      <style>{`
        @media (max-width: 640px) {
          .kpi-grid-t1 { grid-template-columns: 1fr 1fr !important; }
          .kpi-grid-t2 { grid-template-columns: 1fr !important; }
        }
        .metric-row:last-child { border-bottom: none !important; }
      `}</style>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: '36px 18px', textAlign: 'center', color: C.muted,
      fontSize: 12, lineHeight: 1.6,
    }}>
      {text}
    </div>
  )
}

function selectStyle(): React.CSSProperties {
  return {
    background: '#1c1d26',
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.gold,
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    paddingRight: 24,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23c8a96e' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
  }
}
