/**
 * Proxy routes — all GitLab API calls pass through here.
 *
 * The frontend calls these endpoints; the backend injects the OAuth token
 * from the session and forwards to GitLab. The token NEVER reaches the browser.
 *
 * Routes:
 *   GET    /api/groups/:groupPath                → Group info
 *   GET    /api/groups/:groupId/subgroups        → Subgroups
 *   GET    /api/groups/:groupId/projects         → Projects in group
 *   GET    /api/projects/:id                     → Project info
 *   GET    /api/projects/:id/pipelines           → List pipelines
 *   GET    /api/projects/:id/pipelines/:pid      → Single pipeline
 *   GET    /api/projects/:id/pipelines/:pid/jobs → Jobs of pipeline
 *   POST   /api/projects/:id/pipelines/:pid/retry  → Retry pipeline
 *   POST   /api/projects/:id/pipelines/:pid/cancel → Cancel pipeline
 *   POST   /api/projects/:id/pipeline            → Create pipeline
 *   POST   /api/projects/:id/jobs/:jid/play      → Play manual job
 *   POST   /api/projects/:id/jobs/:jid/retry     → Retry job
 *   POST   /api/projects/:id/jobs/:jid/cancel    → Cancel job
 *   GET    /api/projects/:id/jobs/:jid/trace     → Job log (text)
 *   GET    /api/projects/:id/repository/tree     → File tree
 *   GET    /api/projects/:id/repository/files/*  → File content
 *   POST   /api/projects/:id/repository/files/*  → Create file
 *   PUT    /api/projects/:id/repository/files/*  → Update file
 *   DELETE /api/projects/:id/repository/files/*  → Delete file
 *   GET    /api/projects/:id/repository/commits  → Commits
 */
import { Router } from 'express'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { gitlabFetch } from '../services/gitlab.js'
import { destroySession } from '../services/session.js'

const router = Router()

// All proxy routes require authentication
router.use(requireAuth)

const SCOPE_CACHE_TTL_MS = 5 * 60 * 1000
const SCOPE_CACHE_MAX_ENTRIES = 5_000
const scopeCache = new Map()

function cacheScope(key, allowed) {
  if (scopeCache.size >= SCOPE_CACHE_MAX_ENTRIES) {
    const now = Date.now()
    for (const [cachedKey, entry] of scopeCache) {
      if (entry.expiresAt <= now) scopeCache.delete(cachedKey)
    }
    if (scopeCache.size >= SCOPE_CACHE_MAX_ENTRIES) {
      scopeCache.delete(scopeCache.keys().next().value)
    }
  }
  scopeCache.set(key, { allowed, expiresAt: Date.now() + SCOPE_CACHE_TTL_MS })
}

function isInsideConfiguredGroup(fullPath) {
  return fullPath === config.gitlab.groupPath
    || fullPath.startsWith(`${config.gitlab.groupPath}/`)
}

function scopedParam(kind) {
  return async (req, res, next, rawId) => {
    if (!/^\d+$/.test(rawId)) {
      return res.status(400).json({ error: `${kind} inválido.` })
    }

    const cacheKey = `${req.session.user?.id}:${kind}:${rawId}`
    const cached = scopeCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.allowed
        ? next()
        : res.status(403).json({ error: `${kind} fuera del ámbito DBUP.` })
    }

    try {
      const resourcePath = kind === 'Proyecto' ? `/projects/${rawId}` : `/groups/${rawId}`
      const gitlabRes = await gitlabFetch(req.session.accessToken, resourcePath)
      if (!gitlabRes.ok) {
        return res.status(gitlabRes.status).json({ error: `${kind} no disponible.` })
      }

      const resource = await gitlabRes.json()
      const fullPath = kind === 'Proyecto' ? resource.path_with_namespace : resource.full_path
      const allowed = typeof fullPath === 'string' && isInsideConfiguredGroup(fullPath)
      cacheScope(cacheKey, allowed)

      return allowed
        ? next()
        : res.status(403).json({ error: `${kind} fuera del ámbito DBUP.` })
    } catch (err) {
      console.error(`[proxy] Could not validate ${kind} scope:`, err.name)
      return res.status(502).json({ error: 'No se pudo validar el ámbito en GitLab.' })
    }
  }
}

