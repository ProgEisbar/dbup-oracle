import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function positivePort(value, fallback) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const frontendPort = positivePort(env.DEV_SERVER_PORT, 5173)
  const backendTarget = (env.BACKEND_PROXY_TARGET || 'http://localhost:3001').replace(/\/+$/, '')

  return {
    base: env.VITE_PUBLIC_BASE || '/',
    plugins: [react()],
    // Vite's supported SPA mode includes the index.html history fallback.
    appType: 'spa',
    server: {
      host: env.DEV_SERVER_HOST || 'localhost',
      port: frontendPort,
      strictPort: true,
      proxy: {
        '/auth': { target: backendTarget, changeOrigin: true },
        '/api': { target: backendTarget, changeOrigin: true },
        '/health': { target: backendTarget, changeOrigin: true },
      },
    },
    preview: {
      host: env.PREVIEW_SERVER_HOST || env.DEV_SERVER_HOST || 'localhost',
      port: positivePort(env.PREVIEW_SERVER_PORT, 4173),
      strictPort: true,
    },
  }
})
