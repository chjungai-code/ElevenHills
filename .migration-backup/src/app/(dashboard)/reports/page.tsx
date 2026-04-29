export default function ReportsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="border-l-2 pl-4" style={{ borderColor: '#c8a96e' }}>
        <p className="text-[11px] font-mono tracking-widest uppercase mb-1" style={{ color: '#6a6a80' }}>
          Reports
        </p>
        <h1 className="text-2xl font-bold" style={{ color: '#f4eedd' }}>보고서</h1>
      </div>
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: '#13141a', border: '1px dashed #272836' }}
      >
        <p className="text-sm" style={{ color: '#6a6a80' }}>Phase 3 — 카카오 일일 보고 (개발 예정)</p>
      </div>
    </div>
  )
}
