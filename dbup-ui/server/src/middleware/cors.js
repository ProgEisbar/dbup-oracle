/**
 * CORS middleware - allows the frontend origin and credentials (cookies).
 */
import cors from 'cors'
import { config } from '../config.js'

export function setupCors(app) {
  app.use(cors({
    origin: config.frontendOrigin,
    credentials: true,   // allow cookies to be sent cross-origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }))
}