router.param('groupId', scopedParam('Grupo'))
router.param('id', scopedParam('Proyecto'))

function requireNumericParam(label) {
  return (req, res, next, value) => {
    if (!/^\d+$/.test(value)) {
      return res.status(400).json({ error: `${label} inválido.` })
    }
    return next()
  }
}

router.param('pid', requireNumericParam('Pipeline'))
router.param('jid', requireNumericParam('Job'))

function repositoryBody(req) {
  const user = req.session.user
  return {
    ...(req.body || {}),
    author_name: user.name,
    author_email: user.email || `${user.username}@example.invalid`,
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const rollbackFolders = [
  config.dbup.sharedFolder,
  ...config.dbup.environments.map((environment) => environment.toLowerCase()),
]
const ROLLBACK_SCRIPT_PATTERN = new RegExp(
  `^(?:${rollbackFolders.map(escapeRegExp).join('|')})/`
  + `(?:${config.dbup.schemaTypes.map(escapeRegExp).join('|')})`
  + `(?:${config.dbup.entities.map(escapeRegExp).join('|')})/`
  + `${escapeRegExp(config.dbup.ticketPrefix)}-\\d+_[A-Za-z0-9_]+_rollback\\.sql$`,
)

// ─────────────────────────────────────────────────────────────────────────────
// Generic proxy handler — forwards the request to GitLab API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proxies a request to GitLab and streams the response back.
 * Preserves status code, content-type, and pagination headers.
 */
async function proxyToGitLab(req, res, gitlabPath, options = {}) {
  try {
    const token = req.session.accessToken

    // Forward query params from the original request
    const qs = new URLSearchParams(req.query).toString()
    const fullPath = qs ? `${gitlabPath}?${qs}` : gitlabPath

    const fetchOpts = {
      method: options.method || req.method,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      ...(req.method !== 'GET' && req.body && !options.body
        ? { body: JSON.stringify(req.body) }
        : {}),
    }

    const gitlabRes = await gitlabFetch(token, fullPath, fetchOpts)

    if (gitlabRes.status === 401) {
      await destroySession(req).catch(() => {})
      res.clearCookie('dbup.sid', { path: '/' })
    }

    // Forward relevant headers
    const contentType = gitlabRes.headers.get('content-type') || 'application/json'
    res.status(gitlabRes.status)
    res.set('Content-Type', contentType)

    // Forward pagination headers
    const paginationHeaders = ['x-page', 'x-per-page', 'x-total', 'x-total-pages', 'x-next-page']
    for (const h of paginationHeaders) {
      const val = gitlabRes.headers.get(h)
      if (val) res.set(h, val)
    }

    // Stream body
    if (contentType.includes('text/') || contentType.includes('text/plain')) {
      const text = await gitlabRes.text()
      res.send(text)
    } else {
      const json = await gitlabRes.json().catch(() => null)
      if (json !== null) {
        res.json(json)
      } else {
        res.end()
      }
    }
  } catch (err) {
    console.error(`[proxy] Error proxying ${req.method} ${gitlabPath}:`, err.name)
    res.status(502).json({
      error: 'Error al comunicarse con GitLab',
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

router.get('/groups/by-path', (req, res) => {
  const { path } = req.query
  if (!path) return res.status(400).json({ error: 'Falta query param: path' })
  const normalized = String(path).replace(/^\/+|\/+$/g, '')
  if (normalized !== config.gitlab.groupPath) {
    return res.status(403).json({ error: 'Grupo fuera del ámbito DBUP.' })
  }
  const encoded = encodeURIComponent(normalized)
  return proxyToGitLab(req, res, `/groups/${encoded}`)
})

router.get('/groups/:groupId/subgroups', (req, res) => {
  return proxyToGitLab(req, res, `/groups/${req.params.groupId}/subgroups`)
})

router.get('/groups/:groupId/projects', (req, res) => {
  return proxyToGitLab(req, res, `/groups/${req.params.groupId}/projects`)
})

// ─────────────────────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────────────────────

router.get('/projects/:id', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// Pipelines
// ─────────────────────────────────────────────────────────────────────────────

router.get('/projects/:id/pipelines', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/pipelines`)
})

router.get('/projects/:id/pipelines/:pid', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/pipelines/${req.params.pid}`)
})

router.get('/projects/:id/pipelines/:pid/jobs', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/pipelines/${req.params.pid}/jobs`)
})

router.post('/projects/:id/pipelines/:pid/retry', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/pipelines/${req.params.pid}/retry`)
})

router.post('/projects/:id/pipelines/:pid/cancel', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/pipelines/${req.params.pid}/cancel`)
})

router.post('/projects/:id/pipeline', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/pipeline`)
})

// ─────────────────────────────────────────────────────────────────────────────
// Jobs
// ─────────────────────────────────────────────────────────────────────────────

router.get('/projects/:id/jobs/:jid', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/jobs/${req.params.jid}`)
})

router.post('/projects/:id/jobs/:jid/play', (req, res) => {
  const variables = req.body?.job_variables_attributes
  if (variables === undefined || (Array.isArray(variables) && variables.length === 0)) {
    return proxyToGitLab(req, res, `/projects/${req.params.id}/jobs/${req.params.jid}/play`, { body: {} })
  }

  if (
    !Array.isArray(variables)
    || variables.length !== 1
    || variables[0]?.key !== 'DBUP_ROLLBACK_SCRIPT'
    || typeof variables[0]?.value !== 'string'
    || !ROLLBACK_SCRIPT_PATTERN.test(variables[0].value)
  ) {
    return res.status(400).json({ error: 'Variables de ejecución no permitidas.' })
  }

  return proxyToGitLab(req, res, `/projects/${req.params.id}/jobs/${req.params.jid}/play`, {
    body: { job_variables_attributes: variables },
  })
})

router.post('/projects/:id/jobs/:jid/retry', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/jobs/${req.params.jid}/retry`)
})

