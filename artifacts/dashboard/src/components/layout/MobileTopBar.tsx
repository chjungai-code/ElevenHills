export default function MobileTopBar() {
  return (
    <header
      className="md:hidden sticky top-0 z-40"
      style={{
        background: 'rgba(11, 12, 16, 0.92)',
        borderBottom: '1px solid #1e1f2a',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
        <div className="pl-3 border-l-2 min-w-0" style={{ borderColor: '#c8a96e' }}>
          <p
            className="text-[9px] font-mono tracking-widest uppercase"
            style={{ color: '#6a6a80' }}
          >
            Corporate Gov.
          </p>
          <span className="text-sm font-bold truncate block" style={{ color: '#f4eedd' }}>
            일레븐힐스
          </span>
        </div>
      </div>
    </header>
  )
}
