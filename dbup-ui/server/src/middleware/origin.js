/**
 * CORS controls response visibility; this check also blocks cross-origin state
 * changes (CSRF) before they reach authenticated routes.
 */
import { config } from '../config.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function requireTrustedOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next()

  const origin = req.get('origin')
  if (origin !== config.frontendOrigin) {
    return res.status(403).json({ error: 'Origen no permitido.' })
  }

  return next()
}
