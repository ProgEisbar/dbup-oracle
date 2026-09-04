/**
 * Centralized environment configuration.
 * Secret values are loaded only in the backend process and are never returned
 * by an HTTP endpoint.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

if (process.env.DBUP_SKIP_ENV_FILE !== 'true') {
  try {
    const envPath = resolve(__dirname, '..', '.env')
    const envContent = readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // Environment variables may be supplied by the runtime instead.
  }
}

function withoutTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function csvList(value, fallback, transform = (item) => item) {
  const items = (value || '')
    .split(',')
    .map((item) => transform(item.trim()))
    .filter(Boolean)
  return [...new Set(items.length > 0 ? items : fallback)]
}

function repoPath(value, fallback) {
  return (value || fallback).replace(/^\/+|\/+$/g, '')
}

const nodeEnv = process.env.NODE_ENV || 'development'
const port = positiveInt(process.env.PORT, 3001)
const frontendUrl = withoutTrailingSlash(process.env.FRONTEND_URL || 'http://localhost:5173')
const backendUrl = withoutTrailingSlash(process.env.BACKEND_URL || `http://localhost:${port}`)
const frontendOrigin = (() => {
  try { return new URL(frontendUrl).origin } catch { return frontendUrl }
})()

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port,
  frontendUrl,
  frontendOrigin,
  backendUrl,

  gitlab: {
    baseUrl: withoutTrailingSlash(process.env.GITLAB_BASE_URL || 'https://gitlab.com'),
    clientId: process.env.GITLAB_CLIENT_ID || '',
    clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
    groupPath: (process.env.GITLAB_GROUP_PATH || '').replace(/^\/+|\/+$/g, ''),
    requestTimeoutMs: positiveInt(process.env.GITLAB_REQUEST_TIMEOUT_MS, 15_000),
  },

  oauth: {
    redirectUri: process.env.OAUTH_REDIRECT_URI || `${backendUrl}/auth/callback`,
    stateTtlMs: positiveInt(process.env.OAUTH_STATE_TTL_MS, 10 * 60 * 1000),
    callbackTtlMs: positiveInt(process.env.OAUTH_CALLBACK_TTL_MS, 2 * 60 * 1000),
    maxPendingStates: positiveInt(process.env.OAUTH_MAX_PENDING_STATES, 5),
  },

  session: {
    secret: process.env.SESSION_SECRET || '',
    redisUrl: process.env.REDIS_URL || '',
    cookieSecure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : nodeEnv === 'production',
    maxAgeMs: positiveInt(process.env.SESSION_MAX_AGE_MS, 8 * 60 * 60 * 1000),
  },

  dbup: {
    environments: csvList(process.env.DBUP_ENVIRONMENTS, ['DEV', 'QA', 'UAT'], (item) => item.toUpperCase()),
    entities: csvList(process.env.DBUP_ENTITIES, ['700', '701', '702', '703']),
    schemaTypes: csvList(process.env.DBUP_SCHEMA_TYPES, ['ENTIDAD', 'PARAM'], (item) => item.toUpperCase()),
    defaultBranch: process.env.DBUP_DEFAULT_BRANCH || 'main',
    ddlRoot: repoPath(process.env.DBUP_DDL_ROOT, 'dbup/ddl'),
    rollbackRoot: repoPath(process.env.DBUP_ROLLBACK_ROOT, 'dbup/rollback'),
    templateRoot: repoPath(process.env.DBUP_TEMPLATE_ROOT, 'templates/dev'),
    sharedFolder: process.env.DBUP_SHARED_FOLDER || 'shared',
    projectPrefix: process.env.DBUP_PROJECT_PREFIX || 'entidad',
    templateEnvironment: (process.env.DBUP_TEMPLATE_ENVIRONMENT || 'DEV').toUpperCase(),
    templateEntity: process.env.DBUP_TEMPLATE_ENTITY || '700',
    ticketPrefix: (process.env.DBUP_TICKET_PREFIX || 'DBUP').toUpperCase(),
    distributeJobName: process.env.DBUP_DISTRIBUTE_JOB_NAME || 'distribute:dev',
    rollbackJobPrefix: process.env.DBUP_ROLLBACK_JOB_PREFIX || 'rollback',
  },
}

const missing = []
if (!config.gitlab.clientId) missing.push('GITLAB_CLIENT_ID')
if (!config.gitlab.clientSecret) missing.push('GITLAB_CLIENT_SECRET')
if (!config.gitlab.groupPath) missing.push('GITLAB_GROUP_PATH')
if (!config.session.secret) missing.push('SESSION_SECRET')

if (missing.length > 0) {
  throw new Error(`[config] Missing required environment variables: ${missing.join(', ')}`)
}

if (config.session.secret.length < 32) {
  throw new Error('[config] SESSION_SECRET must contain at least 32 characters.')
}

if (config.isProduction && !config.session.redisUrl) {
  throw new Error('[config] REDIS_URL is required when NODE_ENV=production.')
}

for (const [name, values, pattern] of [
  ['DBUP_ENVIRONMENTS', config.dbup.environments, /^[A-Z][A-Z0-9_-]*$/],
  ['DBUP_ENTITIES', config.dbup.entities, /^\d+$/],
  ['DBUP_SCHEMA_TYPES', config.dbup.schemaTypes, /^[A-Z][A-Z0-9_]*$/],
]) {
  if (values.some((value) => !pattern.test(value))) {
    throw new Error(`[config] ${name} contains an invalid value.`)
  }
}

for (const [name, value] of [
  ['DBUP_DDL_ROOT', config.dbup.ddlRoot],
  ['DBUP_ROLLBACK_ROOT', config.dbup.rollbackRoot],
  ['DBUP_TEMPLATE_ROOT', config.dbup.templateRoot],
]) {
  if (!value || value.includes('..') || value.includes('\\') || value.startsWith('/')) {
    throw new Error(`[config] ${name} must be a repository-relative path.`)
  }
}

if (!config.dbup.environments.includes(config.dbup.templateEnvironment)) {
  throw new Error('[config] DBUP_TEMPLATE_ENVIRONMENT must be included in DBUP_ENVIRONMENTS.')
}

if (!config.dbup.entities.includes(config.dbup.templateEntity)) {
  throw new Error('[config] DBUP_TEMPLATE_ENTITY must be included in DBUP_ENTITIES.')
}

if (!/^[A-Za-z0-9._/-]+$/.test(config.dbup.defaultBranch)) {
  throw new Error('[config] DBUP_DEFAULT_BRANCH contains invalid characters.')
}

for (const [name, value] of [
  ['DBUP_SHARED_FOLDER', config.dbup.sharedFolder],
  ['DBUP_PROJECT_PREFIX', config.dbup.projectPrefix],
  ['DBUP_TICKET_PREFIX', config.dbup.ticketPrefix],
  ['DBUP_ROLLBACK_JOB_PREFIX', config.dbup.rollbackJobPrefix],
]) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`[config] ${name} contains invalid characters.`)
  }
}

for (const [name, value] of [
  ['FRONTEND_URL', config.frontendUrl],
  ['BACKEND_URL', config.backendUrl],
  ['GITLAB_BASE_URL', config.gitlab.baseUrl],
  ['OAUTH_REDIRECT_URI', config.oauth.redirectUri],
]) {
  try {
    new URL(value)
  } catch {
    throw new Error(`[config] ${name} must be an absolute URL.`)
  }
}

const oauthRedirectUrl = new URL(config.oauth.redirectUri)
const expectedOauthRedirectUrl = new URL('auth/callback', `${config.backendUrl}/`)
if (
  oauthRedirectUrl.origin !== expectedOauthRedirectUrl.origin
  || oauthRedirectUrl.pathname !== expectedOauthRedirectUrl.pathname
) {
  throw new Error(`[config] OAUTH_REDIRECT_URI must be ${expectedOauthRedirectUrl.toString()}`)
}
