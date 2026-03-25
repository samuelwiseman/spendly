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

test('PUT /api/entries/:id returns 400 when required fields are missing', async () => {
  const { app, user, cookie } = await buildAuthedApp()
  const entry = app.db.createEntry(user.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const res = await app.inject({
    method: 'PUT', url: `/api/entries/${entry.id}`, headers: { cookie },
    payload: { name: 'Rent' } // missing amount, category, date
  })
  assert.equal(res.statusCode, 400)
  await app.close()
})

test('PUT /api/entries/:id returns 404 for another user\'s entry', async () => {
  const app = await buildApp({ db: ':memory:', enableTestRoutes: true })
  const u1 = app.db.upsertUser({ provider: 'google', providerId: '1', name: 'A', email: '', avatarUrl: '' })
  const u2 = app.db.upsertUser({ provider: 'google', providerId: '2', name: 'B', email: '', avatarUrl: '' })
  const entry = app.db.createEntry(u1.id, { name: 'Rent', amount: 900, category: 'need', date: '2026-03-01' })
  const loginRes = await app.inject({ method: 'GET', url: `/test/set-session?userId=${u2.id}` })
  const cookie = loginRes.headers['set-cookie']
  // Note: spec originally specified 403 for cross-user access, but 404 is used here
  // intentionally — it avoids revealing that the resource exists at all (security best practice).
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
