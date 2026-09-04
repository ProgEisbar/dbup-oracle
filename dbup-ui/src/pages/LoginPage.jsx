/**
 * LoginPage — login via GitLab OAuth (through backend).
 * The backend handles all token management. The frontend only redirects.
 */
import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Spinner from '../components/Spinner.jsx'
import BrandLogo from '../components/BrandLogo.jsx'

export default function LoginPage() {
  const { login, authStatus, authError } = useApp()
  const [loading, setLoading] = useState(false)

  function handleLogin() {
    if (loading) return
    setLoading(true)
    login()
  }

  const isError = authStatus === 'error'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0d1229 0%, #1a2040 50%, #0d1229 100%)' }}>

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandLogo size="lg" />
        </div>

        {/* Login card */}
        <div className="rounded-lg p-8 shadow-2xl"
          style={{ background: 'rgba(26,32,64,0.85)', border: '1px solid #2a3260', backdropFilter: 'blur(12px)' }}>

          <h1 className="text-white font-bold text-xl mb-2 text-center">Iniciar sesion</h1>
          <p className="text-center text-sm mb-6" style={{ color: '#7b85b0' }}>
            Usa tu cuenta de GitLab para acceder
          </p>

          {isError && authError && (
            <div className="mb-4 p-3 rounded-lg text-sm"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
              {authError}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-md font-bold text-base transition-all"
            style={{
              background: loading ? 'rgba(13,230,180,0.3)' : 'linear-gradient(90deg, #0de6b4, #0bc9a0)',
              color: loading ? 'rgba(10,30,20,0.5)' : '#0d1a13',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 0 24px rgba(13,230,180,0.3)',
            }}
          >
            {loading ? (
              <><Spinner size="sm" /> Redirigiendo a GitLab...</>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 380 380" fill="currentColor">
                  <path d="M282.83 170.73l-.27-.69-26.14-68.22a6.81 6.81 0 00-2.69-3.18 7 7 0 00-8 .43 7 7 0 00-2.32 3.52l-17.65 54H154.29l-17.65-54a6.86 6.86 0 00-2.32-3.52 7 7 0 00-8-.43 6.87 6.87 0 00-2.69 3.18L97.44 170l-.26.69a48.34 48.34 0 0016 55.89l.09.07.24.17 39.82 29.82 19.7 14.91 12 9.06a8.07 8.07 0 009.19 0l12-9.06 19.7-14.91 40.06-30 .1-.08a48.35 48.35 0 0016.1-55.94z"/>
                </svg>
                Iniciar sesion con GitLab
              </>
            )}
          </button>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#4a5280' }}>
          Tus credenciales se manejan de forma segura en el servidor.
          Ningun token llega a tu navegador.
        </p>
      </div>
    </div>
  )
}
