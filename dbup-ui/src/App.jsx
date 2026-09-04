/**
 * App.jsx — routing + auth guard
 *
 * Route structure:
 *   /login               → LoginPage       (public)
 *   /oauth/callback      → OAuthCallback   (public, handles GitLab redirect)
 *   /*                   → ProtectedLayout  (requires authenticated session)
 *     /                  → Dashboard
 *     /new-script        → NewScript
 *     /templates         → Templates
 *     /rollback          → Rollback
 *     /pipelines         → Pipelines
 *     /history           → History
 *     /config            → Config (user info + settings)
 *
 * AuthGuard:
 *   - 'idle'             → spinner (checking backend session)
 *   - 'unauthenticated'  → redirect to /login
 *   - 'loading'          → spinner (loading project map)
 *   - 'authenticated'    → render children
 *   - 'error'            → redirect to /login with error preserved in context
 */
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext.jsx'
import Layout       from './components/Layout.jsx'
import LoginPage    from './pages/LoginPage.jsx'
import OAuthCallback from './pages/OAuthCallback.jsx'
import Dashboard    from './pages/Dashboard.jsx'
import NewScript    from './pages/NewScript.jsx'
import Templates    from './pages/Templates.jsx'
import Rollback     from './pages/Rollback.jsx'
import Pipelines    from './pages/Pipelines.jsx'
import History      from './pages/History.jsx'
import Config       from './pages/Config.jsx'
import Spinner      from './components/Spinner.jsx'
import BrandLogo    from './components/BrandLogo.jsx'

// ---------------------------------------------------------------------------
// Full-screen loading splash
// ---------------------------------------------------------------------------
function LoadingSplash({ message = 'Cargando...' }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'linear-gradient(135deg, #0d1229 0%, #1a2040 50%, #0d1229 100%)' }}
    >
      <div className="relative flex flex-col items-center gap-4">
        <BrandLogo size="md" />

        <Spinner size="lg" />

        <p className="text-sm font-medium" style={{ color: '#7b85b0' }}>{message}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Auth guard — wraps all protected routes
// ---------------------------------------------------------------------------
function AuthGuard({ children }) {
  const { authStatus } = useApp()
  const location = useLocation()

  // Still checking the backend session on mount
  if (authStatus === 'idle') {
    return <LoadingSplash message="Verificando sesión..." />
  }

  // Loading project map after successful token exchange
  if (authStatus === 'loading') {
    return <LoadingSplash message="Cargando repositorios..." />
  }

  // Not logged in → send to login, preserve intended destination
  if (authStatus === 'unauthenticated' || authStatus === 'error') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // authenticated → render page
  return children
}

// ---------------------------------------------------------------------------
// Root router
// ---------------------------------------------------------------------------
function AppRoutes() {
  return (
    <Routes>
      {/* ── Public routes ── */}
      <Route path="/login"          element={<LoginPage />} />
      <Route path="/oauth/callback" element={<OAuthCallback />} />

      {/* ── Protected routes ── */}
      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route index            element={<Dashboard />} />
        <Route path="new-script" element={<NewScript />} />
        <Route path="templates"  element={<Templates />} />
        <Route path="rollback"   element={<Rollback />} />
        <Route path="pipelines"  element={<Pipelines />} />
        <Route path="history"    element={<History />} />
        <Route path="config"     element={<Config />} />

        {/* Catch-all inside protected area */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  const routerBase = import.meta.env.BASE_URL === '/'
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <AppProvider>
      <BrowserRouter basename={routerBase}>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  )
}
