import { Link, useRoute } from 'wouter'
import { COMPANIES_SEED } from '@/lib/data/companies'
import OwnershipBar from '@/components/governance/OwnershipBar'

const ROLE_KO: Record<string, string> = {
  ceo:      '대표이사',
  director: '사내이사',
  auditor:  '감사',
}

const CATEGORY_KO: Record<string, string> = {
  holding:    '최상위 홀딩',
  subsidiary: '자회사',
  standalone: '별도 법인',
  sub_entity: '손자회사',
}

export default function CompanyDetailPage() {
  const [, params] = useRoute<{ id: string }>('/governance/:id')
  const id = params?.id
  const company = COMPANIES_SEED.find(c => c.id === id)

  if (!company) {
    return (
      <div className="max-w-2xl space-y-6">
        <Link
          href="/governance"
          className="text-xs font-mono inline-flex items-center gap-1 min-h-[44px] hover:opacity-70 transition-opacity"
          style={{ color: '#6a6a80' }}
        >
          ← 지배구조로 돌아가기
        </Link>
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: '#13141a', border: '1px dashed #272836' }}
        >
          <p className="text-sm" style={{ color: '#6a6a80' }}>법인을 찾을 수 없습니다.</p>
        </div>
      </div>
    )
  }

  const parent = company.parent_id
    ? COMPANIES_SEED.find(c => c.id === company.parent_id)
    : null

  const children = COMPANIES_SEED.filter(c => c.parent_id === company.id)

  return (
    <div className="max-w-2xl space-y-6">
      {/* Back */}
      <Link
        href="/governance"
        className="text-xs font-mono inline-flex items-center gap-1 min-h-[44px] hover:opacity-70 transition-opacity"
        style={{ color: '#6a6a80' }}
      >
        ← 지배구조로 돌아가기
      </Link>

      {/* Header */}
      <div className="border-l-2 pl-4 min-w-0" style={{ borderColor: '#c8a96e' }}>
        <p
          className="text-[11px] font-mono tracking-widest uppercase mb-1"
          style={{ color: '#6a6a80' }}
        >
          {CATEGORY_KO[company.category]}
        </p>
        <h1 className="text-xl md:text-2xl font-bold break-keep" style={{ color: '#f4eedd' }}>
          {company.name}
        </h1>
        {company.short_name && (
          <p className="text-sm mt-0.5 break-keep" style={{ color: '#6a6a80' }}>
            {company.short_name}
          </p>
        )}
      </div>

      {/* Locations */}
      {company.locations.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#13141a', border: '1px solid #272836' }}
        >
          <p
            className="text-[10px] font-mono tracking-widest uppercase mb-3"
            style={{ color: '#6a6a80' }}
          >
            운영 매장 / 건물
          </p>
          <div className="flex flex-wrap gap-2">
            {company.locations.map(loc => (
              <span
                key={loc}
                className="rounded-md px-3 py-1 text-sm break-keep"
                style={{ background: '#1c1d26', border: '1px solid #272836', color: '#e8e4dc' }}
              >
                {loc}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ownership */}
      {company.shareholders.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#13141a', border: '1px solid #272836' }}
        >
          <p
            className="text-[10px] font-mono tracking-widest uppercase mb-3"
            style={{ color: '#6a6a80' }}
          >
            주주구성
          </p>
          <OwnershipBar shareholders={company.shareholders} />

          {/* Mobile: stacked card list */}
          <ul className="mt-4 space-y-2 md:hidden">
            {company.shareholders.map((sh, i) => (
              <li
                key={sh.id ?? i}
                className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                style={{ background: '#1c1d26', border: '1px solid #272836' }}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium break-keep"
                    style={{ color: '#e8e4dc' }}
                  >
                    {sh.name}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#6a6a80' }}>
                    {sh.is_entity ? '법인' : '개인'}
                  </p>
                </div>
                <span
                  className="font-mono text-sm whitespace-nowrap"
                  style={{ color: '#c8a96e' }}
                >
                  {sh.percentage}%
                </span>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="mt-4 hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #272836' }}>
                  <th className="text-left pb-2 font-normal text-xs" style={{ color: '#6a6a80' }}>
                    주주
                  </th>
                  <th className="text-right pb-2 font-normal text-xs" style={{ color: '#6a6a80' }}>
                    지분율
                  </th>
                  <th className="text-right pb-2 font-normal text-xs" style={{ color: '#6a6a80' }}>
                    유형
                  </th>
                </tr>
              </thead>
              <tbody>
                {company.shareholders.map((sh, i) => (
                  <tr key={sh.id ?? i} style={{ borderBottom: '1px solid #1a1a26' }}>
                    <td className="py-2 pr-3 break-keep" style={{ color: '#e8e4dc' }}>
                      {sh.name}
                    </td>
                    <td
                      className="py-2 text-right font-mono whitespace-nowrap"
                      style={{ color: '#c8a96e' }}
                    >
                      {sh.percentage}%
                    </td>
                    <td className="py-2 text-right text-xs" style={{ color: '#6a6a80' }}>
                      {sh.is_entity ? '법인' : '개인'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Directors */}
      {company.directors.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#13141a', border: '1px solid #272836' }}
        >
          <p
            className="text-[10px] font-mono tracking-widest uppercase mb-3"
            style={{ color: '#6a6a80' }}
          >
            임원 현황
          </p>
          <ul className="space-y-2">
            {company.directors.map((d, i) => (
              <li
                key={d.id ?? i}
                className="flex justify-between items-start text-sm gap-3 flex-wrap sm:flex-nowrap"
              >
                <span className="break-keep min-w-0" style={{ color: '#e8e4dc' }}>
                  {d.name}
                </span>
                <div className="flex items-center gap-2 md:gap-3 shrink-0 flex-wrap justify-end">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-mono whitespace-nowrap"
                    style={{ background: '#1c1d26', color: '#7eb8d4', border: '1px solid #272836' }}
                  >
                    {ROLE_KO[d.role] ?? d.role}
                  </span>
                  {d.as_of_date && (
                    <span className="text-xs whitespace-nowrap" style={{ color: '#6a6a80' }}>
                      {d.as_of_date}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Relationships */}
      <div
        className="rounded-xl p-4"
        style={{ background: '#13141a', border: '1px solid #272836' }}
      >
        <p
          className="text-[10px] font-mono tracking-widest uppercase mb-3"
          style={{ color: '#6a6a80' }}
        >
          계열 관계
        </p>
        <div className="space-y-3 text-sm">
          {parent && (
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color: '#6a6a80' }}>모회사</span>
              <Link
                href={`/governance/${parent.id}`}
                className="rounded-md px-2 py-1 hover:opacity-80 break-keep"
                style={{ background: '#1c1d26', color: '#c8a96e', border: '1px solid #272836' }}
              >
                {parent.name}
              </Link>
            </div>
          )}
          {children.length > 0 && (
            <div className="flex items-start gap-2 flex-wrap">
              <span style={{ color: '#6a6a80' }}>자회사</span>
              <div className="flex flex-wrap gap-1.5">
                {children.map(ch => (
                  <Link
                    key={ch.id}
                    href={`/governance/${ch.id}`}
                    className="rounded-md px-2 py-1 text-xs hover:opacity-80 break-keep"
                    style={{ background: '#1c1d26', color: '#7eb8d4', border: '1px solid #272836' }}
                  >
                    {ch.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {!parent && children.length === 0 && (
            <p className="text-xs" style={{ color: '#6a6a80' }}>독립 법인 (계열 관계 없음)</p>
          )}
        </div>
      </div>
    </div>
  )
}
