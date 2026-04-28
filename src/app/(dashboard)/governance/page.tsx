'use client'

import { useState } from 'react'
import { buildCompanyTree, FAMILY_MEMBERS } from '@/lib/data/companies'
import TreeView from '@/components/governance/TreeView'
import OrgChart from '@/components/governance/OrgChart'

export default function GovernancePage() {
  const [view, setView] = useState<'tree' | 'org'>('tree')
  const { holding, standalones } = buildCompanyTree()

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="border-l-2 pl-4" style={{ borderColor: '#c8a96e' }}>
          <p className="text-[11px] font-mono tracking-widest uppercase mb-1" style={{ color: '#6a6a80' }}>
            Corporate Governance
          </p>
          <h1 className="text-2xl font-bold" style={{ color: '#f4eedd' }}>지배구조</h1>
        </div>

        {/* View toggle */}
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ background: '#13141a', border: '1px solid #272836' }}
        >
          {(['tree', 'org'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="rounded-lg px-4 py-1.5 text-xs font-mono transition-colors"
              style={
                view === v
                  ? { background: '#1c1d26', color: '#c8a96e', border: '1px solid #272836' }
                  : { background: 'transparent', color: '#6a6a80', border: '1px solid transparent' }
              }
            >
              {v === 'tree' ? '🌿 트리 구조' : '📊 Org Chart'}
            </button>
          ))}
        </div>
      </div>

      {/* Family bar */}
      <div
        className="rounded-xl px-4 py-3 flex flex-wrap gap-5 items-center text-sm"
        style={{ background: '#13141a', border: '1px solid #272836' }}
      >
        <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: '#c8a96e' }}>
          가족관계
        </span>
        {FAMILY_MEMBERS.map(m => (
          <span key={m.name} className="flex items-center gap-1.5">
            <span className="font-semibold" style={{ color: m.color }}>{m.name}</span>
            <span className="text-xs" style={{ color: '#6a6a80' }}>{m.role}</span>
          </span>
        ))}
      </div>

      {/* Chart */}
      {view === 'tree'
        ? <TreeView holding={holding} standalones={standalones} />
        : <OrgChart  holding={holding} standalones={standalones} />
      }
    </div>
  )
}
