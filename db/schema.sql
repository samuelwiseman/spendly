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
  date           TEXT    NOT NULL CHECK(date GLOB '????-??-??'),
  notes          TEXT,
  recurring      INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
