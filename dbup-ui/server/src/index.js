/**
 * DBUP API Server.
 * Browser <-> httpOnly session <-> Express <-> OAuth bearer token <-> GitLab.
 */
import { config } from './config.js'
import { createApp } from './app.js'

const app = await createApp()
const server = app.listen(config.port, () => {
  console.log('')
  console.log('  ╔══════════════════════════════════════╗')
  console.log('  ║       DBUP API Server                ║')
  console.log('  ╚══════════════════════════════════════╝')
  console.log('')
  console.log(`  → ${config.backendUrl}`)
  console.log(`  → Frontend: ${config.frontendUrl}`)
  console.log(`  → GitLab:   ${config.gitlab.baseUrl}`)
  console.log('')
})

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down.`)
  server.close(async () => {
    if (app.locals.redisClient?.isOpen) {
      await app.locals.redisClient.quit()
    }
    process.exit(0)
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
