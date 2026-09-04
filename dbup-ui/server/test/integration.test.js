import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

let mockGitLab
let apiServer
let apiBase
let refreshCount = 0
let revokeCount = 0

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server.address().port))
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

async function requestBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function cookieFrom(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0]
}

before(async () => {
  mockGitLab = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://gitlab.test')

    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      const params = new URLSearchParams(await requestBody(req))
      if (params.get('grant_type') === 'refresh_token') {
        refreshCount += 1
        return json(res, 200, {
          access_token: 'access-refreshed',
          refresh_token: 'refresh-rotated',
          expires_in: 7200,
        })
      }
      return json(res, 200, {
        access_token: 'access-initial',
        refresh_token: 'refresh-initial',
        expires_in: 30,
      })
    }

    if (url.pathname === '/oauth/revoke' && req.method === 'POST') {
      revokeCount += 1
      return json(res, 200, {})
    }

    if (url.pathname === '/api/v4/user') {
      return json(res, 200, {
        id: 42,
        name: 'Test User',
        username: 'test.user',
        email: 'test.user@example.test',
        avatar_url: null,
      })
    }

    if (url.pathname === '/api/v4/projects/1') {
      return json(res, 200, { id: 1, path_with_namespace: 'test/dbup/repo-one' })
    }

    if (url.pathname === '/api/v4/projects/2') {
      return json(res, 200, { id: 2, path_with_namespace: 'outside/repo-two' })
    }

    if (url.pathname === '/api/v4/projects/1/jobs/10/play' && req.method === 'POST') {
      return json(res, 200, { received: JSON.parse(await requestBody(req)) })
    }

    if (url.pathname.startsWith('/api/v4/projects/1/repository/files/') && req.method === 'POST') {
      return json(res, 201, { received: JSON.parse(await requestBody(req)) })
    }

    return json(res, 404, { error: 'mock route not found' })
  })

  const gitlabPort = await listen(mockGitLab)

  const reservation = http.createServer()
  const backendPort = await listen(reservation)
  await close(reservation)

  process.env.DBUP_SKIP_ENV_FILE = 'true'
  process.env.NODE_ENV = 'test'
  process.env.GITLAB_CLIENT_ID = 'test-client'
  process.env.GITLAB_CLIENT_SECRET = 'test-client-secret'
  process.env.GITLAB_GROUP_PATH = 'test/dbup'
  process.env.GITLAB_BASE_URL = `http://127.0.0.1:${gitlabPort}`
  process.env.GITLAB_REQUEST_TIMEOUT_MS = '2000'
  process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef'
  process.env.FRONTEND_URL = 'http://localhost:5173'
  process.env.PORT = String(backendPort)
  process.env.BACKEND_URL = `http://127.0.0.1:${backendPort}`
  process.env.OAUTH_REDIRECT_URI = `http://127.0.0.1:${backendPort}/auth/callback`

  const { createApp } = await import('../src/app.js')
  const app = await createApp()
  apiServer = http.createServer(app)
  await listen(apiServer, backendPort)
  apiBase = `http://127.0.0.1:${backendPort}`
})

after(async () => {
  await close(apiServer)
  await close(mockGitLab)
})

