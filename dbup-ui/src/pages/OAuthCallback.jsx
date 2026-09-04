/**
 * Branded OAuth transition. The authorization code never reaches this page:
 * it asks the backend to consume the short-lived callback stored in session.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import Spinner from '../components/Spinner.jsx'
import { useApp } from '../context/AppContext.jsx'

const ERROR_MESSAGES = {
  oauth_denied: 'GitLab rechazó o canceló la autorización.',
  missing_parameters: 'GitLab no devolvió todos los parámetros de autorización.',
  invalid_state: 'El intento de inicio de sesión venció o ya fue utilizado. Iniciá sesión nuevamente.',
  oauth_callback_failed: 'No se pudo recibir la autorización de GitLab. Iniciá sesión nuevamente.',
}

export default function OAuthCallback() {
  const navigate = useNavigate()
  const { finalizeLogin } = useApp()
  const [completionFailed, setCompletionFailed] = useState(false)
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')
  const errorId = params.get('error_id')
  const hasError = Boolean(error) || completionFailed
  const errorMsg = ERROR_MESSAGES[error] || 'No se pudo completar el inicio de sesión.'

  useEffect(() => {
    if (error) return

    let active = true
    finalizeLogin().then((success) => {
      if (!active) return
      if (success) {
        navigate('/', { replace: true })
      } else {
        setCompletionFailed(true)
      }
    })

    return () => { active = false }
  }, [error, finalizeLogin, navigate])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0d1229 0%, #1a2040 50%, #0d1229 100%)' }}>
      <div className="relative w-full max-w-sm text-center">
        <div className="flex justify-center mb-8">
          <BrandLogo size="md" />
        </div>

        {hasError ? (
          <div className="rounded-lg p-8"
            style={{ background: 'rgba(26,32,64,0.85)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div className="text-4xl mb-4">&#x274C;</div>
            <h2 className="text-white font-bold text-lg mb-2">Error al iniciar sesión</h2>
            <p className="text-sm mb-2" style={{ color: '#fca5a5' }}>{errorMsg}</p>
            {errorId && (
              <p className="text-xs mb-6 font-mono" style={{ color: '#7b85b0' }}>
                Referencia: {errorId}
              </p>
            )}
            <button onClick={() => navigate('/login', { replace: true })} className="btn-primary w-full">
              Volver al inicio
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
            <Spinner size="lg" />
            <p className="text-sm font-medium" style={{ color: '#7b85b0' }}>
              Completando inicio de sesión...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
