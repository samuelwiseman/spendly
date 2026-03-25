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
