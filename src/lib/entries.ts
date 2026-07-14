import type { DB as Database } from "./db";
import { nextColor } from "./palette";

export interface Category {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

export interface Entry {
  id: number;
  user_id: number;
  name: string;
  amount_pence: number;
  category_id: number;
  date: string;
  notes: string | null;
  recurring: 0 | 1;
  end_month: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryWithCategory extends Entry {
  category_name: string;
  category_color: string;
}

export interface EntryInput {
  name: string;
  amount_pence: number;
  category_id: number;
  date: string;
  notes?: string | null;
  recurring?: boolean;
  payment_method?: string | null;
}

export interface CategoryTotal {
  id: number;
  name: string;
  color: string;
  total: number;
}

export interface Suggestion {
  name: string;
  amount_pence: number;
  category_name: string;
  payment_method: string | null;
}

export interface UserInput {
  provider: string;
  providerId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

/** Entries counted in a month: one-offs dated in it, plus active recurring entries.
 *  Binds three `?` — all the target month. `e` is the entries alias. */
const IN_MONTH = `(
  (e.recurring = 0 AND substr(e.date, 1, 7) = ?)
  OR
  (e.recurring = 1 AND substr(e.date, 1, 7) <= ? AND (e.end_month IS NULL OR e.end_month >= ?))
)`;

export function upsertUser(db: Database, u: UserInput): { id: number } {
  return db
    .prepare(
      `INSERT INTO users (provider, provider_id, name, email, avatar_url)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(provider, provider_id) DO UPDATE SET
         name = excluded.name, email = excluded.email, avatar_url = excluded.avatar_url
       RETURNING id`,
    )
    .get(u.provider, u.providerId, u.name, u.email, u.avatarUrl) as { id: number };
}

export function listCategories(db: Database, userId: number): Category[] {
  return db
    .prepare(`SELECT id, name, color, sort_order FROM categories WHERE user_id = ? ORDER BY sort_order`)
    .all(userId) as Category[];
}

export function getOrCreateCategory(db: Database, userId: number, name: string): Category {
  const existing = db
    .prepare(`SELECT id, name, color, sort_order FROM categories WHERE user_id = ? AND name = ?`)
    .get(userId, name) as Category | undefined;
  if (existing) return existing;

  const count = (db.prepare(`SELECT COUNT(*) AS n FROM categories WHERE user_id = ?`).get(userId) as { n: number }).n;
  return db
    .prepare(
      `INSERT INTO categories (user_id, name, color, sort_order)
       VALUES (?, ?, ?, ?)
       RETURNING id, name, color, sort_order`,
    )
    .get(userId, name, nextColor(count), count) as Category;
}

export function getEntriesByMonth(db: Database, userId: number, month: string): EntryWithCategory[] {
  return db
    .prepare(
      `SELECT e.*, c.name AS category_name, c.color AS category_color
       FROM entries e JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ? AND ${IN_MONTH}
       ORDER BY e.date DESC, e.created_at DESC`,
    )
    .all(userId, month, month, month) as EntryWithCategory[];
}

export function categoryTotals(db: Database, userId: number, month: string): CategoryTotal[] {
  return db
    .prepare(
      `SELECT c.id AS id, c.name AS name, c.color AS color, SUM(e.amount_pence) AS total
       FROM entries e JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ? AND ${IN_MONTH}
       GROUP BY c.id
       ORDER BY total DESC, c.name`,
    )
    .all(userId, month, month, month) as CategoryTotal[];
}

export function nameSuggestions(db: Database, userId: number): Suggestion[] {
  return db
    .prepare(
      `SELECT e.name AS name, e.amount_pence AS amount_pence,
              c.name AS category_name, e.payment_method AS payment_method
       FROM entries e JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ?
         AND e.id IN (SELECT MAX(id) FROM entries WHERE user_id = ? GROUP BY name)
       ORDER BY e.name`,
    )
    .all(userId, userId) as Suggestion[];
}

export function countEntries(db: Database, userId: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM entries WHERE user_id = ?").get(userId) as { n: number }).n;
}

export function createEntry(db: Database, userId: number, input: EntryInput): Entry {
  return db
    .prepare(
      `INSERT INTO entries (user_id, name, amount_pence, category_id, date, notes, recurring, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .get(
      userId, input.name, input.amount_pence, input.category_id, input.date,
      input.notes ?? null, input.recurring ? 1 : 0, input.payment_method ?? null,
    ) as Entry;
}

export function updateEntry(db: Database, userId: number, id: number, input: EntryInput): Entry | undefined {
  return db
    .prepare(
      `UPDATE entries
       SET name = ?, amount_pence = ?, category_id = ?, date = ?, notes = ?,
           recurring = ?, payment_method = ?, end_month = NULL, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?
       RETURNING *`,
    )
    .get(
      input.name, input.amount_pence, input.category_id, input.date,
      input.notes ?? null, input.recurring ? 1 : 0, input.payment_method ?? null,
      id, userId,
    ) as Entry | undefined;
}

export function stopRecurring(db: Database, userId: number, id: number, month: string): boolean {
  return db
    .prepare(
      `UPDATE entries SET end_month = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND recurring = 1`,
    )
    .run(month, id, userId).changes > 0;
}

export function deleteEntry(db: Database, userId: number, id: number): boolean {
  return db.prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

/** Whether the user owns an entry with this id. Lets a caller confirm ownership
 *  before doing work (e.g. creating a category) that a failed write would waste. */
export function entryOwnedBy(db: Database, userId: number, id: number): boolean {
  return db.prepare("SELECT 1 FROM entries WHERE id = ? AND user_id = ?").get(id, userId) !== undefined;
}

export function exportUser(db: Database, userId: number): { user: unknown; entries: unknown[] } {
  return {
    user: db.prepare("SELECT id, provider, name, email, created_at FROM users WHERE id = ?").get(userId),
    entries: db
      .prepare(
        `SELECT e.*, c.name AS category_name FROM entries e
         JOIN categories c ON c.id = e.category_id
         WHERE e.user_id = ? ORDER BY e.date`,
      )
      .all(userId),
  };
}

export function deleteUser(db: Database, userId: number): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}
