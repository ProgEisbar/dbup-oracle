/**
 * Modal — DBUP Toolkit branded overlay modal.
 */
import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-dbup-navydark/85 backdrop-blur-sm"
        onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className={`relative w-full ${widths[size] ?? widths.md} rounded-lg flex flex-col max-h-[92vh] shadow-2xl overflow-hidden`}
        style={{ background: '#1a2040', border: '1px solid #2a3260' }}>

        {/* Header with gradient accent */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid #2a3260' }}>
          {/* Teal left accent */}
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg,#0de6b4,#cc27b0)' }} />
            <h2 className="text-white font-bold text-lg">{title}</h2>
          </div>
          <button onClick={onClose}
            className="transition-colors p-1 rounded-lg hover:bg-white/10"
            style={{ color: '#7b85b0' }}
            aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 lg:p-6 flex-1">{children}</div>
      </div>
    </div>
  )
}
