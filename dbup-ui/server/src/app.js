import express from 'express'
import helmet from 'helmet'
import { setupCors } from './middleware/cors.js'
import { requireTrustedOrigin } from './middleware/origin.js'
import { setupSession } from './middleware/session.js'
import { setupRoutes } from './routes/index.js'

export async function createApp() {
  const app = express()

  app.use(helmet())
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '5mb' }))

  setupCors(app)
  app.use(requireTrustedOrigin)
  await setupSession(app)
  setupRoutes(app)

  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' })
  })

  app.use((err, req, res, _next) => {
    console.error('[server] Unhandled error:', err.name)
    res.status(500).json({ error: 'Error interno del servidor' })
  })

  return app
}
