import oauth2Plugin from '@fastify/oauth2'

export default async function authRoutes(app) {
  // ── Google OAuth ────────────────────────────────────────────────────────────
  app.register(oauth2Plugin, {
    name: 'googleOAuth2',
    scope: ['profile', 'email'],
    credentials: {
      client: {
        id: process.env.GOOGLE_CLIENT_ID || 'placeholder',
        secret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder'
      },
      auth: oauth2Plugin.GOOGLE_CONFIGURATION
    },
    startRedirectPath: '/auth/google',
    callbackUri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
  })

  app.get('/auth/google/callback', async (request, reply) => {
    try {
      const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      })
      if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`)
      const profile = await res.json()
      const user = app.db.upsertUser({
        provider: 'google',
        providerId: String(profile.id),
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.picture
      })
      request.session.userId = user.id
      request.session.name = user.name
      request.session.avatarUrl = user.avatar_url
      reply.redirect('/')
    } catch (err) {
      app.log.error(err, 'Google OAuth callback failed')
      reply.redirect('/login.html?error=auth_failed')
    }
  })

  // ── Session routes ───────────────────────────────────────────────────────────
  app.get('/auth/me', async (request, reply) => {
    if (!request.session.userId) return reply.status(401).send({ error: 'Unauthorized' })
    return {
      id: request.session.userId,
      name: request.session.name,
      avatarUrl: request.session.avatarUrl
    }
  })

  app.get('/auth/logout', async (request, reply) => {
    await request.session.destroy()
    reply.redirect('/login.html')
  })
}
