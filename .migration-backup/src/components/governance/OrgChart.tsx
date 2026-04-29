import Link from 'next/link'
import { CompanyWithRelations, Shareholder } from '@/types'

const SEGMENT_COLORS = ['#c8a96e', '#7eb8d4', '#85c49a', '#c47eb0', '#9b8fcc', '#d4a070', '#7a7a8a']

function MiniOwnerList({ shareholders }: { shareholders: Shareholder[] }) {
  return (
    <div className="mt-1.5 text-[10px] space-y-0.5" style={{ color: '#6a6a80' }}>
      {shareholders.map((s, i) => (
        <div key={s.id ?? i}>
          {s.name}{' '}
          <span className="font-mono" style={{ color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}>
            {s.percentage}%
          </span>
        </div>
      ))}
    </div>
  )
}

interface OrgBoxProps {
  company: CompanyWithRelations
  variant?: 'root' | 'sub' | 'standalone'
}

function OrgBox({ company, variant = 'sub' }: OrgBoxProps) {
  const ehSh = company.shareholders.find(s => s.name === '일레븐힐스')
  const nonEH = company.shareholders.filter(s => s.name !== '일레븐힐스')

  const style: React.CSSProperties =
    variant === 'root'
      ? { background: 'linear-gradient(135deg,#23200e,#1c1a08)', border: '1.5px solid #c8a96e', minWidth: 200 }
      : variant === 'standalone'
      ? { background: '#111118', border: '1px dashed #30304a' }
      : { background: '#1c1d26', border: '1px solid #272836' }

  return (
    <Link href={`/governance/${company.id}`}>
      <div
        className="rounded-xl p-3 text-center cursor-pointer transition-transform hover:-translate-y-0.5 min-w-[130px] max-w-[180px]"
        style={style}
      >
        <p
          className="font-bold text-sm"
          style={{ color: variant === 'root' ? '#c8a96e' : '#f4eedd' }}
        >
          {company.name}
        </p>
        {company.locations.length > 0 && (
          <p className="text-[10px] mt-0.5 leading-tight" style={{ color: '#6a6a80' }}>
            {company.locations.join('\n')}
          </p>
        )}
        {ehSh && (
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-mono mt-1.5"
            style={{ background: '#221a08', color: '#c8a96e', border: '1px solid #4a3820' }}
          >
            {ehSh.percentage}%
          </span>
        )}
        <MiniOwnerList shareholders={nonEH.length > 0 ? nonEH : company.shareholders} />
      </div>
    </Link>
  )
}

interface Props {
  holding: CompanyWithRelations
  standalones: CompanyWithRelations[]
}

export default function OrgChart({ holding, standalones }: Props) {
  const children = holding.children ?? []
  const CONNECTOR = <div className="flex justify-center"><div className="w-0.5 h-8" style={{ background: '#2e2e42' }} /></div>
  const HLINE_PCT = Math.min(90, children.length * 20)

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex flex-col items-center min-w-[900px]">
        {/* Root */}
        <OrgBox company={holding} variant="root" />

        {CONNECTOR}

        {/* Horizontal spread line */}
        <div className="relative w-full flex justify-center h-0.5 mb-0">
          <div
            className="absolute h-0.5"
            style={{ background: '#2e2e42', width: `${HLINE_PCT}%`, left: `${(100 - HLINE_PCT) / 2}%` }}
          />
        </div>

        {/* L1 children */}
        <div className="flex justify-center gap-3.5 w-full px-4">
          {children.map(child => (
            <div key={child.id} className="flex flex-col items-center">
              {/* Drop line */}
              <div className="w-0.5 h-5" style={{ background: '#2e2e42' }} />
              <OrgBox company={child} />
              {/* Sub-children */}
              {child.children && child.children.length > 0 && (
                <>
                  <div className="w-0.5 h-3.5" style={{ background: '#2e2e42' }} />
                  {child.children.map(sub => (
                    <div key={sub.id}
                      className="rounded-xl p-2 text-center"
                      style={{ background: '#0f0f18', border: '1px dashed #2a2a50', minWidth: 130 }}
                    >
                      <p className="text-xs font-semibold" style={{ color: '#7eb8d4' }}>{sub.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#6a6a80' }}>
                        {sub.locations.join(' · ')}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Standalone section */}
        {standalones.length > 0 && (
          <div className="w-full mt-12 border-t pt-6" style={{ borderColor: '#2e2e42' }}>
            <p className="text-center text-[10px] font-mono tracking-widest uppercase mb-5" style={{ color: '#6a6a80' }}>
              별도 법인 — 일레븐힐스 미관여
            </p>
            <div className="flex justify-center gap-3.5 flex-wrap">
              {standalones.map(c => (
                <OrgBox key={c.id} company={c} variant="standalone" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
