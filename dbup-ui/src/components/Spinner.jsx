/**
 * Spinner — uses the primary application color.
 */
export default function Spinner({ size = 'md', label = 'Cargando...' }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-10 h-10 border-[3px]' }
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block rounded-full animate-spin ${sizes[size] ?? sizes.md}`}
      style={{ borderColor: '#2a3260', borderTopColor: '#0de6b4' }}
    />
  )
}
