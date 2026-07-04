# Spend Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hosted multi-user monthly spend tracker with Google/GitHub OAuth, SQLite storage, and a two-page vanilla JS frontend served by a Fastify monolith.

**Architecture:** Fastify serves both the REST API (`/api/*`) and static files from `public/`. SQLite via `better-sqlite3`. Server-side sessions via `@fastify/session`. No build step — plain ES modules throughout. `buildApp()` factory function enables in-memory SQLite for tests.

**Tech Stack:** Node.js 18+, Fastify 5, better-sqlite3, @fastify/oauth2, @fastify/session, @fastify/cookie, @fastify/static, dotenv, node:test (built-in)

---

## File Map

```
spend-tracker/
├── server.js                  # Fastify factory (buildApp) + CLI entry point
├── routes/
│   ├── auth.js                # OAuth (Google + GitHub), session, /auth/me, /auth/logout
│   └── entries.js             # CRUD API for entries + auth guard
├── db/
│   ├── schema.sql             # CREATE TABLE statements
│   └── db.js                  # createDb(file) → object with query methods
├── public/
│   ├── login.html             # OAuth sign-in page (public)
│   ├── index.html             # Overview page (redirects to login if no session)
│   ├── entries.html           # Entries list page (redirects to login if no session)
│   ├── css/style.css          # All styles — clean white theme + CSS variables
│   └── js/
│       ├── api.js             # fetch wrappers: getMe, getEntries, createEntry, updateEntry, deleteEntry
│       ├── modal.js           # Slide-in Add/Edit modal: initModal, openModal, closeModal
│       ├── overview.js        # Overview page: donut chart, category breakdown, month nav
│       └── entries.js         # Entries page: list, filter pills, edit/delete, month nav
├── test/
│   ├── db.test.js             # Unit tests for all db.js methods
│   └── entries.test.js        # Integration tests for /api/entries CRUD + 401 guard
├── .env.example               # Template listing all required env vars
├── .gitignore
└── package.json
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "spend-tracker",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "@fastify/cookie": "^9.0.0",
    "@fastify/oauth2": "^8.0.0",
    "@fastify/session": "^10.0.0",
    "@fastify/static": "^8.0.0",
    "better-sqlite3": "^11.0.0",
    "dotenv": "^16.0.0",
    "fastify": "^5.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `node_modules/` created, no errors. Note: `better-sqlite3` compiles a native addon — requires Python and a C++ build tool (`xcode-select --install` on macOS, `build-essential` on Linux). If any `@fastify/*` plugin gives a peer dependency warning about Fastify version, run `npm install fastify@latest @fastify/cookie@latest @fastify/session@latest @fastify/oauth2@latest @fastify/static@latest` to pull the latest compatible set.

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.env
data.db
.DS_Store
```

- [ ] **Step 4: Create .env.example**

```
# Session
SESSION_SECRET=change-me-to-a-random-string-at-least-32-chars

# Database
DB_PATH=data.db

# Server
PORT=3000
NODE_ENV=development

# Google OAuth — create at https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# GitHub OAuth — create at https://github.com/settings/developers
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback
```

- [ ] **Step 5: Create .env from the example**

Run: `cp .env.example .env`

Fill in `SESSION_SECRET` with any 32+ character string for local dev. Leave OAuth keys blank for now (they're needed for Task 4).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "feat: project scaffold with dependencies"
```

---

### Task 2: Database Layer

**Files:**
- Create: `db/schema.sql`
- Create: `db/db.js`
- Create: `test/db.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/db.test.js`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../db/db.js'

test('upsertUser creates a new user', () => {
  const db = createDb(':memory:')
  const user = db.upsertUser({
    provider: 'google', providerId: '123', name: 'Alice',
    email: 'alice@example.com', avatarUrl: 'https://example.com/a.jpg'
  })
  assert.equal(user.name, 'Alice')
  assert.equal(user.provider, 'google')
  assert.ok(user.id > 0)
})

test('upsertUser updates existing user on provider+id conflict', () => {
  const db = createDb(':memory:')
  db.upsertUser({ provider: 'google', providerId: '123', name: 'Alice', email: 'a@x.com', avatarUrl: '' })
  const updated = db.upsertUser({ provider: 'google', providerId: '123', name: 'Alice V2', email: 'a@x.com', avatarUrl: '' })
  assert.equal(updated.name, 'Alice V2')
})

test('upsertUser treats same providerId on different providers as different users', () => {
  const db = createDb(':memory:')
  const g = db.upsertUser({ provider: 'google', providerId: '1', name: 'Google User', email: '', avatarUrl: '' })
  const gh = db.upsertUser({ provider: 'github', providerId: '1', name: 'GitHub User', email: '', avatarUrl: '' })
  assert.notEqual(g.id, gh.id)
})

test('createEntry and getEntriesByMonth returns correct month only', () => {
  const db = createDb(':memory:')
  const user = db.upsertUser({ provider: 'github', providerId: '99', name: 'Bob', email: '', avatarUrl: '' })
  db.createEntry(user.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  db.createEntry(user.id, { name: 'Spotify', amount: 11, category: 'want', date: '2026-03-03' })
  db.createEntry(user.id, { name: 'Old rent', amount: 880, category: 'need', date: '2026-02-01' })
  const march = db.getEntriesByMonth(user.id, '2026-03')
  assert.equal(march.length, 2)
  assert.equal(march[0].name, 'Spotify') // date DESC ordering
})

test('getEntriesByMonth does not return another user\'s entries', () => {
  const db = createDb(':memory:')
  const u1 = db.upsertUser({ provider: 'google', providerId: '1', name: 'A', email: '', avatarUrl: '' })
  const u2 = db.upsertUser({ provider: 'google', providerId: '2', name: 'B', email: '', avatarUrl: '' })
  db.createEntry(u1.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const entries = db.getEntriesByMonth(u2.id, '2026-03')
  assert.equal(entries.length, 0)
})

test('updateEntry returns updated entry', () => {
  const db = createDb(':memory:')
  const user = db.upsertUser({ provider: 'google', providerId: '1', name: 'A', email: '', avatarUrl: '' })
  const entry = db.createEntry(user.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const updated = db.updateEntry(user.id, entry.id, {
    name: 'Rent Updated', amount: 950, category: 'need', date: '2026-03-01',
    notes: null, recurring: 0, payment_method: 'Bank transfer'
  })
  assert.equal(updated.name, 'Rent Updated')
  assert.equal(updated.amount, 950)
})

test('updateEntry returns undefined when entry belongs to another user', () => {
  const db = createDb(':memory:')
  const u1 = db.upsertUser({ provider: 'google', providerId: '1', name: 'A', email: '', avatarUrl: '' })
  const u2 = db.upsertUser({ provider: 'google', providerId: '2', name: 'B', email: '', avatarUrl: '' })
  const entry = db.createEntry(u1.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const result = db.updateEntry(u2.id, entry.id, {
    name: 'Hacked', amount: 1, category: 'want', date: '2026-03-01',
    notes: null, recurring: 0, payment_method: null
  })
  assert.equal(result, undefined)
})

test('deleteEntry returns true for own entry, false for another user\'s', () => {
  const db = createDb(':memory:')
  const u1 = db.upsertUser({ provider: 'google', providerId: '1', name: 'A', email: '', avatarUrl: '' })
  const u2 = db.upsertUser({ provider: 'google', providerId: '2', name: 'B', email: '', avatarUrl: '' })
  const entry = db.createEntry(u1.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  assert.equal(db.deleteEntry(u2.id, entry.id), false)
  assert.equal(db.deleteEntry(u1.id, entry.id), true)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test`

Expected: FAIL — `Cannot find module '../db/db.js'`

- [ ] **Step 3: Create db/schema.sql**

```sql
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT    NOT NULL,
  provider_id TEXT    NOT NULL,
  name        TEXT,
  email       TEXT,
  avatar_url  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, provider_id)
);

CREATE TABLE IF NOT EXISTS entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  name           TEXT    NOT NULL,
  amount         REAL    NOT NULL,
  category       TEXT    NOT NULL CHECK(category IN ('need', 'want', 'luxury')),
  date           TEXT    NOT NULL,
  notes          TEXT,
  recurring      INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Create db/db.js**

```javascript
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createDb(file = process.env.DB_PATH || 'data.db') {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  db.exec(schema)

  return {
    upsertUser({ provider, providerId, name, email, avatarUrl }) {
      return db.prepare(`
        INSERT INTO users (provider, provider_id, name, email, avatar_url)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          name       = excluded.name,
          email      = excluded.email,
          avatar_url = excluded.avatar_url
        RETURNING *
      `).get(provider, providerId, name, email, avatarUrl)
    },

    getUserById(id) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    },

    getEntriesByMonth(userId, month) {
      return db.prepare(`
        SELECT * FROM entries
        WHERE user_id = ? AND date LIKE ?
        ORDER BY date DESC, created_at DESC
      `).all(userId, `${month}-%`)
    },

    createEntry(userId, { name, amount, category, date, notes = null, recurring = 0, payment_method = null }) {
      return db.prepare(`
        INSERT INTO entries (user_id, name, amount, category, date, notes, recurring, payment_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(userId, name, amount, category, date, notes, recurring ? 1 : 0, payment_method)
    },

    updateEntry(userId, id, { name, amount, category, date, notes = null, recurring = 0, payment_method = null }) {
      return db.prepare(`
        UPDATE entries
        SET name = ?, amount = ?, category = ?, date = ?, notes = ?,
            recurring = ?, payment_method = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
        RETURNING *
      `).get(name, amount, category, date, notes, recurring ? 1 : 0, payment_method, id, userId)
    },

    deleteEntry(userId, id) {
      const result = db.prepare(
        'DELETE FROM entries WHERE id = ? AND user_id = ?'
      ).run(id, userId)
      return result.changes > 0
    }
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `npm test`

Expected: 8 passing tests, 0 failing

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql db/db.js test/db.test.js
git commit -m "feat: database layer with schema and query helpers"
```

---

### Task 3: Fastify App Factory

**Files:**
- Create: `server.js`

- [ ] **Step 1: Create server.js**

```javascript
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
      sameSite: 'lax'
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
```

- [ ] **Step 2: Create placeholder route files so the import resolves**

Create `routes/auth.js`:
```javascript
export default async function authRoutes(app) {}
```

Create `routes/entries.js`:
```javascript
export default async function entriesRoutes(app) {}
```

- [ ] **Step 3: Create placeholder public directory**

```bash
mkdir -p public/css public/js
touch public/login.html public/index.html public/entries.html
touch public/css/style.css public/js/api.js public/js/modal.js
touch public/js/overview.js public/js/entries.js
```

- [ ] **Step 4: Verify server starts**

Run: `npm run dev`

Expected: Server starts on port 3000 with no errors. Press Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add server.js routes/auth.js routes/entries.js public/
git commit -m "feat: fastify app factory with placeholder routes"
```

---

### Task 4: Auth Routes

**Files:**
- Modify: `routes/auth.js`

Note: OAuth flows cannot be unit tested without real credentials. This task covers the session management routes (`/auth/me`, `/auth/logout`) and the OAuth callback handlers. OAuth redirect routes (`/auth/google`, `/auth/github`) are created automatically by `@fastify/oauth2`.

You will need real OAuth credentials in `.env` to test the full OAuth flow manually. See `.env.example` for setup instructions for each provider.

- [ ] **Step 1: Replace routes/auth.js with the full implementation**

```javascript
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
```

- [ ] **Step 2: Verify server still starts**

Run: `npm run dev`

Expected: Server starts without errors. Press Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add routes/auth.js
git commit -m "feat: auth routes — Google/GitHub OAuth + session endpoints"
```

---

### Task 5: Entries API

**Files:**
- Modify: `routes/entries.js`
- Create: `test/entries.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/entries.test.js`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../server.js'

// Helper: builds app with in-memory DB, creates a user, sets session cookie
async function buildAuthedApp() {
  const app = await buildApp({ db: ':memory:', enableTestRoutes: true })
  const user = app.db.upsertUser({
    provider: 'google', providerId: '1', name: 'Tester',
    email: 'test@test.com', avatarUrl: ''
  })
  // Get a session cookie by hitting the test route
  const loginRes = await app.inject({ method: 'GET', url: `/test/set-session?userId=${user.id}` })
  const cookie = loginRes.headers['set-cookie']
  return { app, user, cookie }
}

test('GET /api/entries returns 401 without a session', async () => {
  const app = await buildApp({ db: ':memory:' })
  const res = await app.inject({ method: 'GET', url: '/api/entries?month=2026-03' })
  assert.equal(res.statusCode, 401)
  await app.close()
})

test('GET /api/entries returns 400 when month param is missing', async () => {
  const { app, cookie } = await buildAuthedApp()
  const res = await app.inject({ method: 'GET', url: '/api/entries', headers: { cookie } })
  assert.equal(res.statusCode, 400)
  await app.close()
})

test('GET /api/entries returns 400 when month param format is wrong', async () => {
  const { app, cookie } = await buildAuthedApp()
  const res = await app.inject({ method: 'GET', url: '/api/entries?month=March', headers: { cookie } })
  assert.equal(res.statusCode, 400)
  await app.close()
})

test('GET /api/entries returns empty array for month with no entries', async () => {
  const { app, cookie } = await buildAuthedApp()
  const res = await app.inject({ method: 'GET', url: '/api/entries?month=2026-03', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), [])
  await app.close()
})

test('POST /api/entries creates an entry and returns 201', async () => {
  const { app, cookie } = await buildAuthedApp()
  const res = await app.inject({
    method: 'POST', url: '/api/entries', headers: { cookie },
    payload: { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' }
  })
  assert.equal(res.statusCode, 201)
  const body = res.json()
  assert.equal(body.name, 'Rent')
  assert.equal(body.amount, 900)
  assert.equal(body.category, 'need')
  await app.close()
})

test('POST /api/entries returns 400 when required fields are missing', async () => {
  const { app, cookie } = await buildAuthedApp()
  const res = await app.inject({
    method: 'POST', url: '/api/entries', headers: { cookie },
    payload: { name: 'Rent' } // missing amount, category, date
  })
  assert.equal(res.statusCode, 400)
  await app.close()
})

test('PUT /api/entries/:id updates an existing entry', async () => {
  const { app, user, cookie } = await buildAuthedApp()
  const entry = app.db.createEntry(user.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const res = await app.inject({
    method: 'PUT', url: `/api/entries/${entry.id}`, headers: { cookie },
    payload: { name: 'Rent Updated', amount: 950, category: 'need', date: '2026-03-01', notes: null, recurring: 0, payment_method: null }
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().name, 'Rent Updated')
  await app.close()
})

// Note: spec originally specified 403 for cross-user access, but 404 is used here
// intentionally — it avoids revealing that the resource exists at all (security best practice).
test('PUT /api/entries/:id returns 404 for another user\'s entry', async () => {
  const app = await buildApp({ db: ':memory:', enableTestRoutes: true })
  const u1 = app.db.upsertUser({ provider: 'google', providerId: '1', name: 'A', email: '', avatarUrl: '' })
  const u2 = app.db.upsertUser({ provider: 'google', providerId: '2', name: 'B', email: '', avatarUrl: '' })
  const entry = app.db.createEntry(u1.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const loginRes = await app.inject({ method: 'GET', url: `/test/set-session?userId=${u2.id}` })
  const cookie = loginRes.headers['set-cookie']
  const res = await app.inject({
    method: 'PUT', url: `/api/entries/${entry.id}`, headers: { cookie },
    payload: { name: 'Hacked', amount: 1, category: 'want', date: '2026-03-01', notes: null, recurring: 0, payment_method: null }
  })
  assert.equal(res.statusCode, 404)
  await app.close()
})

test('DELETE /api/entries/:id deletes an entry and returns 204', async () => {
  const { app, user, cookie } = await buildAuthedApp()
  const entry = app.db.createEntry(user.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const res = await app.inject({ method: 'DELETE', url: `/api/entries/${entry.id}`, headers: { cookie } })
  assert.equal(res.statusCode, 204)
  await app.close()
})

test('DELETE /api/entries/:id returns 404 for another user\'s entry', async () => {
  const app = await buildApp({ db: ':memory:', enableTestRoutes: true })
  const u1 = app.db.upsertUser({ provider: 'google', providerId: '1', name: 'A', email: '', avatarUrl: '' })
  const u2 = app.db.upsertUser({ provider: 'google', providerId: '2', name: 'B', email: '', avatarUrl: '' })
  const entry = app.db.createEntry(u1.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const loginRes = await app.inject({ method: 'GET', url: `/test/set-session?userId=${u2.id}` })
  const cookie = loginRes.headers['set-cookie']
  const res = await app.inject({ method: 'DELETE', url: `/api/entries/${entry.id}`, headers: { cookie } })
  assert.equal(res.statusCode, 404)
  await app.close()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test`

Expected: db.test.js still passes. entries.test.js: all 10 entries tests FAIL (routes return empty responses or wrong status codes since entries.js is a stub).

- [ ] **Step 3: Implement routes/entries.js**

```javascript
export default async function entriesRoutes(app) {
  // Auth guard for all /api/* routes
  app.addHook('preHandler', async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/entries', async (request, reply) => {
    const { month } = request.query
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return reply.status(400).send({ error: 'month query param required (format: YYYY-MM)' })
    }
    return app.db.getEntriesByMonth(request.session.userId, month)
  })

  app.post('/entries', async (request, reply) => {
    const { name, amount, category, date, notes, recurring, payment_method } = request.body ?? {}
    if (!name || amount == null || !category || !date) {
      return reply.status(400).send({ error: 'name, amount, category and date are required' })
    }
    const entry = app.db.createEntry(request.session.userId, {
      name, amount, category, date, notes, recurring, payment_method
    })
    return reply.status(201).send(entry)
  })

  app.put('/entries/:id', async (request, reply) => {
    const entry = app.db.updateEntry(
      request.session.userId,
      parseInt(request.params.id),
      request.body
    )
    if (!entry) return reply.status(404).send({ error: 'Entry not found' })
    return entry
  })

  app.delete('/entries/:id', async (request, reply) => {
    const deleted = app.db.deleteEntry(
      request.session.userId,
      parseInt(request.params.id)
    )
    if (!deleted) return reply.status(404).send({ error: 'Entry not found' })
    return reply.status(204).send()
  })
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: All 18 tests pass (8 db + 10 entries). 0 failing.

- [ ] **Step 5: Commit**

```bash
git add routes/entries.js test/entries.test.js
git commit -m "feat: entries CRUD API with auth guard"
```

---

### Task 6: Login Page + Base CSS

**Files:**
- Modify: `public/login.html`
- Modify: `public/css/style.css`

- [ ] **Step 1: Write public/login.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spendly — Sign in</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body class="page-login">
  <div class="login-card">
    <h1 class="login-logo">Spendly</h1>
    <p class="login-tagline">Track your monthly spend</p>
    <div class="login-buttons">
      <a href="/auth/google" class="btn btn-oauth">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </a>
      <a href="/auth/github" class="btn btn-oauth">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
        </svg>
        Continue with GitHub
      </a>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 2: Write public/css/style.css** (base + login styles)

```css
/* ── Variables ─────────────────────────────────────────────────────────────── */
:root {
  --bg: #f8f8f8;
  --surface: #ffffff;
  --border: #e5e5e5;
  --text: #111111;
  --text-muted: #888888;
  --text-subtle: #555555;

  --need: #16a34a;
  --need-bg: #dcfce7;
  --want: #d97706;
  --want-bg: #fef3c7;
  --luxury: #7c3aed;
  --luxury-bg: #ede9fe;

  --radius: 8px;
  --radius-sm: 6px;
}

