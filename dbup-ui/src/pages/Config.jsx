/**
 * Config page — user info + app settings (OAuth edition).
 * Token management is handled transparently via OAuth.
 * This page shows who is logged in and the safe, server-controlled settings.
 */
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { ENVIRONMENTS } from '../services/api.js'

export default function Config() {
  const {
    authUser, authStatus, logout, projectMap, groupPath, gitlabBaseUrl,
  } = useApp()
  const navigate = useNavigate()

  const isAuthenticated = authStatus === 'authenticated'

  function handleLogout() {
    logout()
    navigate('/login')
  }

  // Count accessible repos
  const repoCount = projectMap
    ? Object.values(projectMap).reduce((acc, envMap) => acc + Object.keys(envMap).length, 0)
    : 0

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full shrink-0"
          style={{ background: 'linear-gradient(180deg,#0de6b4,#cc27b0)' }} />
        <h1 className="page-title mb-0">Configuración</h1>
      </div>

      {/* ── User card ── */}
      {isAuthenticated && authUser && (
        <div className="card mb-8">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            {authUser.avatar_url ? (
              <img
                src={authUser.avatar_url}
                alt={authUser.name}
                className="w-16 h-16 rounded-full shrink-0"
                style={{ border: '2px solid #0de6b4' }}
              />
            ) : (
              <div className="w-16 h-16 rounded-full shrink-0 flex items-center justify-center text-2xl font-bold"
                style={{ background: 'linear-gradient(135deg,#0de6b4,#cc27b0)', color: '#0d1a13' }}>
                {authUser.name?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-lg leading-tight">{authUser.name}</div>
              <div className="text-sm" style={{ color: '#7b85b0' }}>@{authUser.username}</div>
              {authUser.email && (
                <div className="text-xs mt-0.5" style={{ color: '#7b85b0' }}>{authUser.email}</div>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#0de6b4' }} />
                <span className="text-xs font-medium" style={{ color: '#0de6b4' }}>
                  Sesión activa via GitLab OAuth
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="btn-secondary text-sm shrink-0 flex items-center gap-2"
              style={{ borderColor: 'rgba(248,113,113,0.4)', color: '#f87171' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#f87171'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* ── Repo access summary ── */}
      {isAuthenticated && projectMap && (
        <div className="card mb-8">
          <h2 className="section-title">Acceso a repositorios</h2>
          <div className="space-y-2">
            {ENVIRONMENTS.map((env) => {
              const entities = Object.keys(projectMap[env] || {})
              const envStyle = {
                DEV: { bg: 'rgba(13,230,180,0.1)', color: '#0de6b4', border: 'rgba(13,230,180,0.3)' },
                QA:  { bg: 'rgba(234,179,8,0.1)',  color: '#fde047', border: 'rgba(234,179,8,0.3)' },
                UAT: { bg: 'rgba(204,39,176,0.1)', color: '#cc27b0', border: 'rgba(204,39,176,0.3)' },
              }[env] || { bg: 'rgba(123,133,176,0.1)', color: '#dde3f5', border: 'rgba(123,133,176,0.3)' }

              return (
                <div key={env} className="flex items-center gap-3 text-sm">
                  <span className="w-14 text-center rounded-md px-2 py-0.5 text-xs font-bold"
                    style={{ background: envStyle.bg, color: envStyle.color, border: `1px solid ${envStyle.border}` }}>
                    {env}
                  </span>
                  {entities.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {entities.map(e => (
                        <span key={e} className="text-xs px-2 py-0.5 rounded"
                          style={{ background: '#2a3260', color: '#dde3f5' }}>
                          ENTIDAD{e}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs italic" style={{ color: '#7b85b0' }}>Sin acceso</span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-3 pt-3 text-xs" style={{ borderTop: '1px solid #2a3260', color: '#7b85b0' }}>
            <strong className="text-white">{repoCount}</strong> repositorios accesibles con tu token
          </div>
        </div>
      )}

      {/* ── Server-controlled settings ── */}
      <div className="card">
        <h2 className="section-title">Configuración del servidor</h2>
        <p className="text-xs mb-5" style={{ color: '#7b85b0' }}>
          Estos valores son de solo lectura. Se administran en el backend para que el
          navegador no pueda cambiar el destino de la API ni el ámbito permitido.
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">URL de GitLab</label>
            <input
              type="text"
              className="input opacity-75"
              value={gitlabBaseUrl || ''}
              readOnly
            />
          </div>

          <div>
            <label className="label">Path del grupo DBUP</label>
            <input
              type="text"
              className="input font-mono text-sm opacity-75"
              value={groupPath || ''}
              readOnly
            />
          </div>
        </div>
      </div>

      {/* ── Security note ── */}
      <div className="mt-6 p-4 rounded-xl text-xs space-y-1"
        style={{ background: 'rgba(13,230,180,0.05)', border: '1px solid rgba(13,230,180,0.15)' }}>
        <div className="font-bold mb-1" style={{ color: '#0de6b4' }}>Seguridad y auditoría</div>
        <p style={{ color: '#7b85b0' }}>
          Todos los commits realizados desde esta app quedan firmados con tu usuario de GitLab
          (<strong className="text-white">@{authUser?.username ?? '...'}</strong>),
          no con un bot o token compartido.
        </p>
        <p style={{ color: '#7b85b0' }}>
          El access token y el refresh token se guardan únicamente en la sesión del backend.
          El navegador recibe una cookie opaca, httpOnly, que JavaScript no puede leer.
        </p>
      </div>
    </div>
  )
}
