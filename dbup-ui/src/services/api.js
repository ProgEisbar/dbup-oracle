/**
 * api.js — HTTP client for the DBUP backend API.
 *
 * ALL requests go through the backend. In development, Vite proxies the
 * relative /auth and /api routes; a separate API origin remains configurable.
 * The browser sends a httpOnly session cookie automatically.
 * NO tokens, NO secrets ever touch the frontend.
 *
 * Architecture:
 *   Browser ←─ cookie ──→ Express backend ←─ Bearer token ──→ GitLab API
 */

import {
  ENTITIES,
  ENVIRONMENTS,
  getRuntimeConfig,
  stripRepositoryRoot,
} from '../config/runtime.js'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Makes a request to the DBUP backend.
 * Automatically includes credentials (cookie) and handles errors.
 *
 * @param {string} path    e.g. "/api/projects/123/pipelines"
 * @param {object} options fetch options (method, body, etc.)
 * @returns {Promise<any>} parsed JSON response
 * @throws {Error} on non-2xx responses with detail message
 */
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`

  const res = await fetch(url, {
    ...options,
    credentials: 'include', // sends httpOnly cookie
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  // 401 = session expired or not logged in
  if (res.status === 401) {
    const err = new Error('Sesión expirada. Iniciá sesión de nuevo.')
    err.status = 401
    throw err
  }

  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body.error || body.message || body.detail || JSON.stringify(body)
    } catch {
      detail = res.statusText
    }
    throw new Error(`API ${res.status}: ${detail}`)
  }

  // 204 No Content
  if (res.status === 204) return null

  // Text responses (job trace)
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('text/')) {
    return res.text()
  }

  return res.json()
}

/**
 * GET with query params and automatic pagination (collects all pages).
 */
async function apiGetAll(path, params = {}) {
  const allItems = []
  let page = 1
  const perPage = 100

  while (true) {
    const qs = new URLSearchParams({ ...params, per_page: perPage, page }).toString()
    const data = await apiFetch(`${path}?${qs}`)
    if (!Array.isArray(data) || data.length === 0) break
    allItems.push(...data)
    if (data.length < perPage) break
    page++
  }

  return allItems
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the backend route that starts OAuth using a top-level navigation.
 */
export function getLoginUrl() {
  return `${API_BASE}/auth/login`
}

let loginCompletionRequest = null

/**
 * Completes the pending server-side OAuth exchange. The request is shared so
 * React development mode cannot accidentally consume the one-time callback
 * twice when it re-runs effects.
 */
export function completeLogin() {
  if (!loginCompletionRequest) {
    loginCompletionRequest = apiFetch('/auth/complete', { method: 'POST' })
  }
  return loginCompletionRequest
}

/**
 * Gets the currently authenticated user from the session.
 * @returns {{ authenticated: boolean, user?: object }}
 */
export async function getAuthStatus() {
  return apiFetch('/auth/me')
}

/**
 * Logs out — destroys the server session.
 */
export async function logout() {
  return apiFetch('/auth/logout', { method: 'POST' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

export async function getRootGroup(groupPath) {
  return apiFetch(`/api/groups/by-path?path=${encodeURIComponent(groupPath)}`)
}

export async function getEnvironmentSubgroups(rootGroupId) {
  const subs = await apiGetAll(`/api/groups/${rootGroupId}/subgroups`)
  const map = {}
  for (const sg of subs) {
    const upper = sg.name.toUpperCase()
    const environment = ENVIRONMENTS.find((item) => upper.includes(item.toUpperCase()))
    if (environment) map[environment] = sg
  }
  return map
}

export async function getGroupProjects(groupId) {
  return apiGetAll(`/api/groups/${groupId}/projects`, {
    include_subgroups: true,
    order_by: 'name',
    sort: 'asc',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Project map builder
// ─────────────────────────────────────────────────────────────────────────────

export async function buildProjectMap(groupPath) {
  const root = await getRootGroup(groupPath)
  const subgroups = await getEnvironmentSubgroups(root.id)

  const projectMap = {}
  for (const env of ENVIRONMENTS) {
    projectMap[env] = {}
    const sg = subgroups[env]
    if (!sg) continue

    const projects = await getGroupProjects(sg.id)
    for (const proj of projects) {
      const escapedPrefix = getRuntimeConfig().projectPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const match = proj.path.match(new RegExp(`${escapedPrefix}(\\d+)`, 'i'))
      if (match) projectMap[env][match[1]] = proj
    }
  }

  return { root, subgroups, projectMap }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository — files
// ─────────────────────────────────────────────────────────────────────────────

export async function listRepoTree(projectId, path = '', ref = getRuntimeConfig().defaultBranch) {
  const qs = new URLSearchParams({ path, ref, per_page: 100 }).toString()
  return apiFetch(`/api/projects/${projectId}/repository/tree?${qs}`)
}

export async function listRepoTreeRecursive(projectId, path = '', ref = getRuntimeConfig().defaultBranch) {
  return apiGetAll(`/api/projects/${projectId}/repository/tree`, { path, ref, recursive: true })
}

export async function getFileContent(projectId, filePath, ref = getRuntimeConfig().defaultBranch) {
  const data = await apiFetch(`/api/projects/${projectId}/repository/files/${filePath}?ref=${ref}`)
  return { ...data, content: atob(data.content) }
}

export async function createFile(projectId, { filePath, content, commitMessage, branch = getRuntimeConfig().defaultBranch }) {
  const body = { branch, content, commit_message: commitMessage }
  return apiFetch(`/api/projects/${projectId}/repository/files/${filePath}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateFile(projectId, { filePath, content, commitMessage, branch = getRuntimeConfig().defaultBranch }) {
  const body = { branch, content, commit_message: commitMessage }
  return apiFetch(`/api/projects/${projectId}/repository/files/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteFile(projectId, { filePath, commitMessage, branch = getRuntimeConfig().defaultBranch }) {
  const body = { branch, commit_message: commitMessage }
  return apiFetch(`/api/projects/${projectId}/repository/files/${filePath}`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}

export async function fileExists(projectId, filePath, ref = getRuntimeConfig().defaultBranch) {
  try {
    await apiFetch(`/api/projects/${projectId}/repository/files/${filePath}?ref=${ref}`)
    return true
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipelines
// ─────────────────────────────────────────────────────────────────────────────

export async function getPipelines(projectId, perPage = 15) {
  return apiFetch(`/api/projects/${projectId}/pipelines?per_page=${perPage}&order_by=id&sort=desc`)
}

export async function getPipeline(projectId, pipelineId) {
  return apiFetch(`/api/projects/${projectId}/pipelines/${pipelineId}`)
}

export async function getPipelineJobs(projectId, pipelineId) {
  return apiGetAll(`/api/projects/${projectId}/pipelines/${pipelineId}/jobs`)
}

export async function getJob(projectId, jobId) {
  return apiFetch(`/api/projects/${projectId}/jobs/${jobId}`)
}

export async function playJob(projectId, jobId, variables = []) {
  const body = variables.length > 0
    ? JSON.stringify({
        job_variables_attributes: variables.map(({ key, value }) => ({ key, value })),
      })
    : undefined

  return apiFetch(`/api/projects/${projectId}/jobs/${jobId}/play`, {
    method: 'POST',
    ...(body ? { body } : {}),
  })
}

export async function retryJob(projectId, jobId) {
  return apiFetch(`/api/projects/${projectId}/jobs/${jobId}/retry`, { method: 'POST' })
}

export async function cancelJob(projectId, jobId) {
  return apiFetch(`/api/projects/${projectId}/jobs/${jobId}/cancel`, { method: 'POST' })
}

export async function getJobTrace(projectId, jobId) {
  return apiFetch(`/api/projects/${projectId}/jobs/${jobId}/trace`)
}

export async function retryPipeline(projectId, pipelineId) {
  return apiFetch(`/api/projects/${projectId}/pipelines/${pipelineId}/retry`, { method: 'POST' })
}

export async function cancelPipeline(projectId, pipelineId) {
  return apiFetch(`/api/projects/${projectId}/pipelines/${pipelineId}/cancel`, { method: 'POST' })
}

export async function createPipeline(projectId, ref = getRuntimeConfig().defaultBranch) {
  return apiFetch(`/api/projects/${projectId}/pipeline`, {
    method: 'POST',
    body: JSON.stringify({ ref }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// DBUP-specific helpers (pure functions, no API calls)
// ─────────────────────────────────────────────────────────────────────────────

export function buildDdlPath(environment, entityNumber, schemaType, fileName) {
  const config = getRuntimeConfig()
  const envFolder = environment === config.sharedFolder
    ? config.sharedFolder
    : environment.toLowerCase()
  return `${config.ddlRoot}/${envFolder}/${schemaType}${entityNumber}/${fileName}`
}

export function buildRollbackPath(ddlPath) {
  const config = getRuntimeConfig()
  const relativePath = stripRepositoryRoot(ddlPath, config.ddlRoot)
  return `${config.rollbackRoot}/${relativePath}`.replace(/\.sql$/, '_rollback.sql')
}

export function buildTemplatePath(fileName) {
  return `${getRuntimeConfig().templateRoot}/${fileName}`
}

export function buildDdlFileName(ticket, description) {
  const slug = description.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 60)
  return `${ticket}_${slug}.sql`
}

export function generateDdlContent(ticket, schemaType, entityNumber, body = '') {
  const schema = `${schemaType}${entityNumber}`
  const header = `-- JIRA_TICKET: ${ticket}\n-- TARGET_SCHEMA: ${schema}\n\n`
  return header + (body || `-- Escribi el DDL para ${schema} aca\n`)
}

export function generateRollbackContent(ticket, targetSchema, rollbackOf, body = '') {
  const header =
    `-- JIRA_TICKET: ${ticket}\n` +
    `-- TARGET_SCHEMA: ${targetSchema}\n` +
    `-- ROLLBACK_OF: ${rollbackOf}\n\n`
  return header + (body || `-- Escribi el rollback para ${rollbackOf} aca\n`)
}

export function generateTemplateContent(ticket, targetEntities, body = '') {
  const entitiesLine = targetEntities.length > 0 ? targetEntities.join(',') : 'all'
  const header = `-- JIRA_TICKET: ${ticket}\n-- TARGET_ENTITIES: ${entitiesLine}\n-- TARGET_SCHEMA: {{ENTIDAD}}\n\n`
  return header + (body || `-- Escribi el DDL para {{ENTIDAD}} aca\n-- Variables: {{ENTIDAD}}, {{PARAM}}, {{ENTITY}}, {{USER_SERVICES}}\n`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function getLatestPipeline(projectId) {
  try {
    const pipes = await apiFetch(`/api/projects/${projectId}/pipelines?per_page=1&order_by=id&sort=desc`)
    return pipes?.[0] ?? null
  } catch {
    return null
  }
}

export async function getPipelineStatusMatrix(projectMap) {
  const matrix = {}
  const promises = []

  for (const env of ENVIRONMENTS) {
    matrix[env] = {}
    for (const entity of ENTITIES) {
      const proj = projectMap[env]?.[entity]
      if (!proj) { matrix[env][entity] = null; continue }
      promises.push(
        getLatestPipeline(proj.id).then(pipe => { matrix[env][entity] = pipe })
      )
    }
  }

  await Promise.allSettled(promises)
  return matrix
}

export async function listDdlScripts(projectId, ref = getRuntimeConfig().defaultBranch) {
  const root = getRuntimeConfig().ddlRoot
  const all = await listRepoTreeRecursive(projectId, root, ref)
  return all
    .filter(f => f.type === 'blob' && f.name.endsWith('.sql') && f.name !== '.gitkeep')
    .map(f => {
      const parts = stripRepositoryRoot(f.path, root).split('/')
      return { path: f.path, name: f.name, envFolder: parts[0] || '', schema: parts[1] || '', id: f.id }
    })
}

export async function listRollbackScripts(projectId, ref = getRuntimeConfig().defaultBranch) {
  const root = getRuntimeConfig().rollbackRoot
  const all = await listRepoTreeRecursive(projectId, root, ref)
  return all
    .filter(f => f.type === 'blob' && f.name.endsWith('_rollback.sql') && f.name !== '.gitkeep')
    .map(f => {
      const relativePath = stripRepositoryRoot(f.path, root)
      const parts = relativePath.split('/')
      return {
        path: f.path,
        rollbackScript: relativePath,
        name: f.name,
        envFolder: parts[0] || '',
        schema: parts[1] || '',
        id: f.id,
      }
    })
}

export async function listTemplates(projectId, ref = getRuntimeConfig().defaultBranch) {
  const all = await listRepoTreeRecursive(projectId, getRuntimeConfig().templateRoot, ref)
  return all
    .filter(f => f.type === 'blob' && f.name.endsWith('.sql.tpl'))
    .map(f => ({ path: f.path, name: f.name, id: f.id }))
}

export {
  ENTITIES,
  ENVIRONMENTS,
  SCHEMA_TYPES,
  getRuntimeConfig,
  stripRepositoryRoot,
  ticketExample,
  ticketPattern,
  ticketSearchPattern,
} from '../config/runtime.js'
