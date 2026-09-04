/**
 * Sidebar — main navigation with DBUP Toolkit brand identity.
 * Colors: teal #0de6b4, magenta #cc27b0, navy dark background.
 */
import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import BrandLogo from './BrandLogo.jsx'

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/new-script',
    label: 'Nuevo Script DDL',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    to: '/templates',
    label: 'Templates',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/rollback',
    label: 'Rollback',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* Reloj con flecha de retroceso — estilo similar a la imagen */}
        <path d="M1 4v6h6" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        <polyline points="12 7 12 12 16.5 14.5" />
      </svg>
    ),
  },
  {
    to: '/pipelines',
    label: 'Pipelines',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    to: '/history',
    label: 'Historial',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
]

export default function Sidebar() {
  const { connectionStatus, authUser, logout } = useApp()
  const navigate = useNavigate()
  const isConnected = connectionStatus === 'connected'

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: 'linear-gradient(180deg, #1a2040 0%, #111629 100%)', borderRight: '1px solid #2a3260' }}>

      <div className="px-5 py-4" style={{ borderBottom: '1px solid #2a3260' }}>
        <BrandLogo size="sm" />
      </div>

      {/* User info */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #2a3260' }}>
        {isConnected && authUser ? (
          <div className="flex items-center gap-2">
            {/* Avatar */}
            {authUser.avatar_url ? (
              <img
                src={authUser.avatar_url}
                alt={authUser.name}
                className="w-7 h-7 rounded-full shrink-0 ring-1"
                style={{ ringColor: '#0de6b4' }}
              />
            ) : (
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                style={{ background: 'linear-gradient(135deg,#0de6b4,#cc27b0)', color: '#0d1a13' }}>
                {authUser.name?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold truncate text-white">{authUser.name}</div>
              <div className="text-xs truncate" style={{ color: '#7b85b0' }}>@{authUser.username}</div>
            </div>
            {/* Online dot */}
            <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: '#0de6b4' }} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-dbup-border rounded-full shrink-0" />
            <span className="text-xs" style={{ color: '#7b85b0' }}>No autenticado</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'font-bold'
                  : 'font-normal hover:bg-white/5'
              } ${!isConnected && item.to !== '/' ? 'opacity-30 pointer-events-none' : ''}`
            }
            style={({ isActive }) => isActive
              ? { background: 'rgba(13,230,180,0.1)', color: '#0de6b4', borderLeft: '3px solid #0de6b4', paddingLeft: '9px' }
              : { color: '#dde3f5', borderLeft: '3px solid transparent', paddingLeft: '9px' }
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 space-y-0.5" style={{ borderTop: '1px solid #2a3260' }}>
        <NavLink
          to="/config"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              isActive ? 'font-bold' : 'font-normal hover:bg-white/5'
            }`
          }
          style={({ isActive }) => isActive
            ? { color: '#0de6b4' }
            : { color: '#7b85b0' }
          }
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Configuración
        </NavLink>

        {isConnected && (
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-white/5 transition-all"
            style={{ color: '#7b85b0', borderLeft: '3px solid transparent', paddingLeft: '9px' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = '#7b85b0'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Cerrar sesión
          </button>
        )}
      </div>

      {/* application gradient bar at bottom — used as a visual accent */}
      <div className="dbup-gradient-bar" />
    </aside>
  )
}
