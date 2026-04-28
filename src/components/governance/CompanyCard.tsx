import Link from 'next/link'
import { CompanyWithRelations } from '@/types'
import OwnershipBar from './OwnershipBar'

const CATEGORY_BADGE: Record<string, { label: string; style: React.CSSProperties }> = {
  holding:    { label: '최상위 홀딩', style: { background: '#2a2010', color: '#c8a96e', border: '1px solid #4a3820' } },
  subsidiary: { label: '자회사',      style: { background: '#102028', color: '#7eb8d4', border: '1px solid #204050' } },
  standalone: { label: '별도 법인',   style: { background: '#102018', color: '#85c49a', border: '1px solid #204030' } },
  sub_entity: { label: '손자회사',    style: { background: '#1a1020', color: '#c47eb0', border: '1px solid #3a2040' } },
}

interface Props {
  company: CompanyWithRelations
  ehPct?: number  // 일레븐힐스 ownership % if applicable
}

export default function CompanyCard({ company, ehPct }: Props) {
  const badge = CATEGORY_BADGE[company.category]
  const ehShareholder = company.shareholders.find(s => s.name === '일레븐힐스')
  const displayPct = ehPct ?? ehShareholder?.percentage

  return (
    <Link href={`/governance/${company.id}`}>
      <div
        className="rounded-xl p-5 cursor-pointer transition-colors group"
        style={{ background: '#1c1d26', border: '1px solid #272836' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#c8a96e')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#272836')}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-base" style={{ color: '#f4eedd' }}>{company.name}</h3>
            {company.locations.length > 0 && (
              <p className="text-xs mt-0.5" style={{ color: '#6a6a80' }}>
                {company.locations.join(' · ')}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-mono" style={badge.style}>
              {badge.label}
            </span>
            {displayPct !== undefined && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-mono"
                style={{ background: '#221a08', color: '#c8a96e', border: '1px solid #4a3820' }}
              >
                일레븐힐스 {displayPct}%
              </span>
            )}
          </div>
        </div>

        {/* Ownership */}
        {company.shareholders.length > 0 && (
          <>
            <p className="text-[10px] font-mono tracking-widest uppercase mb-2" style={{ color: '#6a6a80' }}>
              주주구성
            </p>
            <OwnershipBar shareholders={company.shareholders} />
          </>
        )}

        {/* Children chips */}
        {company.children && company.children.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #272836' }}>
            {company.children.map(child => (
              <span
                key={child.id}
                className="rounded-md px-2 py-0.5 text-xs"
                style={{ background: '#13131b', border: '1px solid #22223a', color: '#7eb8d4' }}
              >
                ↳ {child.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
