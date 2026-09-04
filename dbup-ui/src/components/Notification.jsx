/**
 * Notification toast — DBUP Toolkit brand colors.
 */
import { useApp } from '../context/AppContext.jsx'

export default function Notification() {
  const { notification, clearNotification } = useApp()
  if (!notification) return null

  const styles = {
    success: { background: 'rgba(13,230,180,0.15)', border: '1px solid rgba(13,230,180,0.4)', color: '#0de6b4' },
    error:   { background: 'rgba(239,68,68,0.15)',  border: '1px solid rgba(239,68,68,0.4)',  color: '#fca5a5' },
    info:    { background: 'rgba(204,39,176,0.15)', border: '1px solid rgba(204,39,176,0.4)', color: '#e879da' },
  }

  const icons = {
    success: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  }

  const style = styles[notification.type] ?? styles.info
  const icon  = icons[notification.type] ?? icons.info

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3
                 rounded-lg text-sm font-medium shadow-2xl max-w-sm backdrop-blur-sm"
      style={style}
      role="alert"
    >
      {icon}
      <span className="flex-1">{notification.message}</span>
      <button onClick={clearNotification}
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Cerrar">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
