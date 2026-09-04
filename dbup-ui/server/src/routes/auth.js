/**
 * GitLab OAuth BFF flow.
 *
 * Browser -> backend /auth/login -> GitLab -> backend /auth/callback -> SPA loader
 * -> backend /auth/complete -> application.
 * The authorization code, client secret and OAuth tokens stay in the backend.
 */
import { Router } from 'express'
import crypto from 'crypto'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import {
  exchangeCodeForToken,
  getUser,
  revokeToken,
} from '../services/gitlab.js'
import {
  destroySession,
  regenerateSession,
  saveSession,
} from '../services/session.js'

const router = Router()

function frontendUrl(pathname, params = {}) {
  const relativePath = pathname.replace(/^\/+/, '')
  const url = new URL(relativePath, `${config.frontendUrl}/`)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

function currentPendingStates(req) {
  const cutoff = Date.now() - config.oauth.stateTtlMs
  return Array.isArray(req.session.oauthStates)
    ? req.session.oauthStates.filter((entry) => entry.createdAt >= cutoff)
    : []
}

function consumePendingState(req, returnedState) {
  const pending = currentPendingStates(req)
  const index = pending.findIndex((entry) => entry.value === returnedState)
  if (index < 0) return false
  pending.splice(index, 1)
  req.session.oauthStates = pending
  return true
}

function errorReference() {
  return crypto.randomBytes(6).toString('hex')
}

router.get('/login', async (req, res, next) => {
  try {
    const state = crypto.randomBytes(32).toString('hex')
    const pending = currentPendingStates(req)
    pending.push({ value: state, createdAt: Date.now() })
    req.session.oauthStates = pending.slice(-config.oauth.maxPendingStates)
    delete req.session.oauthCallback

    const params = new URLSearchParams({
      client_id: config.gitlab.clientId,
      redirect_uri: config.oauth.redirectUri,
      response_type: 'code',
      scope: 'api',
      state,
    })

    await saveSession(req)
    res.redirect(302, `${config.gitlab.baseUrl}/oauth/authorize?${params}`)
  } catch (err) {
    next(err)
  }
})

router.get('/callback', async (req, res) => {
  const errorId = errorReference()

  try {
    const { code, state, error } = req.query

    if (error) {
      console.warn(`[auth/callback:${errorId}] GitLab rejected authorization:`, String(error))
      return res.redirect(302, frontendUrl('/oauth/callback', {
        error: 'oauth_denied',
        error_id: errorId,
      }))
    }

    if (
      typeof code !== 'string'
      || code.length === 0
      || code.length > 4096
      || typeof state !== 'string'
      || !/^[a-f0-9]{64}$/.test(state)
    ) {
      return res.redirect(302, frontendUrl('/oauth/callback', {
        error: 'missing_parameters',
        error_id: errorId,
      }))
    }

    if (!consumePendingState(req, state)) {
      console.warn(`[auth/callback:${errorId}] OAuth state missing, expired or already used.`)
      return res.redirect(302, frontendUrl('/oauth/callback', {
        error: 'invalid_state',
        error_id: errorId,
      }))
    }

    // Keep the short-lived authorization code only in the server-side session.
    // The SPA receives a clean callback URL and can render its branded loader
    // while asking the backend to finish the exchange.
    req.session.oauthCallback = {
      code,
      createdAt: Date.now(),
    }
    await saveSession(req)
    return res.redirect(302, frontendUrl('/oauth/callback'))
  } catch (err) {
    console.error(`[auth/callback:${errorId}] OAuth callback failed:`, err.code || err.name)
    return res.redirect(302, frontendUrl('/oauth/callback', {
      error: 'oauth_callback_failed',
      error_id: errorId,
    }))
  }
})

router.post('/complete', async (req, res) => {
  const errorId = errorReference()
  const pending = req.session?.oauthCallback

  if (!pending || typeof pending.code !== 'string') {
    return res.status(409).json({
      error: 'No hay un inicio de sesión pendiente o ya fue utilizado.',
      error_id: errorId,
    })
  }

  // Consume the callback before contacting GitLab so it cannot be replayed.
  delete req.session.oauthCallback

  try {
    await saveSession(req)

    if (
      !Number.isFinite(pending.createdAt)
      || Date.now() - pending.createdAt > config.oauth.callbackTtlMs
    ) {
      return res.status(410).json({
        error: 'El inicio de sesión venció. Iniciá sesión nuevamente.',
        error_id: errorId,
      })
    }

    const tokenData = await exchangeCodeForToken(pending.code, config.oauth.redirectUri)
    const user = await getUser(tokenData.access_token)

    // Rotate the session id after authentication to prevent session fixation.
    await regenerateSession(req)
    req.session.accessToken = tokenData.access_token
    req.session.refreshToken = tokenData.refresh_token || null
    req.session.tokenExpiry = tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : null
    req.session.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
    }

    await saveSession(req)
    return res.json({ success: true })
  } catch (err) {
    console.error(`[auth/complete:${errorId}] OAuth exchange failed:`, err.code || err.name)
    return res.status(502).json({
      error: 'GitLab no pudo completar el inicio de sesión.',
      error_id: errorId,
    })
  }
})

router.get('/me', requireAuth, (req, res) => {
  res.json({
    authenticated: true,
    user: req.session.user,
    config: {
      gitlabBaseUrl: config.gitlab.baseUrl,
      groupPath: config.gitlab.groupPath,
      dbup: config.dbup,
    },
  })
})

router.post('/logout', async (req, res) => {
  const token = req.session?.accessToken

  try {
    await destroySession(req)
    res.clearCookie('dbup.sid', { path: '/' })
  } catch {
    return res.status(500).json({ error: 'Error al cerrar sesión.' })
  }

  if (token) {
    try {
      await revokeToken(token)
    } catch (err) {
      console.warn('[auth/logout] GitLab token revocation failed:', err.code || err.name)
    }
  }

  return res.json({ success: true })
})

export default router
