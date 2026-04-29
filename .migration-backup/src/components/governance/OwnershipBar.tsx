import { Shareholder } from '@/types'

const SEGMENT_COLORS = ['#c8a96e', '#7eb8d4', '#85c49a', '#c47eb0', '#9b8fcc', '#d4a070', '#7a7a8a']

interface Props {
  shareholders: Shareholder[]
}

export default function OwnershipBar({ shareholders }: Props) {
  const total = shareholders.reduce((s, sh) => s + sh.percentage, 0)

  return (
    <div className="space-y-2">
      {/* Chips */}
      <div className="flex flex-wrap gap-1.5">
        {shareholders.map((sh, i) => (
          <div
            key={sh.id ?? i}
            className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs"
            style={{ background: '#12121a', border: '1px solid #25253a' }}
          >
            <span style={{ color: '#aaaaaa' }}>{sh.name}</span>
            <span className="font-mono" style={{ color: SEGMENT_COLORS[i % SEGMENT_COLORS.length], fontSize: '11px' }}>
              {sh.percentage}%
            </span>
          </div>
        ))}
      </div>
      {/* Bar */}
      <div className="h-1 rounded-full overflow-hidden flex" style={{ background: '#1e1e28' }}>
        {shareholders.map((sh, i) => (
          <div
            key={sh.id ?? i}
            style={{ width: `${(sh.percentage / total) * 100}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
          />
        ))}
      </div>
    </div>
  )
}
