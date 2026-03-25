import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from './db/db.js'
import authRoutes from './routes/auth.js'
import entriesRoutes from './routes/entries.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? false })

  // Decorate with DB before plugins so it's accessible in route handlers
  app.decorate('db', createDb(opts.db))

  app.register(fastifyCookie)
  app.register(fastifySession, {
    secret: process.env.SESSION_SECRET || 'dev-secret-must-be-at-least-32-chars!!',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    },
    saveUninitialized: false
  })

  // Test-only route: GET /test/set-session?userId=N sets session without OAuth
  if (opts.enableTestRoutes) {
    app.get('/test/set-session', async (request, reply) => {
      request.session.userId = parseInt(request.query.userId)
      return { ok: true }
    })
  }

  app.register(fastifyStatic, {
    root: join(__dirname, 'public'),
    prefix: '/'
  })

  app.register(authRoutes)
  app.register(entriesRoutes, { prefix: '/api' })

  return app
}

// Start server when invoked directly: node server.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { default: dotenv } = await import('dotenv')
  dotenv.config()
  const app = await buildApp({ logger: true })
  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
}