/* ── Reset ──────────────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
a { text-decoration: none; color: inherit; }
button { cursor: pointer; border: none; background: none; font: inherit; }

/* ── Buttons ────────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; padding: 10px 20px; border-radius: var(--radius-sm);
  font-weight: 600; font-size: 0.9rem; transition: opacity 0.15s;
}
.btn:hover { opacity: 0.85; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--text); color: #fff; width: 100%; padding: 12px; font-size: 0.95rem; }
.btn-full { width: 100%; }
.btn-ghost { background: none; color: var(--text-muted); font-size: 0.85rem; padding: 4px 8px; border-radius: 4px; }
.btn-ghost:hover { background: var(--border); color: var(--text); }
.btn-icon { background: none; color: var(--text-muted); font-size: 0.85rem; padding: 2px 5px; border-radius: 4px; }
.btn-icon:hover { background: var(--border); color: var(--text); }
.btn-oauth {
  display: flex; align-items: center; gap: 10px;
  background: var(--surface); border: 1px solid var(--border);
  padding: 12px 20px; border-radius: var(--radius-sm);
  font-size: 0.95rem; font-weight: 500; color: var(--text);
  transition: background 0.15s;
}
.btn-oauth:hover { background: var(--bg); }

/* ── Login page ─────────────────────────────────────────────────────────────── */
.page-login { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 40px 36px; width: 100%; max-width: 360px;
  text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.login-logo { font-size: 1.8rem; font-weight: 800; letter-spacing: -1px; margin-bottom: 6px; }
.login-tagline { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 32px; }
.login-buttons { display: flex; flex-direction: column; gap: 12px; }

/* ── Nav ────────────────────────────────────────────────────────────────────── */
.nav {
  background: var(--surface); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; height: 56px; position: sticky; top: 0; z-index: 100;
}
.nav-logo { font-size: 1.1rem; font-weight: 800; letter-spacing: -0.5px; }
.nav-links { display: flex; gap: 24px; }
.nav-link { font-size: 0.9rem; color: var(--text-muted); padding-bottom: 2px; }
.nav-link--active { color: var(--text); border-bottom: 2px solid var(--text); }
.nav-link:hover:not(.nav-link--active) { color: var(--text); }
.nav-user { display: flex; align-items: center; gap: 10px; }
.avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: var(--border); }

