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

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  amount_pence   INTEGER NOT NULL CHECK(amount_pence > 0),
  category_id    INTEGER NOT NULL REFERENCES categories(id),
  date           TEXT    NOT NULL CHECK(date GLOB '????-??-??'),
  notes          TEXT,
  recurring      INTEGER NOT NULL DEFAULT 0 CHECK(recurring IN (0, 1)),
  end_month      TEXT    CHECK(end_month IS NULL OR end_month GLOB '????-??'),
  payment_method TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
`;