test('OAuth BFF flow, token refresh and proxy restrictions', async () => {
  const firstLogin = await fetch(`${apiBase}/auth/login`, { redirect: 'manual' })
  assert.equal(firstLogin.status, 302)
  const initialCookie = cookieFrom(firstLogin)
  assert.ok(initialCookie.startsWith('dbup.sid='))
  const firstAuthorize = new URL(firstLogin.headers.get('location'))
  const firstState = firstAuthorize.searchParams.get('state')
  assert.equal(firstAuthorize.searchParams.get('redirect_uri'), `${apiBase}/auth/callback`)

  const secondLogin = await fetch(`${apiBase}/auth/login`, {
    redirect: 'manual',
    headers: { Cookie: initialCookie },
  })
  const secondState = new URL(secondLogin.headers.get('location')).searchParams.get('state')
  assert.notEqual(firstState, secondState)

  // The first state remains valid even after a second login attempt starts.
  const callback = await fetch(`${apiBase}/auth/callback?code=valid-code&state=${firstState}`, {
    redirect: 'manual',
    headers: { Cookie: initialCookie },
  })
  assert.equal(callback.status, 302)
  assert.equal(callback.headers.get('location'), 'http://localhost:5173/oauth/callback')
  assert.ok(!callback.headers.get('location').includes('valid-code'))
  const callbackCookie = cookieFrom(callback) || initialCookie

  const beforeCompletion = await fetch(`${apiBase}/auth/me`, {
    headers: { Cookie: callbackCookie },
  })
  assert.equal(beforeCompletion.status, 401)

  const completion = await fetch(`${apiBase}/auth/complete`, {
    method: 'POST',
    headers: { Cookie: callbackCookie, Origin: 'http://localhost:5173' },
  })
  assert.equal(completion.status, 200)
  const authenticatedCookie = cookieFrom(completion)
  assert.notEqual(authenticatedCookie, callbackCookie)

  const replay = await fetch(`${apiBase}/auth/complete`, {
    method: 'POST',
    headers: { Cookie: authenticatedCookie, Origin: 'http://localhost:5173' },
  })
  assert.equal(replay.status, 409)

  const me = await fetch(`${apiBase}/auth/me`, { headers: { Cookie: authenticatedCookie } })
  assert.equal(me.status, 200)
  const session = await me.json()
  assert.equal(session.user.username, 'test.user')
  assert.equal(session.config.groupPath, 'test/dbup')
  assert.equal(refreshCount, 1)

  const wrongGroup = await fetch(`${apiBase}/api/groups/by-path?path=outside`, {
    headers: { Cookie: authenticatedCookie },
  })
  assert.equal(wrongGroup.status, 403)

  const allowedProject = await fetch(`${apiBase}/api/projects/1`, {
    headers: { Cookie: authenticatedCookie },
  })
  assert.equal(allowedProject.status, 200)

  const deniedProject = await fetch(`${apiBase}/api/projects/2`, {
    headers: { Cookie: authenticatedCookie },
  })
  assert.equal(deniedProject.status, 403)

  const invalidVariables = await fetch(`${apiBase}/api/projects/1/jobs/10/play`, {
    method: 'POST',
    headers: {
      Cookie: authenticatedCookie,
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ job_variables_attributes: [{ key: 'DB_PASSWORD', value: 'override' }] }),
  })
  assert.equal(invalidVariables.status, 400)

  const rollbackScript = 'shared/ENTIDAD700/DBUP-1234_test_rollback.sql'
  const validVariables = await fetch(`${apiBase}/api/projects/1/jobs/10/play`, {
    method: 'POST',
    headers: {
      Cookie: authenticatedCookie,
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      job_variables_attributes: [{ key: 'DBUP_ROLLBACK_SCRIPT', value: rollbackScript }],
    }),
  })
  assert.equal(validVariables.status, 200)
  const played = await validVariables.json()
  assert.deepEqual(played.received.job_variables_attributes, [
    { key: 'DBUP_ROLLBACK_SCRIPT', value: rollbackScript },
  ])

  const created = await fetch(`${apiBase}/api/projects/1/repository/files/dbup/ddl/dev/ENTIDAD700/test.sql`, {
    method: 'POST',
    headers: {
      Cookie: authenticatedCookie,
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      branch: 'main',
      content: 'select 1;',
      commit_message: 'test',
      author_name: 'Forged User',
      author_email: 'forged@example.test',
    }),
  })
  assert.equal(created.status, 201)
  const commit = await created.json()
  assert.equal(commit.received.author_name, 'Test User')
  assert.equal(commit.received.author_email, 'test.user@example.test')

  const crossOriginLogout = await fetch(`${apiBase}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: authenticatedCookie, Origin: 'https://untrusted.example.test' },
  })
  assert.equal(crossOriginLogout.status, 403)

  const logout = await fetch(`${apiBase}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: authenticatedCookie, Origin: 'http://localhost:5173' },
  })
  assert.equal(logout.status, 200)
  assert.equal(revokeCount, 1)

  const afterLogout = await fetch(`${apiBase}/auth/me`, {
    headers: { Cookie: authenticatedCookie },
  })
  assert.equal(afterLogout.status, 401)
})
