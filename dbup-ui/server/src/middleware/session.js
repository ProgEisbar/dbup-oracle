/**
 * Server-side sessions. The browser receives only an opaque, httpOnly cookie.
 * Redis is required in production; local development may use MemoryStore.
 */
import session from 'express-session'
import { config } from '../config.js'

export async function setupSession(app) {
  let store
  let redisClient

  if (config.session.redisUrl) {
    const [{ RedisStore }, { createClient }] = await Promise.all([
      import('connect-redis'),
      import('redis'),
    ])

    redisClient = createClient({ url: config.session.redisUrl })
    redisClient.on('error', (err) => {
      console.error('[session] Redis connection error:', err.code || err.name)
    })
    try {
      await redisClient.connect()
    } catch {
      throw new Error('[session] Could not connect to the configured Redis server.')
    }
    store = new RedisStore({ client: redisClient, prefix: 'dbup:sess:' })
    app.locals.redisClient = redisClient
  } else {
    console.warn('[session] Using MemoryStore for local development only.')
  }

  app.use(session({
    ...(store ? { store } : {}),
    name: 'dbup.sid',
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.session.cookieSecure,
      sameSite: 'lax',
      maxAge: config.session.maxAgeMs,
    },
  }))
}
