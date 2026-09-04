/**
 * Route aggregator — mounts all route groups.
 */
import authRoutes  from './auth.js'
import proxyRoutes from './proxy.js'

export function setupRoutes(app) {
  app.use('/auth', authRoutes)
  app.use('/api',  proxyRoutes)

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })
}
