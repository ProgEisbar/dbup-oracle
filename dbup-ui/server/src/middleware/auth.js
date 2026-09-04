/**
 * Auth middleware with automatic OAuth token rotation.
 */
import { config } from '../config.js'
import { refreshAccessToken } from '../services/gitlab.js'
import { destroySession, saveSession } from '../services/session.js'

const REFRESH_SKEW_MS = 60_000
const refreshLocks = new Map()

function unauthorized(res) {
  res.clearCookie('dbup.sid', { path: '/' })
  return res.status(401).json({
    error: 'No autenticado',
    message: 'Iniciá sesión para acceder a este recurso.',
  })
}

function tokenHasExpiredOrWillExpire(session) {
  return Boolean(
    session.tokenExpiry
    && Date.now() >= session.tokenExpiry - REFRESH_SKEW_MS
  )
}

async function rotateToken(req) {
  const lockKey = req.sessionID
  let pending = refreshLocks.get(lockKey)

  if (!pending) {
    pending = refreshAccessToken(req.session.refreshToken, config.oauth.redirectUri)
    refreshLocks.set(lockKey, pending)
    pending.finally(() => refreshLocks.delete(lockKey)).catch(() => {})
  }

  const tokenData = await pending
  req.session.accessToken = tokenData.access_token
  req.session.refreshToken = tokenData.refresh_token || null
  req.session.tokenExpiry = tokenData.expires_in
    ? Date.now() + tokenData.expires_in * 1000
    : null
  await saveSession(req)
}

export async function requireAuth(req, res, next) {
  if (!req.session?.accessToken) return unauthorized(res)

  if (!tokenHasExpiredOrWillExpire(req.session)) return next()

  if (!req.session.refreshToken) {
    await destroySession(req).catch(() => {})
    return unauthorized(res)
  }

  try {
    await rotateToken(req)
    return next()
  } catch (err) {
    console.warn('[auth] OAuth token refresh failed:', err.code || err.name)
    await destroySession(req).catch(() => {})
    return unauthorized(res)
  }
}
