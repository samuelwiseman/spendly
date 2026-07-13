export const SCHEMA = `
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
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  amount_pence   INTEGER NOT NULL CHECK(amount_pence > 0),
  category       TEXT    NOT NULL CHECK(category IN ('need', 'want', 'luxury')),
  date           TEXT    NOT NULL CHECK(date GLOB '????-??-??'),
  notes          TEXT,
  recurring      INTEGER NOT NULL DEFAULT 0 CHECK(recurring IN (0, 1)),
  payment_method TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, date);
`;