/* ── Layout ─────────────────────────────────────────────────────────────────── */
.container { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }

/* ── Month nav ──────────────────────────────────────────────────────────────── */
.month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.month-label { font-size: 1rem; font-weight: 700; }
.month-nav .btn-ghost { font-size: 1.2rem; padding: 2px 10px; }

/* ── Summary card ───────────────────────────────────────────────────────────── */
.summary-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px; display: flex;
  align-items: center; gap: 20px; margin-bottom: 12px;
}
.donut-wrapper { flex-shrink: 0; }
.donut {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--border);
  -webkit-mask: radial-gradient(farthest-side, transparent 54%, black 55%);
  mask: radial-gradient(farthest-side, transparent 54%, black 55%);
}
.summary-detail { flex: 1; min-width: 0; }
.summary-total-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
.summary-total { font-size: 1.8rem; font-weight: 800; letter-spacing: -1px; margin-bottom: 8px; }
.summary-legend { display: flex; flex-wrap: wrap; gap: 6px; }
.legend-item { font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.legend-need  { color: var(--need);    background: var(--need-bg); }
.legend-want  { color: var(--want);    background: var(--want-bg); }
.legend-luxury { color: var(--luxury); background: var(--luxury-bg); }

/* ── Category breakdown ─────────────────────────────────────────────────────── */
.category-breakdown { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.breakdown-row {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 12px 14px;
  display: flex; justify-content: space-between; align-items: center;
  border-left-width: 3px;
}
.breakdown-row--need    { border-left-color: var(--need); }
.breakdown-row--want    { border-left-color: var(--want); }
.breakdown-row--luxury  { border-left-color: var(--luxury); }
.breakdown-left { display: flex; align-items: center; gap: 10px; }
.breakdown-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.breakdown-dot--need    { background: var(--need); }
.breakdown-dot--want    { background: var(--want); }
.breakdown-dot--luxury  { background: var(--luxury); }
.breakdown-name { font-size: 0.9rem; font-weight: 600; }
.breakdown-count { font-size: 0.75rem; color: var(--text-muted); margin-top: 1px; }
.breakdown-right { text-align: right; }
.breakdown-amount { font-size: 1rem; font-weight: 700; }
.breakdown-amount--need    { color: var(--need); }
.breakdown-amount--want    { color: var(--want); }
.breakdown-amount--luxury  { color: var(--luxury); }
.breakdown-pct { font-size: 0.75rem; color: var(--text-muted); margin-top: 1px; }

/* ── Filter pills ────────────────────────────────────────────────────────────── */
.filter-pills { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.pill {
  padding: 5px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-muted);
  cursor: pointer; transition: all 0.15s;
}
.pill--active, .pill:hover { background: var(--text); color: #fff; border-color: var(--text); }
.pill--need.pill--active   { background: var(--need);    border-color: var(--need);    color: #fff; }
.pill--want.pill--active   { background: var(--want);    border-color: var(--want);    color: #fff; }
.pill--luxury.pill--active { background: var(--luxury);  border-color: var(--luxury);  color: #fff; }

/* ── Entry rows ──────────────────────────────────────────────────────────────── */
.entries-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
.entry-row {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 12px 14px;
  display: flex; justify-content: space-between; align-items: center;
  border-left-width: 3px;
}
.entry-row--need    { border-left-color: var(--need); }
.entry-row--want    { border-left-color: var(--want); }
.entry-row--luxury  { border-left-color: var(--luxury); }
.entry-info { min-width: 0; flex: 1; margin-right: 12px; }
.entry-name { font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.entry-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.entry-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.entry-amount { font-size: 1rem; font-weight: 700; }
.entry-amount--need    { color: var(--need); }
.entry-amount--want    { color: var(--want); }
.entry-amount--luxury  { color: var(--luxury); }
.entry-actions { display: flex; gap: 2px; }
.empty-state { text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.9rem; }

/* ── Modal ───────────────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3);
  opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 200;
}
.modal-backdrop--visible { opacity: 1; pointer-events: auto; }
.modal-panel {
  position: fixed; top: 0; right: 0; bottom: 0; width: 100%; max-width: 420px;
  background: var(--surface); box-shadow: -4px 0 24px rgba(0,0,0,0.1);
  transform: translateX(100%); transition: transform 0.25s ease; z-index: 201;
  overflow-y: auto; display: flex; flex-direction: column;
}
.modal-panel--open { transform: translateX(0); }
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.modal-title { font-size: 1rem; font-weight: 700; }
.modal-close { font-size: 1.4rem; color: var(--text-muted); line-height: 1; padding: 2px 6px; }
.modal-form { padding: 24px; flex: 1; display: flex; flex-direction: column; gap: 16px; }

/* ── Form elements ────────────────────────────────────────────────────────────── */
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group label { font-size: 0.8rem; font-weight: 600; color: var(--text-subtle); text-transform: uppercase; letter-spacing: 0.4px; }
.form-input {
  padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  font: inherit; font-size: 0.95rem; background: var(--surface); color: var(--text);
  transition: border-color 0.15s;
}
.form-input:focus { outline: none; border-color: var(--text); }
textarea.form-input { resize: vertical; }
.form-group--inline { flex-direction: row; align-items: center; justify-content: space-between; }
.form-group--inline input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--text); }
.form-error { color: #dc2626; font-size: 0.85rem; padding: 8px 12px; background: #fef2f2; border-radius: var(--radius-sm); }
```

- [ ] **Step 3: Verify the login page renders**

Run: `npm run dev`

Open `http://localhost:3000/login.html`. Expected: Clean white login card with logo, tagline, and two OAuth buttons. Press Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add public/login.html public/css/style.css
git commit -m "feat: login page and complete CSS design system"
```

---

### Task 7: Overview Page HTML

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Write public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spendly — Overview</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <nav class="nav">
    <span class="nav-logo">Spendly</span>
    <div class="nav-links">
      <a href="/" class="nav-link nav-link--active">Overview</a>
      <a href="/entries.html" class="nav-link">Entries</a>
    </div>
    <div class="nav-user">
      <img id="user-avatar" class="avatar" src="" alt="Your avatar">
      <button id="logout-btn" class="btn-ghost">Sign out</button>
    </div>
  </nav>
  <main class="container">
    <div class="month-nav">
      <button id="prev-month" class="btn-ghost" aria-label="Previous month">&#8249;</button>
      <span id="month-label" class="month-label"></span>
      <button id="next-month" class="btn-ghost" aria-label="Next month">&#8250;</button>
    </div>
    <div class="summary-card">
      <div class="donut-wrapper">
        <div id="donut" class="donut" role="img" aria-label="Spend breakdown chart"></div>
      </div>
      <div class="summary-detail">
        <div class="summary-total-label">Total this month</div>
        <div id="total-amount" class="summary-total">£0</div>
        <div class="summary-legend">
          <span class="legend-item legend-need" id="legend-need">Need £0</span>
          <span class="legend-item legend-want" id="legend-want">Want £0</span>
          <span class="legend-item legend-luxury" id="legend-luxury">Luxury £0</span>
        </div>
      </div>
    </div>
    <div id="category-breakdown" class="category-breakdown"></div>
    <button id="add-entry-btn" class="btn btn-primary btn-full">+ Add Entry</button>
  </main>
  <script type="module" src="/js/overview.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: overview page HTML structure"
```

---

### Task 8: Entries Page HTML

**Files:**
- Modify: `public/entries.html`

- [ ] **Step 1: Write public/entries.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spendly — Entries</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <nav class="nav">
    <span class="nav-logo">Spendly</span>
    <div class="nav-links">
      <a href="/" class="nav-link">Overview</a>
      <a href="/entries.html" class="nav-link nav-link--active">Entries</a>
    </div>
    <div class="nav-user">
      <img id="user-avatar" class="avatar" src="" alt="Your avatar">
      <button id="logout-btn" class="btn-ghost">Sign out</button>
    </div>
  </nav>
  <main class="container">
    <div class="month-nav">
      <button id="prev-month" class="btn-ghost" aria-label="Previous month">&#8249;</button>
      <span id="month-label" class="month-label"></span>
      <button id="next-month" class="btn-ghost" aria-label="Next month">&#8250;</button>
    </div>
    <div class="filter-pills">
      <button class="pill pill--active" data-filter="all">All</button>
      <button class="pill pill--need" data-filter="need">Need</button>
      <button class="pill pill--want" data-filter="want">Want</button>
      <button class="pill pill--luxury" data-filter="luxury">Luxury</button>
    </div>
    <div id="entries-list" class="entries-list"></div>
    <button id="add-entry-btn" class="btn btn-primary btn-full">+ Add Entry</button>
  </main>
  <script type="module" src="/js/entries.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/entries.html
git commit -m "feat: entries page HTML structure"
```

---

### Task 9: Frontend API Client

**Files:**
- Modify: `public/js/api.js`

- [ ] **Step 1: Write public/js/api.js**

```javascript
export async function getMe() {
  const res = await fetch('/auth/me')
  if (!res.ok) return null
  return res.json()
}

export async function getEntries(month) {
  const res = await fetch(`/api/entries?month=${month}`)
  if (!res.ok) throw new Error('Failed to fetch entries')
  return res.json()
}

export async function createEntry(data) {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to create entry')
  return res.json()
}

export async function updateEntry(id, data) {
  const res = await fetch(`/api/entries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to update entry')
  return res.json()
}

export async function deleteEntry(id) {
  const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete entry')
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/api.js
git commit -m "feat: frontend fetch API client"
```

---

### Task 10: Slide-in Modal

**Files:**
- Modify: `public/js/modal.js`

- [ ] **Step 1: Write public/js/modal.js**

```javascript
import { createEntry, updateEntry } from './api.js'

const PAYMENT_METHODS = ['Card', 'Bank transfer', 'Cash', 'Direct debit', 'Other']
const CATEGORIES = [
  { value: 'need', label: 'Need' },
  { value: 'want', label: 'Want' },
  { value: 'luxury', label: 'Luxury' }
]

let onSave = null
let editId = null

function $(id) { return document.getElementById(id) }

function buildModalHTML() {
  return `
    <div class="modal-backdrop" id="modal-backdrop"></div>
    <aside class="modal-panel" id="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 class="modal-title" id="modal-title">Add Entry</h2>
        <button class="btn-ghost modal-close" id="modal-close" aria-label="Close">&times;</button>
      </div>
      <form id="entry-form" class="modal-form" novalidate>
        <div class="form-group">
          <label for="field-name">Name *</label>
          <input id="field-name" name="name" type="text" class="form-input" required placeholder="e.g. Rent, Spotify">
        </div>
        <div class="form-group">
          <label for="field-amount">Amount (£) *</label>
          <input id="field-amount" name="amount" type="number" min="0.01" step="0.01" class="form-input" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label for="field-category">Category *</label>
          <select id="field-category" name="category" class="form-input" required>
            <option value="">Select...</option>
            ${CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="field-date">Date *</label>
          <input id="field-date" name="date" type="date" class="form-input" required>
        </div>
        <div class="form-group">
          <label for="field-payment">Payment Method</label>
          <select id="field-payment" name="payment_method" class="form-input">
            <option value="">Select...</option>
            ${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-group form-group--inline">
          <label for="field-recurring">Recurring monthly</label>
          <input id="field-recurring" name="recurring" type="checkbox">
        </div>
        <div class="form-group">
          <label for="field-notes">Notes</label>
          <textarea id="field-notes" name="notes" class="form-input" rows="3" placeholder="Optional notes..."></textarea>
        </div>
        <div id="form-error" class="form-error" hidden></div>
        <button type="submit" class="btn btn-primary btn-full" id="submit-btn">Save Entry</button>
      </form>
    </aside>
  `
}

export function initModal(saveCallback) {
  onSave = saveCallback
  const wrapper = document.createElement('div')
  wrapper.innerHTML = buildModalHTML()
  document.body.appendChild(wrapper)

  $('modal-close').addEventListener('click', closeModal)
  $('modal-backdrop').addEventListener('click', closeModal)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal() })
  $('entry-form').addEventListener('submit', handleSubmit)
}

export function openModal(entry = null) {
  editId = entry?.id ?? null
  $('modal-title').textContent = entry ? 'Edit Entry' : 'Add Entry'
  $('submit-btn').textContent = entry ? 'Save Changes' : 'Save Entry'

  $('entry-form').reset()
  $('form-error').hidden = true

  if (entry) {
    $('field-name').value = entry.name
    $('field-amount').value = entry.amount
    $('field-category').value = entry.category
    $('field-date').value = entry.date
    $('field-payment').value = entry.payment_method || ''
    $('field-recurring').checked = Boolean(entry.recurring)
    $('field-notes').value = entry.notes || ''
  } else {
    $('field-date').value = new Date().toISOString().split('T')[0]
  }

  $('modal-backdrop').classList.add('modal-backdrop--visible')
  $('modal-panel').classList.add('modal-panel--open')
  $('field-name').focus()
}

export function closeModal() {
  $('modal-backdrop').classList.remove('modal-backdrop--visible')
  $('modal-panel').classList.remove('modal-panel--open')
  editId = null
}

async function handleSubmit(e) {
  e.preventDefault()
  const form = e.target
  const errorEl = $('form-error')
  const submitBtn = $('submit-btn')

  const data = {
    name: form.name.value.trim(),
    amount: parseFloat(form.amount.value),
    category: form.category.value,
    date: form.date.value,
    payment_method: form.payment_method.value || null,
    recurring: form.recurring.checked ? 1 : 0,
    notes: form.notes.value.trim() || null
  }

  if (!data.name || !data.amount || !data.category || !data.date) {
    errorEl.textContent = 'Name, amount, category and date are required.'
    errorEl.hidden = false
    return
  }

  submitBtn.disabled = true
  submitBtn.textContent = 'Saving...'
  errorEl.hidden = true

  try {
    if (editId) {
      await updateEntry(editId, data)
    } else {
      await createEntry(data)
    }
    closeModal()
    onSave?.()
  } catch {
    errorEl.textContent = 'Failed to save. Please try again.'
    errorEl.hidden = false
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = editId ? 'Save Changes' : 'Save Entry'
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/modal.js
git commit -m "feat: slide-in add/edit modal"
```

---

### Task 11: Overview Page JS

**Files:**
- Modify: `public/js/overview.js`

- [ ] **Step 1: Write public/js/overview.js**

```javascript
import { getMe, getEntries } from './api.js'
import { initModal, openModal } from './modal.js'

const COLORS = { need: '#16a34a', want: '#d97706', luxury: '#7c3aed' }

function fmt(n) {
  const s = n.toFixed(2)
  return `£${s.endsWith('.00') ? s.slice(0, -3) : s}`
}

function getMonth() {
  return new URLSearchParams(location.search).get('month')
    || new Date().toISOString().slice(0, 7)
}

function setMonth(month) {
  const url = new URL(location.href)
  url.searchParams.set('month', month)
  history.pushState({}, '', url)
  load()
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

async function load() {
  const month = getMonth()
  document.getElementById('month-label').textContent = fmtMonthLabel(month)

  const entries = await getEntries(month)
  const totals = { need: 0, want: 0, luxury: 0 }
  const counts = { need: 0, want: 0, luxury: 0 }

  for (const e of entries) {
    totals[e.category] += e.amount
    counts[e.category]++
  }

  const total = totals.need + totals.want + totals.luxury
  const donut = document.getElementById('donut')

  if (total === 0) {
    donut.style.background = '#e5e5e5'
  } else {
    const n = (totals.need / total) * 100
    const w = (totals.want / total) * 100
    donut.style.background = `conic-gradient(
      ${COLORS.need} 0% ${n}%,
      ${COLORS.want} ${n}% ${n + w}%,
      ${COLORS.luxury} ${n + w}% 100%
    )`
  }

  document.getElementById('total-amount').textContent = fmt(total)
  document.getElementById('legend-need').textContent = `Need ${fmt(totals.need)}`
  document.getElementById('legend-want').textContent = `Want ${fmt(totals.want)}`
  document.getElementById('legend-luxury').textContent = `Luxury ${fmt(totals.luxury)}`

  const breakdown = document.getElementById('category-breakdown')
  breakdown.innerHTML = ['need', 'want', 'luxury'].map(cat => {
    const pct = total ? Math.round((totals[cat] / total) * 100) : 0
    const label = cat.charAt(0).toUpperCase() + cat.slice(1)
    const n = counts[cat]
    return `
      <div class="breakdown-row breakdown-row--${cat}">
        <div class="breakdown-left">
          <span class="breakdown-dot breakdown-dot--${cat}"></span>
          <div>
            <div class="breakdown-name">${label}</div>
            <div class="breakdown-count">${n} entr${n === 1 ? 'y' : 'ies'}</div>
          </div>
        </div>
        <div class="breakdown-right">
          <div class="breakdown-amount breakdown-amount--${cat}">${fmt(totals[cat])}</div>
          <div class="breakdown-pct">${pct}%</div>
        </div>
      </div>
    `
  }).join('')
}

async function init() {
  const user = await getMe()
  if (!user) { location.href = '/login.html'; return }

  document.getElementById('user-avatar').src = user.avatarUrl || ''
  document.getElementById('logout-btn').addEventListener('click', () => { location.href = '/auth/logout' })
  document.getElementById('prev-month').addEventListener('click', () => setMonth(shiftMonth(getMonth(), -1)))
  document.getElementById('next-month').addEventListener('click', () => setMonth(shiftMonth(getMonth(), 1)))
  document.getElementById('add-entry-btn').addEventListener('click', () => openModal())

  initModal(load)
  await load()
}

init()
```

- [ ] **Step 2: Smoke test the overview page**

Run: `npm run dev`

Open `http://localhost:3000`. Expected: Redirect to `/login.html` (because `getMe()` returns 401 → `location.href = '/login.html'`). Press Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add public/js/overview.js
git commit -m "feat: overview page JS — donut chart, category breakdown, month nav"
```

---

### Task 12: Entries Page JS

**Files:**
- Modify: `public/js/entries.js`

- [ ] **Step 1: Write public/js/entries.js**

```javascript
import { getMe, getEntries, deleteEntry } from './api.js'
import { initModal, openModal } from './modal.js'

let currentEntries = []
let activeFilter = 'all'

function fmt(n) {
  const s = n.toFixed(2)
  return `£${s.endsWith('.00') ? s.slice(0, -3) : s}`
}

function getMonth() {
  return new URLSearchParams(location.search).get('month')
    || new Date().toISOString().slice(0, 7)
}

function setMonth(month) {
  const url = new URL(location.href)
  url.searchParams.set('month', month)
  history.pushState({}, '', url)
  load()
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function renderEntries() {
  const list = document.getElementById('entries-list')
  const filtered = activeFilter === 'all'
    ? currentEntries
    : currentEntries.filter(e => e.category === activeFilter)

  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty-state">No entries for this period.</p>'
    return
  }

  list.innerHTML = filtered.map(e => {
    const label = e.category.charAt(0).toUpperCase() + e.category.slice(1)
    const meta = [
      fmtDate(e.date),
      label,
      e.recurring ? 'Recurring' : null,
      e.payment_method || null
    ].filter(Boolean).join(' · ')

    return `
      <div class="entry-row entry-row--${e.category}">
        <div class="entry-info">
          <div class="entry-name">${e.name}</div>
          <div class="entry-meta">${meta}</div>
        </div>
        <div class="entry-right">
          <div class="entry-amount entry-amount--${e.category}">${fmt(e.amount)}</div>
          <div class="entry-actions">
            <button class="btn-icon edit-btn" data-id="${e.id}" aria-label="Edit ${e.name}">✏</button>
            <button class="btn-icon delete-btn" data-id="${e.id}" aria-label="Delete ${e.name}">✕</button>
          </div>
        </div>
      </div>
    `
  }).join('')

  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = currentEntries.find(e => e.id === parseInt(btn.dataset.id))
      openModal(entry)
    })
  })

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return
      try {
        await deleteEntry(parseInt(btn.dataset.id))
        await load()
      } catch {
        alert('Failed to delete. Please try again.')
      }
    })
  })
}

async function load() {
  const month = getMonth()
  document.getElementById('month-label').textContent = fmtMonthLabel(month)
  currentEntries = await getEntries(month)
  renderEntries()
}

async function init() {
  const user = await getMe()
  if (!user) { location.href = '/login.html'; return }

  document.getElementById('user-avatar').src = user.avatarUrl || ''
  document.getElementById('logout-btn').addEventListener('click', () => { location.href = '/auth/logout' })
  document.getElementById('prev-month').addEventListener('click', () => setMonth(shiftMonth(getMonth(), -1)))
  document.getElementById('next-month').addEventListener('click', () => setMonth(shiftMonth(getMonth(), 1)))
  document.getElementById('add-entry-btn').addEventListener('click', () => openModal())

  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('pill--active'))
      pill.classList.add('pill--active')
      activeFilter = pill.dataset.filter
      renderEntries()
    })
  })

  initModal(load)
  await load()
}

