import type { DB as Database } from "./db";

export type Category = "need" | "want" | "luxury";

/** Ordered least → most discretionary. The ordinal ramp depends on this order. */
export const CATEGORIES: readonly Category[] = ["need", "want", "luxury"] as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  need: "Need",
  want: "Want",
  luxury: "Luxury",
};

export interface Entry {
  id: number;
  user_id: number;
  name: string;
  amount_pence: number;
  category: Category;
  date: string;
  notes: string | null;
  recurring: 0 | 1;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
  name: string;
  amount_pence: number;
  category: Category;
  date: string;
  notes?: string | null;
  recurring?: boolean;
  payment_method?: string | null;
}

export interface UserInput {
  provider: string;
  providerId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

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

export function getEntriesByMonth(db: Database, userId: number, month: string): Entry[] {
  return db
    .prepare(
      `SELECT * FROM entries
       WHERE user_id = ? AND date LIKE ?
       ORDER BY date DESC, created_at DESC`,
    )
    .all(userId, `${month}-%`) as Entry[];
}

export function categoryTotals(db: Database, userId: number, month: string): Record<Category, number> {
  const rows = db
    .prepare(
      `SELECT category, SUM(amount_pence) AS total FROM entries
       WHERE user_id = ? AND date LIKE ?
       GROUP BY category`,
    )
    .all(userId, `${month}-%`) as { category: Category; total: number }[];

  const totals: Record<Category, number> = { need: 0, want: 0, luxury: 0 };
  for (const row of rows) totals[row.category] = row.total;
  return totals;
}

export function countEntries(db: Database, userId: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM entries WHERE user_id = ?").get(userId) as { n: number }).n;
}

export function createEntry(db: Database, userId: number, input: EntryInput): Entry {
  return db
    .prepare(
      `INSERT INTO entries (user_id, name, amount_pence, category, date, notes, recurring, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .get(
      userId, input.name, input.amount_pence, input.category, input.date,
      input.notes ?? null, input.recurring ? 1 : 0, input.payment_method ?? null,
    ) as Entry;
}

export function updateEntry(db: Database, userId: number, id: number, input: EntryInput): Entry | undefined {
  return db
    .prepare(
      `UPDATE entries
       SET name = ?, amount_pence = ?, category = ?, date = ?, notes = ?,
           recurring = ?, payment_method = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?
       RETURNING *`,
    )
    .get(
      input.name, input.amount_pence, input.category, input.date,
      input.notes ?? null, input.recurring ? 1 : 0, input.payment_method ?? null,
      id, userId,
    ) as Entry | undefined;
}

export function deleteEntry(db: Database, userId: number, id: number): boolean {
  return db.prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function exportUser(db: Database, userId: number): { user: unknown; entries: Entry[] } {
  return {
    user: db.prepare("SELECT id, provider, name, email, created_at FROM users WHERE id = ?").get(userId),
    entries: db.prepare("SELECT * FROM entries WHERE user_id = ? ORDER BY date").all(userId) as Entry[],
  };
}

export function deleteUser(db: Database, userId: number): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}
