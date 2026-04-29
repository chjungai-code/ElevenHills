import { Link } from 'wouter'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0b0c10' }}>
      <div className="max-w-sm text-center space-y-4">
        <p className="text-[10px] font-mono tracking-widest uppercase" style={{ color: '#c8a96e' }}>404</p>
        <h1 className="text-2xl font-bold" style={{ color: '#f4eedd' }}>페이지를 찾을 수 없습니다</h1>
        <Link
          href="/"
          className="inline-block rounded-lg px-4 py-2 text-sm"
          style={{ background: '#c8a96e', color: '#0b0c10' }}
        >
          홈으로
        </Link>
      </div>
    </div>
  )
}
