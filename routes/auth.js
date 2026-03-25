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
    const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` }
    })
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
  })

  // ── GitHub OAuth ────────────────────────────────────────────────────────────
  app.register(oauth2Plugin, {
    name: 'githubOAuth2',
    scope: ['user:email'],
    credentials: {
      client: {
        id: process.env.GITHUB_CLIENT_ID || 'placeholder',
        secret: process.env.GITHUB_CLIENT_SECRET || 'placeholder'
      },
      auth: oauth2Plugin.GITHUB_CONFIGURATION
    },
    startRedirectPath: '/auth/github',
    callbackUri: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback'
  })

  app.get('/auth/github/callback', async (request, reply) => {
    const { token } = await app.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)
    const profileRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'SpendTracker' }
    })
    const profile = await profileRes.json()

    // GitHub may not expose email in /user — fetch from /user/emails
    let email = profile.email
    if (!email) {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'SpendTracker' }
      })
      const emails = await emailRes.json()
      email = Array.isArray(emails) ? (emails.find(e => e.primary)?.email ?? null) : null
    }

    const user = app.db.upsertUser({
      provider: 'github',
      providerId: String(profile.id),
      name: profile.name || profile.login,
      email,
      avatarUrl: profile.avatar_url
    })
    request.session.userId = user.id
    request.session.name = user.name
    request.session.avatarUrl = user.avatar_url
    reply.redirect('/')
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
