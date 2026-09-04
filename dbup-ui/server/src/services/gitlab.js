/**
 * Server-side GitLab API service. OAuth artifacts never leave this layer.
 */
import { config } from '../config.js'

const { baseUrl: defaultBaseUrl } = config.gitlab

export class GitLabOAuthError extends Error {
  constructor(code, status) {
    super('GitLab rejected the OAuth request.')
    this.name = 'GitLabOAuthError'
    this.code = code || 'oauth_request_failed'
    this.status = status
  }
}

function requestSignal(options = {}) {
  return options.signal || AbortSignal.timeout(config.gitlab.requestTimeoutMs)
}

export async function gitlabFetch(accessToken, path, options = {}, baseUrl = defaultBaseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v4${path}`
  return fetch(url, {
    ...options,
    signal: requestSignal(options),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

async function oauthTokenRequest(parameters) {
  const { clientId, clientSecret, baseUrl } = config.gitlab
  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    signal: AbortSignal.timeout(config.gitlab.requestTimeoutMs),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...parameters,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new GitLabOAuthError(body.error, res.status)
  }

  return res.json()
}

export function exchangeCodeForToken(code, redirectUri) {
  return oauthTokenRequest({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
}

export function refreshAccessToken(refreshToken, redirectUri) {
  return oauthTokenRequest({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    redirect_uri: redirectUri,
  })
}

export async function revokeToken(token) {
  const { clientId, clientSecret, baseUrl } = config.gitlab
  const res = await fetch(`${baseUrl}/oauth/revoke`, {
    method: 'POST',
    signal: AbortSignal.timeout(config.gitlab.requestTimeoutMs),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token,
    }),
  })

  if (!res.ok) throw new GitLabOAuthError('token_revoke_failed', res.status)
}

export async function getUser(accessToken) {
  const res = await gitlabFetch(accessToken, '/user')
  if (!res.ok) throw new GitLabOAuthError('user_profile_failed', res.status)
  return res.json()
}
