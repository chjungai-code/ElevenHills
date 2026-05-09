import { Link } from 'wouter'
import { useGetCompanies, useGetFamilyMembers } from '@workspace/api-client-react'

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-xl p-4 md:p-5"
      style={{ background: '#13141a', border: '1px solid #272836' }}
    >
      <p
        className="text-[10px] font-mono tracking-widest uppercase mb-2"
        style={{ color: '#6a6a80' }}
      >
        {label}
      </p>
      <p className="text-xl md:text-2xl font-bold" style={{ color: '#f4eedd' }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: '#6a6a80' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

export default function DashboardHome() {
  const companiesQuery = useGetCompanies()
  const familyQuery = useGetFamilyMembers()

  if (companiesQuery.isLoading || familyQuery.isLoading) {
    return (
      <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#6a6a80' }}>
        Loading…
      </p>
    )
  }

  if (companiesQuery.isError || familyQuery.isError) {
    return (
      <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#c8a96e' }}>
        데이터를 불러오지 못했습니다.
      </p>
    )
  }

  const companies = companiesQuery.data ?? []
  const family = familyQuery.data ?? []

  const subsidiaries = companies.filter(c => c.category === 'subsidiary')
  const standalones  = companies.filter(c => c.category === 'standalone')
  const total        = companies.length

  return (
    <div className="space-y-6 md:space-y-8 max-w-4xl">
      <div className="border-l-2 pl-4" style={{ borderColor: '#c8a96e' }}>
        <p
          className="text-[11px] font-mono tracking-widest uppercase mb-1"
          style={{ color: '#6a6a80' }}
        >
          Overview
        </p>
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: '#f4eedd' }}>
          전체 현황
        </h1>
      </div>

      <div
        className="rounded-xl p-4 flex flex-wrap gap-x-5 gap-y-2 md:gap-6 items-center text-sm"
        style={{ background: '#13141a', border: '1px solid #272836' }}
      >
        <span
          className="text-[10px] font-mono tracking-widest uppercase w-full md:w-auto"
          style={{ color: '#c8a96e' }}
        >
          가족관계
        </span>
        {family.map(m => (
          <span key={m.name} className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: m.color }}>{m.name}</span>
            <span className="text-xs" style={{ color: '#6a6a80' }}>{m.role}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="총 법인수"   value={`${total}개`}              sub="등록 법인 전체" />
        <StatCard label="자회사"      value={`${subsidiaries.length}개`} sub="일레븐힐스 관여" />
        <StatCard label="별도 법인"   value={`${standalones.length}개`}  sub="가족 직접 지분" />
        <StatCard label="최대 지분율" value="60%"                        sub="씨오디 리테일" />
      </div>

      <div>
        <p
          className="text-[10px] font-mono tracking-widest uppercase mb-3"
          style={{ color: '#6a6a80' }}
        >
          빠른 이동
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { href: '/governance', label: '지배구조 차트', desc: '트리 / Org Chart 보기' },
            { href: '/revenue',    label: '매출 대시보드', desc: 'Phase 2 — coming soon' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl p-4 flex justify-between items-center group transition-colors"
              style={{ background: '#13141a', border: '1px solid #272836' }}
            >
              <div>
                <p className="font-semibold text-sm" style={{ color: '#f4eedd' }}>
                  {item.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#6a6a80' }}>
                  {item.desc}
                </p>
              </div>
              <span style={{ color: '#c8a96e' }}>→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
