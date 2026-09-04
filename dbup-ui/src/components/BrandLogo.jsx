const SIZES = {
  sm: { mark: 'h-10 w-10', gap: 'gap-2.5', app: 'text-[9px]' },
  md: { mark: 'h-14 w-14', gap: 'gap-3', app: 'text-[11px]' },
  lg: { mark: 'h-[72px] w-[72px]', gap: 'gap-4', app: 'text-sm' },
}

function DBUPMark({ className = '' }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dbup-teal/50 bg-dbup-card font-mono font-black text-dbup-teal ${className}`}
      aria-hidden="true"
    >
      DB
    </div>
  )
}

export default function BrandLogo({ size = 'md', compact = false, className = '' }) {
  const styles = SIZES[size] || SIZES.md

  return (
    <div
      className={`inline-flex items-center ${styles.gap} ${className}`}
      role="img"
      aria-label="DBUP DDL"
    >
      <DBUPMark className={`${styles.mark} shrink-0`} />
      {!compact && (
        <div className={`${styles.app} font-semibold uppercase tracking-[0.13em] text-dbup-muted`}>
          DBUP DDL
        </div>
      )}
    </div>
  )
}
