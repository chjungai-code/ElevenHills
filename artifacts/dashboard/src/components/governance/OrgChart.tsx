import { Link } from 'wouter'
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
      ? { background: 'linear-gradient(135deg,#23200e,#1c1a08)', border: '1.5px solid #c8a96e' }
      : variant === 'standalone'
      ? { background: '#111118', border: '1px dashed #30304a' }
      : { background: '#1c1d26', border: '1px solid #272836' }

  return (
    <Link href={`/governance/${company.id}`}>
      <div
        className="rounded-xl p-3 text-center cursor-pointer transition-transform hover:-translate-y-0.5 w-full md:min-w-[130px] md:max-w-[180px]"
        style={style}
      >
        <p
          className="font-bold text-sm break-keep"
          style={{ color: variant === 'root' ? '#c8a96e' : '#f4eedd' }}
        >
          {company.name}
        </p>
        {company.locations.length > 0 && (
          <p
            className="text-[10px] mt-0.5 leading-tight break-keep whitespace-pre-line"
            style={{ color: '#6a6a80' }}
          >
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

/**
 * Two presentations:
 *  - `< md`: stacked vertical org tree (no horizontal scroll required).
 *  - `md+`:  the original wide horizontal chart inside a horizontal scroller.
 */
export default function OrgChart({ holding, standalones }: Props) {
  return (
    <>
      <div className="md:hidden">
        <MobileOrgChart holding={holding} standalones={standalones} />
      </div>
      <div className="hidden md:block">
        <DesktopOrgChart holding={holding} standalones={standalones} />
      </div>
    </>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Desktop: original horizontal layout
 * ──────────────────────────────────────────────────────────────── */
function DesktopOrgChart({ holding, standalones }: Props) {
  const children = holding.children ?? []
  const CONNECTOR = (
    <div className="flex justify-center">
      <div className="w-0.5 h-8" style={{ background: '#2e2e42' }} />
    </div>
  )
  const HLINE_PCT = Math.min(90, children.length * 20)

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex flex-col items-center min-w-[900px]">
        {/* Root */}
        <div className="min-w-[200px]">
          <OrgBox company={holding} variant="root" />
        </div>

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
              <div className="w-0.5 h-5" style={{ background: '#2e2e42' }} />
              <OrgBox company={child} />
              {child.children && child.children.length > 0 && (
                <>
                  <div className="w-0.5 h-3.5" style={{ background: '#2e2e42' }} />
                  {child.children.map(sub => (
                    <div
                      key={sub.id}
                      className="rounded-xl p-2 text-center"
                      style={{ background: '#0f0f18', border: '1px dashed #2a2a50', minWidth: 130 }}
                    >
                      <p className="text-xs font-semibold break-keep" style={{ color: '#7eb8d4' }}>
                        {sub.name}
                      </p>
                      <p className="text-[10px] mt-0.5 break-keep" style={{ color: '#6a6a80' }}>
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
            <p
              className="text-center text-[10px] font-mono tracking-widest uppercase mb-5"
              style={{ color: '#6a6a80' }}
            >
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

/* ────────────────────────────────────────────────────────────────
 * Mobile: stacked vertical org tree
 *   Root at top.
 *   Each subsidiary is a full-width box with its sub-entities indented
 *   underneath via a left border connector.
 * ──────────────────────────────────────────────────────────────── */
function MobileOrgChart({ holding, standalones }: Props) {
  const children = holding.children ?? []

  return (
    <div className="space-y-4">
      {/* Root */}
      <OrgBox company={holding} variant="root" />

      {/* Vertical connector */}
      {children.length > 0 && (
        <div className="flex justify-center">
          <div className="w-0.5 h-5" style={{ background: '#2e2e42' }} />
        </div>
      )}

      {/* Subsidiaries */}
      {children.length > 0 && (
        <div
          className="ml-3 pl-4 space-y-4"
          style={{ borderLeft: '2px solid #2e2e42' }}
        >
          {children.map(child => (
            <div key={child.id} className="space-y-2">
              <div className="relative">
                {/* horizontal branch from the left border */}
                <span
                  aria-hidden
                  className="absolute"
                  style={{
                    left: -16,
                    top: 22,
                    width: 12,
                    height: 2,
                    background: '#2e2e42',
                  }}
                />
                <OrgBox company={child} />
              </div>

              {child.children && child.children.length > 0 && (
                <div
                  className="ml-3 pl-4 space-y-2"
                  style={{ borderLeft: '2px dashed #2a2a50' }}
                >
                  {child.children.map(sub => (
                    <div
                      key={sub.id}
                      className="relative rounded-xl p-2.5"
                      style={{ background: '#0f0f18', border: '1px dashed #2a2a50' }}
                    >
                      <span
                        aria-hidden
                        className="absolute"
                        style={{
                          left: -16,
                          top: 18,
                          width: 12,
                          height: 2,
                          background: '#2a2a50',
                        }}
                      />
                      <p
                        className="text-xs font-semibold break-keep"
                        style={{ color: '#7eb8d4' }}
                      >
                        {sub.name}
                      </p>
                      {sub.locations.length > 0 && (
                        <p
                          className="text-[10px] mt-0.5 break-keep"
                          style={{ color: '#6a6a80' }}
                        >
                          {sub.locations.join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Standalone section */}
      {standalones.length > 0 && (
        <div className="mt-8 pt-6" style={{ borderTop: '1px solid #2e2e42' }}>
          <p
            className="text-center text-[10px] font-mono tracking-widest uppercase mb-4"
            style={{ color: '#6a6a80' }}
          >
            별도 법인 — 일레븐힐스 미관여
          </p>
          <div className="space-y-3">
            {standalones.map(c => (
              <OrgBox key={c.id} company={c} variant="standalone" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
