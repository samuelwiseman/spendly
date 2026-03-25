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
    },

    close() {
      db.close()
    }
  }
}
