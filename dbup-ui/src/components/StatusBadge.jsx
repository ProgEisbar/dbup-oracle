/**
 * StatusBadge — colored pill for pipeline/job status.
 * Uses DBUP Toolkit brand colors.
 */
export default function StatusBadge({ status, size = 'md' }) {
  const s = (status || 'unknown').toLowerCase()

  const colors = {
    success:  'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    failed:   'bg-red-500/20 text-red-400 border border-red-500/30',
    running:  { background: 'rgba(13,230,180,0.15)', color: '#0de6b4', border: '1px solid rgba(13,230,180,0.35)' },
    pending:  'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
    manual:   { background: 'rgba(204,39,176,0.15)', color: '#cc27b0', border: '1px solid rgba(204,39,176,0.35)' },
    canceled: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    skipped:  'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    created:  'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    unknown:  'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  }

  const dots = {
    success: '●', failed: '●', running: '◌', pending: '○',
    manual: '▶', canceled: '✕', skipped: '–', created: '○', unknown: '?',
  }

  const sizes = {
    sm: 'text-xs px-1.5 py-0.5 rounded',
    md: 'text-xs px-2 py-1 rounded-md',
    lg: 'text-sm px-3 py-1 rounded-md font-bold',
  }

  const colorDef = colors[s] ?? colors.unknown
  const dot = dots[s] ?? '?'
  const sizeClass = sizes[size] ?? sizes.md
  const isAnimated = s === 'running' || s === 'pending'

  // String class vs style object
  if (typeof colorDef === 'string') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono ${colorDef} ${sizeClass}`}>
        <span className={isAnimated ? 'animate-pulse' : ''}>{dot}</span>
        {s}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono ${sizeClass}`}
      style={colorDef}
    >
      <span className={isAnimated ? 'animate-pulse' : ''}>{dot}</span>
      {s}
    </span>
  )
}