init()
```

- [ ] **Step 2: Commit**

```bash
git add public/js/entries.js
git commit -m "feat: entries page JS — list, filter pills, edit/delete, month nav"
```

---

### Task 13: End-to-End Manual Test

- [ ] **Step 1: Set up OAuth credentials**

Go to `.env` and fill in real OAuth credentials:

- **Google:** Create a project at https://console.cloud.google.com/apis/credentials → "Create Credentials" → "OAuth client ID" → Application type: Web → Authorised redirect URI: `http://localhost:3000/auth/google/callback`
- **GitHub:** Go to https://github.com/settings/developers → "New OAuth App" → Homepage URL: `http://localhost:3000` → Callback URL: `http://localhost:3000/auth/github/callback`

- [ ] **Step 2: Start the server and run through the full flow**

Run: `npm run dev`

Checklist:
- [ ] `http://localhost:3000` → redirects to `/login.html`
- [ ] Click "Continue with Google" → OAuth flow → redirects to Overview
- [ ] Overview shows "March 2026", empty donut, all three categories at £0
- [ ] Click "+ Add Entry" → slide-in modal appears from right
- [ ] Fill in: Name=Rent, Amount=900, Category=Need, Date=today → Save
- [ ] Modal closes, Overview updates: Need row shows £900, donut is solid green
- [ ] Add 2 more entries (one Want, one Luxury)
- [ ] Donut shows three segments, totals update
- [ ] Click "Entries" nav → Entries page shows all three rows
- [ ] Click Need filter pill → only Need entries shown
- [ ] Click ✏ on Rent → modal opens pre-filled
- [ ] Change amount to 950 → Save → list updates
- [ ] Click ✕ on an entry → confirm dialog → entry deleted → list updates
- [ ] Click ‹ month arrow → shows previous month with empty state
- [ ] Click "Sign out" → back to login.html

- [ ] **Step 3: Run all automated tests one final time**

Run: `npm test`

Expected: All 18 tests pass.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: verify end-to-end flow"
```

---

### Task 14: Deployment

**Files:**
- Create: `Procfile`

- [ ] **Step 1: Create Procfile (for Railway/Render/Heroku)**

```
web: node server.js
```

- [ ] **Step 2: Ensure NODE_ENV is set in production**

On your hosting platform, set these environment variables (use the platform's dashboard):

```
NODE_ENV=production
SESSION_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
DB_PATH=/data/data.db          # adjust to your platform's persistent volume mount path
PORT=3000                      # most platforms set this automatically
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://yourdomain.com/auth/github/callback
```

**Important:** Update your OAuth app callback URLs on Google and GitHub to point to your production domain before deploying.

**SQLite persistence:** On Railway, attach a volume and set `DB_PATH` to a path within it (e.g. `/data/data.db`). On Render, use a Persistent Disk. On Fly.io, use `fly volumes create`. Ephemeral storage will lose the database on restart.

- [ ] **Step 3: Commit**

```bash
git add Procfile
git commit -m "feat: add Procfile for deployment"
```
