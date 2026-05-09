import {
  ChartRenderer,
  CHART_THEME,
  type ChartSpec,
} from '../../../../dashboard/src/components/charts'

const GOLD = CHART_THEME.gold

const monthlyData = [
  { month: '1월', revenue: 120_000_000, cost: 80_000_000 },
  { month: '2월', revenue: 140_000_000, cost: 90_000_000 },
  { month: '3월', revenue: 180_000_000, cost: 95_000_000 },
  { month: '4월', revenue: 210_000_000, cost: 110_000_000 },
  { month: '5월', revenue: 250_000_000, cost: 130_000_000 },
  { month: '6월', revenue: 280_000_000, cost: 145_000_000 },
]

const companyRows = [
  { id: 'a', name: '씨오디 리테일', amount: 4_300_000_000, color: '#c8a96e' },
  { id: 'b', name: '시티오브드림스', amount: 3_100_000_000, color: '#f0c060' },
  { id: 'c', name: '태만월드',     amount: 2_400_000_000, color: '#85c49a' },
  { id: 'd', name: 'NRD',         amount: 1_700_000_000, color: '#e07b7b' },
]

const SPECS: ChartSpec[] = [
  {
    id: 'kpi.demo.revenue',
    title_ko: '연간 총 매출',
    viz: { kind: 'kpi', format: 'krwFull', accent: GOLD },
    data: [{ value: 11_500_000_000 }],
  },
  {
    id: 'kpi.demo.count',
    title_ko: '회사 수',
    viz: { kind: 'kpi', format: (v) => `${v}개` },
    data: [{ value: 8 }],
  },
  {
    id: 'kpi.demo.percent',
    title_ko: '전년 대비',
    subtitle_ko: 'YoY 성장률',
    viz: { kind: 'kpi', format: 'percent', accent: '#85c49a' },
    data: [{ value: 12.4 }],
  },
  {
    id: 'chart.demo.bar',
    title_ko: '월별 매출 (Bar)',
    viz: {
      kind: 'bar',
      xKey: 'month',
      yFormat: 'krw',
      series: [{ key: 'revenue', label: '매출', color: GOLD }],
    },
    data: monthlyData,
  },
  {
    id: 'chart.demo.line',
    title_ko: '월별 매출 vs 비용 (Line)',
    viz: {
      kind: 'line',
      xKey: 'month',
      yFormat: 'krw',
      series: [
        { key: 'revenue', label: '매출', color: GOLD },
        { key: 'cost',    label: '비용', color: '#e07b7b' },
      ],
    },
    data: monthlyData,
  },
  {
    id: 'chart.demo.area',
    title_ko: '누적 영역 차트 (Area, stacked)',
    viz: {
      kind: 'area',
      xKey: 'month',
      yFormat: 'krw',
      stacked: true,
      series: [
        { key: 'cost',    label: '비용', color: '#7eb8d4' },
        { key: 'revenue', label: '매출', color: GOLD },
      ],
    },
    data: monthlyData,
  },
  {
    id: 'table.demo.companies',
    title_ko: '회사별 매출 (Table)',
    viz: {
      kind: 'table',
      totalRow: true,
      columns: [
        { key: 'name',   label: '회사',     colorKey: 'color' },
        { key: 'amount', label: '연간 매출', align: 'right', format: 'krwFull' },
        { key: 'amount', label: '비중',     align: 'right', percentOf: 'amount', colorKey: 'color' },
      ],
    },
    data: companyRows,
  },
]

export default function ChartsGallery() {
  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ background: '#0b0c10', color: CHART_THEME.text, fontFamily: 'system-ui, sans-serif' }}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="border-l-2 pl-4" style={{ borderColor: GOLD }}>
          <p
            className="text-[11px] font-mono tracking-widest uppercase mb-1"
            style={{ color: CHART_THEME.textLabel }}
          >
            Storybook
          </p>
          <h1 className="text-2xl font-bold">ChartRenderer — Viz 갤러리</h1>
          <p className="text-sm mt-2" style={{ color: CHART_THEME.textMuted }}>
            모든 차트는 <code>ChartSpec</code> 객체로 선언되고 단일{' '}
            <code>&lt;ChartRenderer /&gt;</code> 컴포넌트로 렌더링됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SPECS.filter((s) => s.viz.kind === 'kpi').map((spec) => (
            <ChartRenderer key={spec.id} spec={spec} />
          ))}
        </div>

        {SPECS.filter((s) => s.viz.kind !== 'kpi').map((spec) => (
          <ChartRenderer key={spec.id} spec={spec} />
        ))}
      </div>
    </div>
  )
}