router.post('/projects/:id/jobs/:jid/cancel', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/jobs/${req.params.jid}/cancel`)
})

router.get('/projects/:id/jobs/:jid/trace', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/jobs/${req.params.jid}/trace`)
})

// ─────────────────────────────────────────────────────────────────────────────
// Repository — tree
// ─────────────────────────────────────────────────────────────────────────────

router.get('/projects/:id/repository/tree', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/repository/tree`)
})

// ─────────────────────────────────────────────────────────────────────────────
// Repository — files (CRUD)
// The file path comes as a wildcard param: /repository/files/path/to/file.sql
// ─────────────────────────────────────────────────────────────────────────────

router.get('/projects/:id/repository/files/*', (req, res) => {
  const filePath = req.params[0]
  const encoded = encodeURIComponent(filePath)
  return proxyToGitLab(req, res, `/projects/${req.params.id}/repository/files/${encoded}`)
})

router.post('/projects/:id/repository/files/*', (req, res) => {
  const filePath = req.params[0]
  const encoded = encodeURIComponent(filePath)
  return proxyToGitLab(req, res, `/projects/${req.params.id}/repository/files/${encoded}`, {
    body: repositoryBody(req),
  })
})

router.put('/projects/:id/repository/files/*', (req, res) => {
  const filePath = req.params[0]
  const encoded = encodeURIComponent(filePath)
  return proxyToGitLab(req, res, `/projects/${req.params.id}/repository/files/${encoded}`, {
    body: repositoryBody(req),
  })
})

router.delete('/projects/:id/repository/files/*', (req, res) => {
  const filePath = req.params[0]
  const encoded = encodeURIComponent(filePath)
  return proxyToGitLab(req, res, `/projects/${req.params.id}/repository/files/${encoded}`, {
    body: repositoryBody(req),
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Repository — commits
// ─────────────────────────────────────────────────────────────────────────────

router.get('/projects/:id/repository/commits', (req, res) => {
  return proxyToGitLab(req, res, `/projects/${req.params.id}/repository/commits`)
})

export default router
