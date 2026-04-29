import { CompanyWithRelations } from '@/types'
import CompanyCard from './CompanyCard'

interface Props {
  holding: CompanyWithRelations
  standalones: CompanyWithRelations[]
}

export default function TreeView({ holding, standalones }: Props) {
  const children = holding.children ?? []

  return (
    <div>
      {/* Root */}
      <div className="mb-0">
        <CompanyCard company={holding} />
      </div>

      {/* Children with tree lines */}
      <div
        className="ml-10 pl-0 mt-0"
        style={{ borderLeft: '2px solid #2e2e42' }}
      >
        {children.map(child => (
          <div key={child.id}>
            <div
              className="flex items-start mt-4 relative"
              style={{ marginLeft: 0 }}
            >
              {/* Horizontal branch */}
              <div
                className="shrink-0 mt-5"
                style={{ width: '28px', height: '2px', background: '#2e2e42' }}
              />
              <div className="flex-1 ml-0">
                <CompanyCard company={child} />

                {/* Sub-children */}
                {child.children && child.children.length > 0 && (
                  <div
                    className="ml-10 mt-0"
                    style={{ borderLeft: '2px solid #2e2e42' }}
                  >
                    {child.children.map(sub => (
                      <div key={sub.id} className="flex items-start mt-3 relative">
                        <div
                          className="shrink-0 mt-4"
                          style={{ width: '28px', height: '2px', background: '#2e2e42' }}
                        />
                        <div className="flex-1">
                          <CompanyCard company={sub} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Standalone section */}
      {standalones.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: '#2e2e42' }} />
            <span className="text-[10px] font-mono tracking-widest uppercase whitespace-nowrap" style={{ color: '#6a6a80' }}>
              별도 법인 — 일레븐힐스 미관여
            </span>
            <div className="flex-1 h-px" style={{ background: '#2e2e42' }} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {standalones.map(c => (
              <CompanyCard key={c.id} company={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
