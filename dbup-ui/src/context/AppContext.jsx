/**
 * AppContext — global state for DBUP UI (Backend Proxy edition)
 *
 * Auth flow:
 *   1. Browser navigates to backend GET /auth/login
 *   2. Backend saves state and redirects to GitLab
 *   3. GitLab returns code+state directly to backend GET /auth/callback
 *   4. Backend stores the code briefly in the server-side session and redirects
 *      to the SPA loader without code/state in the frontend URL
 *   5. The SPA asks the backend to complete the one-time exchange
 *   6. Frontend reads only user/config metadata through the httpOnly session
 *
 * All subsequent API calls go through the backend proxy.
 * The browser automatically sends the httpOnly cookie.
 */
import React, {
  createContext, useContext, useEffect, useReducer, useCallback,
} from 'react'
import {
  getAuthStatus,
  getLoginUrl,
  completeLogin as apiCompleteLogin,
  logout as apiLogout,
  buildProjectMap,
} from '../services/api.js'
import { configureRuntimeConfig, getRuntimeConfig } from '../config/runtime.js'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const initialState = {
  // 'idle' | 'unauthenticated' | 'loading' | 'authenticated' | 'error'
  authStatus: 'idle',
  authError: null,

  // User from session (never contains a token)
  authUser: null,

  // DBUP project map
  projectMap: null,
  rootGroup:  null,
  subgroups:  null,

  // Safe server-side configuration metadata
  groupPath: '',
  gitlabBaseUrl: '',
  dbupConfig: getRuntimeConfig(),

  // Notifications
  notification: null,
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
function reducer(state, action) {
  switch (action.type) {
    case 'AUTH_LOADING':
      return { ...state, authStatus: 'loading', authError: null }

    case 'AUTH_SUCCESS':
      return {
        ...state,
        authStatus: 'authenticated',
        authError:  null,
        authUser:   action.payload.user,
        projectMap: action.payload.projectMap,
        rootGroup:  action.payload.rootGroup,
        subgroups:  action.payload.subgroups,
        groupPath: action.payload.groupPath,
        gitlabBaseUrl: action.payload.gitlabBaseUrl,
        dbupConfig: action.payload.dbupConfig,
      }

    case 'AUTH_ERROR':
      return { ...state, authStatus: 'error', authError: action.payload }

    case 'UNAUTHENTICATED':
      return {
        ...state,
        authStatus: 'unauthenticated',
        authUser: null,
        projectMap: null,
        rootGroup: null,
        subgroups: null,
      }

    case 'NOTIFY':
      return { ...state, notification: action.payload }

    case 'CLEAR_NOTIFICATION':
      return { ...state, notification: null }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Auto-dismiss notifications
  useEffect(() => {
    if (!state.notification) return
    const t = setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 5000)
    return () => clearTimeout(t)
  }, [state.notification])

  // On mount: check if we have a valid session (cookie-based)
  useEffect(() => {
    checkSession()
  }, []) // eslint-disable-line

  // ─── Actions ───────────────────────────────────────────────────────────────

  /**
   * Checks if the user has an active session (cookie).
   * If yes → loads project map. If no → marks as unauthenticated.
   */
  async function checkSession() {
    dispatch({ type: 'AUTH_LOADING' })
    try {
      const { authenticated, user, config: serverConfig } = await getAuthStatus()
      if (!authenticated) {
        dispatch({ type: 'UNAUTHENTICATED' })
        return
      }

      // Session active → load project map
      const dbupConfig = configureRuntimeConfig(serverConfig.dbup)
      const groupPath = serverConfig.groupPath
      const { root, subgroups, projectMap } = await buildProjectMap(groupPath)
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: {
          user,
          projectMap,
          rootGroup: root,
          subgroups,
          groupPath,
          gitlabBaseUrl: serverConfig.gitlabBaseUrl,
          dbupConfig,
        },
      })
      return true
    } catch (err) {
      if (err.status === 401) {
        dispatch({ type: 'UNAUTHENTICATED' })
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: err.message })
      }
      return false
    }
  }

  /**
   * Starts the login flow with a top-level navigation to the backend.
   */
  const login = useCallback(() => {
    window.location.assign(getLoginUrl())
  }, [])

  /**
   * Completes the pending OAuth exchange while the callback page shows the
   * branded loader, then loads the authenticated application state.
   */
  const finalizeLogin = useCallback(async () => {
    dispatch({ type: 'AUTH_LOADING' })
    try {
      await apiCompleteLogin()
      return await checkSession()
    } catch (err) {
      dispatch({ type: 'AUTH_ERROR', payload: err.message })
      return false
    }
  }, []) // eslint-disable-line

  /**
   * Logs out — destroys session on the server.
   */
  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch { /* ignore */ }
    dispatch({ type: 'UNAUTHENTICATED' })
  }, [])

  const notify = useCallback((type, message) => {
    dispatch({ type: 'NOTIFY', payload: { type, message } })
  }, [])

  const clearNotification = useCallback(() => {
    dispatch({ type: 'CLEAR_NOTIFICATION' })
  }, [])

  const getProject = useCallback(
    (env, entity) => state.projectMap?.[env]?.[entity] ?? null,
    [state.projectMap]
  )

  // ─── Backward-compat aliases ───────────────────────────────────────────────
  // Keep the UI-facing connection state aligned with backend sessions.
  const connectionStatus = state.authStatus === 'authenticated'
    ? 'connected'
    : state.authStatus === 'loading' ? 'connecting'
    : state.authStatus === 'error' ? 'error'
    : 'idle'

  const value = {
    ...state,
    connectionStatus,
    // Actions
    login,
    finalizeLogin,
    logout,
    notify,
    clearNotification,
    getProject,
    checkSession,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
