# Spendly Custom Categories, Autocomplete & Recurrence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed need/want/luxury scale with user-defined, auto-coloured categories; add name/category autocomplete with prefill; and make the `recurring` flag actually recur across months.

**Architecture:** SQLite gains a per-user `categories` table; `entries.category` (enum) becomes `entries.category_id` (FK) and gains `end_month`. `lib/entries.ts` stays the only SQL writer and computes a month's figures with a single predicate that unions one-off entries in the month with active recurring entries. Server Actions resolve a typed category name to a category row before writing. The overview's bar/legend/table become N-category driven by stored per-category colours. The entry dialog uses native `<datalist>` autocomplete and imperatively prefills from the most recent matching entry.

**Tech Stack:** Next.js 16.2.10, React 19, TypeScript 5.7, `better-sqlite3` 12, `zod` 4, Vitest 4, Playwright 1.

**Spec:** `docs/superpowers/specs/2026-07-14-spendly-custom-categories-recurrence-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Money:** stored as `amount_pence INTEGER`. Pounds exist only in `lib/money.ts` and rendered output. Currency GBP, locale `en-GB`.
- **Timezone:** `TZ=Europe/London`. Never `new Date()` to derive the current month — use `currentMonth()`/`resolveMonth()` from `lib/months.ts`.
- **Ports:** dev/start on **3001**; Playwright on **3101**.
- **`entries.ts` contract:** every function takes an explicit `db` handle and `userId`; no query may cross users. All are tested against `:memory:`.
- **`"use server"` files** may only export async functions (why `ActionResult`, `ENTRY_CAP` live in their own modules).
- **No production data exists yet** — schema changes are edits to `src/lib/schema.ts` with no migration.
- **Design rules unchanged:** no shadows; elevation via `--surface-raised` + `1px solid var(--line)`; figures are mono `tabular-nums`; reduced motion handled only in CSS. Category colour is never the sole signal — legend + table always carry the name.
- **Limits:** `ENTRY_CAP = 5000`; rate limit 60 mutations / 300s / user (unchanged).
- **Testing:** TDD. `npm test` (Vitest), `npm run test:e2e` (Playwright). Commit after every green cycle.
- **Breaking-change sequencing (important):** Task 2 changes the `Entry` shape and removes `CATEGORIES`/`CATEGORY_LABELS`, which breaks the UI components until they are migrated in Tasks 4–5. Vitest only compiles files reached from test files, so `npm test` stays green the whole way; but a **full-project `npx tsc --noEmit` / `npm run build` will not pass until the end of Task 5**. That is expected — Tasks 2–4 verify via `npm test` and review; the project-wide typecheck/build gate lives in Task 5.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/palette.ts` | Create | Categorical colour palette + `nextColor()` |
| `src/lib/palette.test.ts` | Create | Palette unit tests |
| `src/lib/schema.ts` | Modify | Add `categories`; `entries.category`→`category_id`; add `end_month` |
| `src/lib/entries.ts` | Modify | Category CRUD, recurrence-aware reads, suggestions, stop |
| `src/lib/entries.test.ts` | Rewrite | Tests for the new data layer |
| `src/lib/actions.ts` | Modify | Resolve category name→id; `stopRecurringAction`; category validation |
| `src/app/globals.css` | Modify | Drop ordinal `--cat-*` tokens/rules; add `.entry-tag`, `.dialog-note` |
| `src/components/SpendBar.tsx` | Rewrite | N-segment bar from `CategoryTotal[]`, inline colours |
| `src/components/SpendTable.tsx` | Rewrite | N-row table from `CategoryTotal[]` |
| `src/app/page.tsx` | Modify | Dynamic totals; remove "% discretionary" |
| `src/components/EntryDialog.tsx` | Rewrite | Category datalist; name datalist + prefill; recurring note |
| `src/components/EntryRow.tsx` | Rewrite | Stored colour dot; "monthly" tag; End-recurrence control |
| `src/app/entries/page.tsx` | Modify | Preload categories + suggestions; pass down |
| `tests/spendly.spec.ts` | Modify | Update category-based tests; add category/autocomplete/recurrence e2e |

---

## Task 1: Categorical palette

Pure, isolated, no schema dependency. `entries.getOrCreateCategory` (Task 2) consumes it.

**Files:**
- Create: `src/lib/palette.ts`, `src/lib/palette.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PALETTE: readonly string[]` — ordered categorical hex colours
  - `nextColor(usedCount: number): string` — colour for the Nth (0-based) category, cycling past the palette length

- [ ] **Step 1: Write the failing test**

Create `src/lib/palette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PALETTE, nextColor } from "./palette";

describe("nextColor", () => {
  it("assigns colours in palette order", () => {
    expect(nextColor(0)).toBe(PALETTE[0]);
    expect(nextColor(1)).toBe(PALETTE[1]);
  });
  it("cycles once the palette is exhausted", () => {
    expect(nextColor(PALETTE.length)).toBe(PALETTE[0]);
    expect(nextColor(PALETTE.length + 1)).toBe(PALETTE[1]);
  });
  it("has at least 8 distinct colours", () => {
    expect(new Set(PALETTE).size).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/palette.test.ts`
Expected: FAIL — `Failed to resolve import "./palette"`

- [ ] **Step 3: Implement `src/lib/palette.ts`**

Light-on-dark categorical hues for surface `#16150f`. Re-validate distinctness/contrast with the dataviz validator (Step 4) and adjust hex values if it flags any pair.

```ts
/** Categorical (qualitative) palette for user categories on the dark surface.
 *  Order is assignment order; colours are stored per category so they are stable. */
export const PALETTE = [
  "#e8a093", // coral
  "#7fb3d5", // blue
  "#a3d9a5", // green
  "#e8c468", // amber
  "#c9a0dc", // violet
  "#f0a6ca", // pink
  "#7fd1c4", // teal
  "#d4956a", // ochre
] as const;

export function nextColor(usedCount: number): string {
  return PALETTE[usedCount % PALETTE.length];
}
```

- [ ] **Step 4: Run to verify pass, then validate the palette**

Run: `npm test -- src/lib/palette.test.ts`
Expected: PASS, 3 tests.

Run (categorical mode against the dark surface):
`node <dataviz-skill>/scripts/validate_palette.js "#e8a093,#7fb3d5,#a3d9a5,#e8c468,#c9a0dc,#f0a6ca,#7fd1c4,#d4956a" --mode dark --surface "#16150f"`
Expected: all swatches pass contrast against the surface and are mutually distinguishable. If any pair is flagged, nudge its lightness/hue and re-run the unit test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/palette.ts src/lib/palette.test.ts
git commit -m "feat: categorical colour palette for user-defined categories"
```

---

## Task 2: Data layer — schema, categories, recurrence

The schema change breaks the old `entries.ts`/`entries.test.ts` immediately, so schema + queries + tests move together and land green in one commit. This is the heart of the feature.

**Files:**
- Modify: `src/lib/schema.ts`
- Modify: `src/lib/entries.ts`
- Rewrite: `src/lib/entries.test.ts`

**Interfaces:**
- Consumes: `nextColor` (Task 1); `type DB` from `db.ts`.
- Produces:
  - `interface Category { id: number; name: string; color: string; sort_order: number }`
  - `interface Entry { id, user_id, name, amount_pence, category_id, date, notes, recurring: 0|1, end_month: string|null, payment_method, created_at, updated_at }`
  - `interface EntryWithCategory extends Entry { category_name: string; category_color: string }`
  - `interface EntryInput { name; amount_pence; category_id: number; date; notes?; recurring?: boolean; payment_method? }`
  - `interface CategoryTotal { id: number; name: string; color: string; total: number }`
  - `interface Suggestion { name: string; amount_pence: number; category_name: string; payment_method: string | null }`
  - `listCategories(db, userId): Category[]`
  - `getOrCreateCategory(db, userId, name: string): Category`
  - `getEntriesByMonth(db, userId, month): EntryWithCategory[]`
  - `categoryTotals(db, userId, month): CategoryTotal[]`
  - `nameSuggestions(db, userId): Suggestion[]`
  - `countEntries(db, userId): number` (unchanged)
  - `createEntry(db, userId, input: EntryInput): Entry`
  - `updateEntry(db, userId, id, input: EntryInput): Entry | undefined` (also clears `end_month`)
  - `stopRecurring(db, userId, id, month: string): boolean`
  - `deleteEntry`, `exportUser`, `deleteUser`, `upsertUser` (retained; `exportUser` now joins category name)
  - **Removed:** `type Category = "need"|"want"|"luxury"`, `CATEGORIES`, `CATEGORY_LABELS`

- [ ] **Step 1: Replace `src/lib/schema.ts`**

```ts
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
```

Note: `entries.category_id` has no `ON DELETE` clause, so with `foreign_keys = ON` deleting an in-use category fails — deliberate (no delete-category UI in v1).

- [ ] **Step 2: Write the failing tests**

Rewrite `src/lib/entries.test.ts` entirely:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type DB } from "./db";
import {
  categoryTotals, countEntries, createEntry, deleteEntry, deleteUser, exportUser,
  getEntriesByMonth, getOrCreateCategory, listCategories, nameSuggestions,
  stopRecurring, updateEntry, upsertUser,
} from "./entries";

let db: DB;
let alice: number;
let bob: number;

beforeEach(() => {
  db = createDb(":memory:");
  alice = upsertUser(db, { provider: "google", providerId: "a", name: "Alice", email: "a@x.com", avatarUrl: null }).id;
  bob = upsertUser(db, { provider: "google", providerId: "b", name: "Bob", email: "b@x.com", avatarUrl: null }).id;
});

/** Helper: make an entry under a (created-if-needed) category name. */
function add(userId: number, name: string, pence: number, cat: string, date: string, opts: { recurring?: boolean } = {}) {
  const category = getOrCreateCategory(db, userId, cat);
  return createEntry(db, userId, {
    name, amount_pence: pence, category_id: category.id, date, recurring: opts.recurring ?? false,
  });
}

describe("getOrCreateCategory", () => {
  it("creates a category with a colour and returns it", () => {
    const c = getOrCreateCategory(db, alice, "Groceries");
    expect(c.id).toBeGreaterThan(0);
    expect(c.name).toBe("Groceries");
    expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("is idempotent on (user, name)", () => {
    const first = getOrCreateCategory(db, alice, "Rent");
    const again = getOrCreateCategory(db, alice, "Rent");
    expect(again.id).toBe(first.id);
    expect(listCategories(db, alice)).toHaveLength(1);
  });
  it("scopes categories per user", () => {
    getOrCreateCategory(db, alice, "Rent");
    getOrCreateCategory(db, bob, "Rent");
    expect(listCategories(db, alice)).toHaveLength(1);
    expect(listCategories(db, bob)).toHaveLength(1);
  });
  it("assigns distinct colours in creation order", () => {
    const a = getOrCreateCategory(db, alice, "A");
    const b = getOrCreateCategory(db, alice, "B");
    expect(a.color).not.toBe(b.color);
  });
});

describe("categoryTotals", () => {
  it("sums per category, largest first, colour included", () => {
    add(alice, "Tesco", 2500, "Groceries", "2026-07-02");
    add(alice, "Sainsbury", 1500, "Groceries", "2026-07-09");
    add(alice, "Rent", 95000, "Housing", "2026-07-01");

    const totals = categoryTotals(db, alice, "2026-07");
    expect(totals.map((t) => [t.name, t.total])).toEqual([["Housing", 95000], ["Groceries", 4000]]);
    expect(totals[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("ignores other users", () => {
    add(bob, "Rent", 95000, "Housing", "2026-07-01");
    expect(categoryTotals(db, alice, "2026-07")).toEqual([]);
  });
});

describe("getEntriesByMonth — one-offs", () => {
  it("filters by month and user, and joins category name/colour", () => {
    add(alice, "Rent", 95000, "Housing", "2026-07-01");
    add(alice, "Tesco", 2500, "Groceries", "2026-08-02");
    add(bob, "Bob rent", 95000, "Housing", "2026-07-01");

    const july = getEntriesByMonth(db, alice, "2026-07");
    expect(july).toHaveLength(1);
    expect(july[0].name).toBe("Rent");
    expect(july[0].category_name).toBe("Housing");
    expect(july[0].category_color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("getEntriesByMonth — recurring", () => {
  it("appears in its start month and every later month", () => {
    add(alice, "Netflix", 1099, "Subs", "2026-07-15", { recurring: true });
    expect(getEntriesByMonth(db, alice, "2026-07").map((e) => e.name)).toEqual(["Netflix"]);
    expect(getEntriesByMonth(db, alice, "2026-08").map((e) => e.name)).toEqual(["Netflix"]);
    expect(getEntriesByMonth(db, alice, "2026-12").map((e) => e.name)).toEqual(["Netflix"]);
  });
  it("does not appear before its start month", () => {
    add(alice, "Netflix", 1099, "Subs", "2026-07-15", { recurring: true });
    expect(getEntriesByMonth(db, alice, "2026-06")).toHaveLength(0);
  });
  it("is counted in every month's totals", () => {
    add(alice, "Netflix", 1099, "Subs", "2026-07-15", { recurring: true });
    expect(categoryTotals(db, alice, "2026-09")).toEqual([
      expect.objectContaining({ name: "Subs", total: 1099 }),
    ]);
  });
});

describe("stopRecurring", () => {
  it("ends an entry as of the given month (inclusive), gone the next", () => {
    const e = add(alice, "Netflix", 1099, "Subs", "2026-07-15", { recurring: true });
    expect(stopRecurring(db, alice, e.id, "2026-09")).toBe(true);
    expect(getEntriesByMonth(db, alice, "2026-09").map((x) => x.name)).toEqual(["Netflix"]);
    expect(getEntriesByMonth(db, alice, "2026-10")).toHaveLength(0);
  });
  it("refuses another user's entry", () => {
    const e = add(alice, "Netflix", 1099, "Subs", "2026-07-15", { recurring: true });
    expect(stopRecurring(db, bob, e.id, "2026-09")).toBe(false);
    expect(getEntriesByMonth(db, alice, "2026-11")).toHaveLength(1);
  });
});

describe("updateEntry", () => {
  it("updates a row the user owns and clears end_month (resumes)", () => {
    const e = add(alice, "Netflix", 1099, "Subs", "2026-07-15", { recurring: true });
    stopRecurring(db, alice, e.id, "2026-08");
    const cat = getOrCreateCategory(db, alice, "Subs");
    const updated = updateEntry(db, alice, e.id, {
      name: "Netflix", amount_pence: 1299, category_id: cat.id, date: "2026-07-15", recurring: true,
    });
    expect(updated?.amount_pence).toBe(1299);
    expect(updated?.end_month).toBeNull();
    expect(getEntriesByMonth(db, alice, "2026-10")).toHaveLength(1); // resumed
  });
  it("refuses another user's row", () => {
    const e = add(alice, "Rent", 95000, "Housing", "2026-07-01");
    const cat = getOrCreateCategory(db, bob, "Housing");
    expect(updateEntry(db, bob, e.id, {
      name: "Hijack", amount_pence: 1, category_id: cat.id, date: "2026-07-01",
    })).toBeUndefined();
  });
});

describe("createEntry validation", () => {
  it("rejects a zero amount", () => {
    const cat = getOrCreateCategory(db, alice, "Housing");
    expect(() => createEntry(db, alice, { name: "x", amount_pence: 0, category_id: cat.id, date: "2026-07-01" })).toThrow();
  });
  it("rejects a malformed date", () => {
    const cat = getOrCreateCategory(db, alice, "Housing");
    expect(() => createEntry(db, alice, { name: "x", amount_pence: 1, category_id: cat.id, date: "July" })).toThrow();
  });
});

describe("deleteEntry / deleteUser", () => {
  it("deletes a row the user owns, refuses others", () => {
    const e = add(alice, "Rent", 95000, "Housing", "2026-07-01");
    expect(deleteEntry(db, bob, e.id)).toBe(false);
    expect(deleteEntry(db, alice, e.id)).toBe(true);
    expect(countEntries(db, alice)).toBe(0);
  });
  it("cascades entries and categories on user delete", () => {
    add(alice, "Rent", 95000, "Housing", "2026-07-01");
    add(bob, "Rent", 95000, "Housing", "2026-07-01");
    deleteUser(db, alice);
    expect(countEntries(db, bob)).toBe(1);
    expect(listCategories(db, alice)).toHaveLength(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM entries").get() as { n: number }).n).toBe(1);
  });
});

describe("nameSuggestions", () => {
  it("returns the latest values per distinct name, scoped to the user", () => {
    add(alice, "Coffee", 300, "Fun", "2026-07-01");
    add(alice, "Coffee", 350, "Fun", "2026-07-20"); // later — should win
    add(bob, "Coffee", 999, "Fun", "2026-07-05");

    const s = nameSuggestions(db, alice);
    expect(s).toHaveLength(1);
    expect(s[0]).toEqual(expect.objectContaining({ name: "Coffee", amount_pence: 350, category_name: "Fun" }));
  });
});

describe("exportUser", () => {
  it("returns only that user's entries with category names", () => {
    add(alice, "Rent", 95000, "Housing", "2026-07-01");
    add(bob, "Rent", 95000, "Housing", "2026-07-01");
    const out = exportUser(db, alice);
    expect(out.entries).toHaveLength(1);
    expect((out.entries[0] as { category_name: string }).category_name).toBe("Housing");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/lib/entries.test.ts`
Expected: FAIL — missing exports (`getOrCreateCategory`, `listCategories`, `stopRecurring`, `nameSuggestions`) and type errors.

- [ ] **Step 4: Replace `src/lib/entries.ts`**

```ts
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
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/lib/entries.test.ts`
Expected: PASS. If `deleteUser`/category cascade fails, `foreign_keys = ON` was not applied in `createDb`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schema.ts src/lib/entries.ts src/lib/entries.test.ts
git commit -m "feat: per-user categories and recurrence-aware queries"
```

---

## Task 3: Server Actions — resolve categories, stop recurrence

Actions aren't unit-tested in this codebase (they need the Next request runtime); correctness is gated by `tsc` here and by e2e in Task 6.

**Files:**
- Modify: `src/lib/actions.ts`

**Interfaces:**
- Consumes: `getOrCreateCategory`, `stopRecurring`, `createEntry`, `updateEntry`, `countEntries` (Task 2); `requireUserId`, `getDb`, `toPence`, `consume`, `exceedsCap`, `ENTRY_CAP`.
- Produces:
  - `createEntryAction(prev, form): Promise<ActionResult>`
  - `updateEntryAction(prev, form): Promise<ActionResult>`
  - `deleteEntryAction(form): Promise<void>` (unchanged)
  - `deleteAccountAction(form): Promise<void>` (unchanged)
  - `stopRecurringAction(form): Promise<void>`

- [ ] **Step 1: Replace the imports and `EntrySchema`/`parse` in `src/lib/actions.ts`**

Replace the entry-import line and the `EntrySchema`/`parse` block. New import line for `@/lib/entries`:

```ts
import {
  countEntries, createEntry, deleteEntry, deleteUser, getOrCreateCategory, stopRecurring, updateEntry,
} from "@/lib/entries";
```

New schema + parser (category is now a free-form name, not an enum):

```ts
const EntrySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  amount: z.string().trim().min(1, "Amount is required"),
  category: z.string().trim().min(1, "Category is required").max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  notes: z.string().trim().max(1000).nullish(),
  payment_method: z.string().trim().max(60).nullish(),
});

function parse(form: FormData) {
  const parsed = EntrySchema.safeParse({
    name: form.get("name"),
    amount: form.get("amount"),
    category: form.get("category"),
    date: form.get("date"),
    notes: form.get("notes") || null,
    payment_method: form.get("payment_method") || null,
  });

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  let amount_pence: number;
  try {
    amount_pence = toPence(parsed.data.amount);
  } catch {
    return { ok: false as const, error: "Amount must be a number, e.g. 12.34" };
  }
  if (amount_pence <= 0) {
    return { ok: false as const, error: "Amount must be greater than zero" };
  }

  return {
    ok: true as const,
    fields: {
      name: parsed.data.name,
      amount_pence,
      category: parsed.data.category,
      date: parsed.data.date,
      notes: parsed.data.notes ?? null,
      recurring: form.get("recurring") === "on",
      payment_method: parsed.data.payment_method ?? null,
    },
  };
}
```

- [ ] **Step 2: Replace `createEntryAction` and `updateEntryAction`**

```ts
export async function createEntryAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!consume(userId)) return { ok: false, error: "Too many changes. Try again in a few minutes." };

  const parsed = parse(form);
  if (!parsed.ok) return parsed;

  const db = getDb();
  if (exceedsCap(countEntries(db, userId))) {
    return { ok: false, error: `You have reached the limit of ${ENTRY_CAP} entries.` };
  }

  const category = getOrCreateCategory(db, userId, parsed.fields.category);
  const { category: _name, ...rest } = parsed.fields;
  createEntry(db, userId, { ...rest, category_id: category.id });
  refresh();
  return { ok: true };
}

export async function updateEntryAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!consume(userId)) return { ok: false, error: "Too many changes. Try again in a few minutes." };

  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "Unknown entry" };

  const parsed = parse(form);
  if (!parsed.ok) return parsed;

  const db = getDb();
  const category = getOrCreateCategory(db, userId, parsed.fields.category);
  const { category: _name, ...rest } = parsed.fields;
  if (!updateEntry(db, userId, id, { ...rest, category_id: category.id })) {
    return { ok: false, error: "Unknown entry" };
  }

  refresh();
  return { ok: true };
}
```

- [ ] **Step 3: Append `stopRecurringAction`**

Add at the end of the file (after `deleteEntryAction`; `deleteAccountAction` stays as-is):

```ts
export async function stopRecurringAction(form: FormData): Promise<void> {
  const userId = await requireUserId();
  if (!consume(userId)) return;

  const id = Number(form.get("id"));
  const month = String(form.get("month") ?? "");
  if (Number.isInteger(id) && /^\d{4}-\d{2}$/.test(month)) {
    stopRecurring(getDb(), userId, id, month);
  }
  refresh();
}
```

- [ ] **Step 4: Run the unit suite**

Run: `npm test`
Expected: all unit tests pass. (Do **not** run `npx tsc --noEmit` yet — the UI components still reference the old category shape and won't compile until Task 5. See Global Constraints → Breaking-change sequencing.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions.ts
git commit -m "feat: actions resolve category names and stop recurrence"
```

---

## Task 4: Overview UI — dynamic categories and palette

**Files:**
- Modify: `src/app/globals.css`
- Rewrite: `src/components/SpendBar.tsx`, `src/components/SpendTable.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `CategoryTotal[]` from `categoryTotals` (Task 2), `formatGBP`, `formatGBPCompact`.
- Produces: `<SpendBar totals={CategoryTotal[]} />`, `<SpendTable totals={CategoryTotal[]} />`.

- [ ] **Step 1: Trim ordinal colour rules from `src/app/globals.css`**

Delete the three ordinal token lines in `:root`:

```css
  --cat-need: #98362c;
  --cat-want: #c9564a;
  --cat-luxury: #e8a093;
```

And delete the three data-cat rules:

```css
.bar-seg[data-cat="need"] { background: var(--cat-need); }
.bar-seg[data-cat="want"] { background: var(--cat-want); }
.bar-seg[data-cat="luxury"] { background: var(--cat-luxury); }
```

Colours are now applied inline from each category's stored hex.

- [ ] **Step 2: Rewrite `src/components/SpendBar.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { CategoryTotal } from "@/lib/entries";
import { formatGBP, formatGBPCompact } from "@/lib/money";

export function SpendBar({ totals }: { totals: CategoryTotal[] }) {
  const [active, setActive] = useState<number | null>(null);

  const total = totals.reduce((sum, t) => sum + t.total, 0);
  if (total === 0) {
    return <div className="bar-empty">No spending recorded this month</div>;
  }

  const pct = (value: number) => Math.round((value / total) * 100);

  return (
    <>
      <div className="bar">
        {totals.map((t) => (
          <button
            key={t.id}
            type="button"
            className="bar-seg"
            style={{ flexGrow: t.total, background: t.color }}
            onMouseEnter={() => setActive(t.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(t.id)}
            onBlur={() => setActive(null)}
            aria-label={`${t.name}: ${formatGBP(t.total)}, ${pct(t.total)}%`}
          >
            {active === t.id && (
              <span className="tip mono">
                {t.name} · {formatGBP(t.total)} · {pct(t.total)}%
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bar-axis">
        <span>£0</span>
        <span>{formatGBPCompact(Math.round(total / 2))}</span>
        <span>{formatGBPCompact(total)}</span>
      </div>

      <div className="legend">
        {totals.map((t) => (
          <div className="legend-row" key={t.id}>
            <span className="legend-sw" style={{ background: t.color }} />
            <span className="legend-name">{t.name}</span>
            <span className="fig">{formatGBP(t.total)}</span>
            <span className="legend-pct mono">{pct(t.total)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Rewrite `src/components/SpendTable.tsx`**

```tsx
import type { CategoryTotal } from "@/lib/entries";
import { formatGBP } from "@/lib/money";

export function SpendTable({ totals }: { totals: CategoryTotal[] }) {
  const total = totals.reduce((sum, t) => sum + t.total, 0);

  return (
    <details className="table-toggle">
      <summary>View as table</summary>
      <table className="data-table">
        <caption className="sr-only">Spending by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col" className="num">Share</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.id}>
              <th scope="row">{t.name}</th>
              <td className="num">{formatGBP(t.total)}</td>
              <td className="num">{total === 0 ? "—" : `${Math.round((t.total / total) * 100)}%`}</td>
            </tr>
          ))}
          {totals.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: "var(--faint)" }}>No spending recorded</td>
            </tr>
          )}
        </tbody>
      </table>
    </details>
  );
}
```

- [ ] **Step 4: Update `src/app/page.tsx`**

Replace the imports of `CATEGORIES, categoryTotals` with just `categoryTotals`, compute `total` from the list, and drop the discretionary paragraph. Full file:

```tsx
import Link from "next/link";
import { MonthNav } from "@/components/MonthNav";
import { SpendBar } from "@/components/SpendBar";
import { SpendTable } from "@/components/SpendTable";
import { BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import { categoryTotals } from "@/lib/entries";
import { formatGBP } from "@/lib/money";
import { resolveMonth } from "@/lib/months";
import { requireUserId } from "@/lib/session";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const month = resolveMonth((await searchParams).month);

  const totals = categoryTotals(getDb(), userId, month);
  const total = totals.reduce((sum, t) => sum + t.total, 0);

  return (
    <main className="col" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <strong className="mono">{BRAND.name}</strong>
        <MonthNav month={month} />
      </header>

      <p className="label">Total out</p>
      <p className="hero">{formatGBP(total)}</p>

      <section style={{ marginTop: 32 }}>
        <SpendBar totals={totals} />
        <SpendTable totals={totals} />
      </section>

      <p style={{ marginTop: 40, display: "flex", gap: 12 }}>
        <Link href={`/entries?month=${month}`} className="btn">View entries</Link>
        <Link href="/account" className="btn">Account</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Run the unit suite**

Run: `npm test`
Expected: unit tests pass. (Full `tsc`/`build` is still deferred to Task 5 — `EntryRow`/`EntryDialog`/`entries/page.tsx` continue to reference the old category shape until then.)

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/SpendBar.tsx src/components/SpendTable.tsx src/app/page.tsx
git commit -m "feat: N-category overview with stored per-category colours"
```

---

## Task 5: Entry form, autocomplete, recurring UX

**Files:**
- Modify: `src/app/globals.css` (append `.entry-tag`, `.dialog-note`)
- Rewrite: `src/components/EntryDialog.tsx`, `src/components/EntryRow.tsx`
- Modify: `src/app/entries/page.tsx`

**Interfaces:**
- Consumes: `listCategories`, `nameSuggestions`, `getEntriesByMonth` (Task 2); `createEntryAction`, `updateEntryAction`, `deleteEntryAction`, `stopRecurringAction` (Task 3); types `Category`, `Suggestion`, `EntryWithCategory`.
- Produces: `<EntryDialog entry month categories suggestions />`, `<EntryRow entry month categories suggestions />`.

- [ ] **Step 1: Append styles to `src/app/globals.css`**

```css
.entry-tag {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--muted);
  border: 1px solid var(--line-strong); border-radius: 4px; padding: 1px 5px;
}
.dialog-note { color: var(--faint); font-size: 12px; margin-bottom: 12px; }
```

- [ ] **Step 2: Rewrite `src/components/EntryDialog.tsx`**

`useId` gives each dialog instance unique datalist ids (many dialogs share the page). Prefill fires on exact name match, writing into the uncontrolled inputs via the form ref.

```tsx
"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { ActionResult } from "@/lib/action-types";
import type { Category, EntryWithCategory, Suggestion } from "@/lib/entries";
import { createEntryAction, updateEntryAction } from "@/lib/actions";

export function EntryDialog({
  entry,
  month,
  categories,
  suggestions,
}: {
  entry: EntryWithCategory | null;
  month: string;
  categories: Category[];
  suggestions: Suggestion[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const action = entry ? updateEntryAction : createEntryAction;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  function prefillFromName(value: string) {
    const match = suggestions.find((s) => s.name === value);
    const form = formRef.current;
    if (!match || !form) return;
    (form.elements.namedItem("amount") as HTMLInputElement).value = (match.amount_pence / 100).toFixed(2);
    (form.elements.namedItem("category") as HTMLInputElement).value = match.category_name;
    (form.elements.namedItem("payment_method") as HTMLInputElement).value = match.payment_method ?? "";
  }

  return (
    <>
      <button className={entry ? "btn" : "btn btn-primary"} onClick={() => ref.current?.showModal()}>
        {entry ? "Edit" : "Add entry"}
      </button>

      <dialog ref={ref}>
        <form action={formAction} ref={formRef}>
          {entry && <input type="hidden" name="id" value={entry.id} />}

          {state && !state.ok && <p className="form-error" role="alert">{state.error}</p>}
          {entry?.recurring === 1 && <p className="dialog-note">Changes apply to every month.</p>}

          <label>Name
            <input name="name" list={`names-${uid}`} defaultValue={entry?.name ?? ""} required maxLength={120}
              onInput={(e) => prefillFromName(e.currentTarget.value)} />
          </label>
          <datalist id={`names-${uid}`}>
            {suggestions.map((s) => <option key={s.name} value={s.name} />)}
          </datalist>

          <label>Amount (£)
            <input name="amount" inputMode="decimal" required
              defaultValue={entry ? (entry.amount_pence / 100).toFixed(2) : ""} />
          </label>

          <label>Category
            <input name="category" list={`cats-${uid}`} required maxLength={60}
              defaultValue={entry?.category_name ?? ""} placeholder="e.g. Groceries" />
          </label>
          <datalist id={`cats-${uid}`}>
            {categories.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>

          <label>Date
            <input type="date" name="date" required defaultValue={entry?.date ?? `${month}-01`} />
          </label>

          <label>Payment method
            <input name="payment_method" defaultValue={entry?.payment_method ?? ""} maxLength={60} />
          </label>

          <label>Notes
            <textarea name="notes" rows={2} maxLength={1000} defaultValue={entry?.notes ?? ""} />
          </label>

          <label>
            <input type="checkbox" name="recurring" defaultChecked={entry?.recurring === 1} />
            Recurs monthly
          </label>

          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

- [ ] **Step 3: Rewrite `src/components/EntryRow.tsx`**

Colour dot from the stored category colour; recurring rows show a "monthly" tag instead of a day; ongoing recurring rows get an "End" control.

```tsx
import { deleteEntryAction, stopRecurringAction } from "@/lib/actions";
import { EntryDialog } from "@/components/EntryDialog";
import type { Category, EntryWithCategory, Suggestion } from "@/lib/entries";
import { formatGBP } from "@/lib/money";

export function EntryRow({
  entry,
  month,
  categories,
  suggestions,
}: {
  entry: EntryWithCategory;
  month: string;
  categories: Category[];
  suggestions: Suggestion[];
}) {
  const day = new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short",
  });

  return (
    <li className="entry">
      <span className="entry-dot" style={{ background: entry.category_color }} />
      <span className="entry-name">
        {entry.name}
        <span className="label" style={{ marginLeft: 8 }}>{entry.category_name}</span>
      </span>

      {entry.recurring === 1
        ? <span className="entry-tag">monthly</span>
        : <span className="entry-date">{day}</span>}

      <span className="entry-amt">{formatGBP(entry.amount_pence)}</span>

      {entry.recurring === 1 && entry.end_month === null && (
        <form action={stopRecurringAction}>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="month" value={month} />
          <button type="submit" className="btn" aria-label={`End recurrence for ${entry.name}`}>End</button>
        </form>
      )}

      <EntryDialog entry={entry} month={month} categories={categories} suggestions={suggestions} />

      <form action={deleteEntryAction}>
        <input type="hidden" name="id" value={entry.id} />
        <button type="submit" className="btn btn-danger" aria-label={`Delete ${entry.name}`}>
          <span aria-hidden="true">✕</span> Delete
        </button>
      </form>
    </li>
  );
}
```

- [ ] **Step 4: Update `src/app/entries/page.tsx`**

Preload categories + suggestions and thread them through. Full file:

```tsx
import Link from "next/link";
import { EntryDialog } from "@/components/EntryDialog";
import { EntryRow } from "@/components/EntryRow";
import { MonthNav } from "@/components/MonthNav";
import { getDb } from "@/lib/db";
import { getEntriesByMonth, listCategories, nameSuggestions } from "@/lib/entries";
import { resolveMonth } from "@/lib/months";
import { requireUserId } from "@/lib/session";

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const month = resolveMonth((await searchParams).month);

  const db = getDb();
  const entries = getEntriesByMonth(db, userId, month);
  const categories = listCategories(db, userId);
  const suggestions = nameSuggestions(db, userId);

  return (
    <main className="col" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <Link href={`/?month=${month}`} className="mono">← Overview</Link>
        <MonthNav month={month} basePath="/entries" />
      </header>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p className="label">{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
        <EntryDialog entry={null} month={month} categories={categories} suggestions={suggestions} />
      </div>

      {entries.length === 0 ? (
        <p style={{ color: "var(--faint)", padding: "36px 0" }}>Nothing recorded this month.</p>
      ) : (
        <ul style={{ listStyle: "none" }}>
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} month={month} categories={categories} suggestions={suggestions} />
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds; `/entries` listed as a route.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/EntryDialog.tsx src/components/EntryRow.tsx src/app/entries/page.tsx
git commit -m "feat: category autocomplete, name prefill and recurring controls"
```

---

## Task 6: End-to-end tests

Updates the category-based assertions (categories are now typed text, not a `<select>`) and adds coverage for custom categories, autocomplete prefill, and recurrence. A stale `data/dev.db` from earlier manual testing has the old schema — delete it so a future manual `npm run dev` recreates it; Playwright uses its own fresh `.e2e.db`.

**Files:**
- Modify: `tests/spendly.spec.ts`

**Interfaces:**
- Consumes: the running app with `TEST_AUTH_BYPASS=1` (unchanged harness).
- Produces: `npm run test:e2e` green.

- [ ] **Step 1: Delete the stale local dev database**

```bash
rm -f data/dev.db data/dev.db-shm data/dev.db-wal
```

- [ ] **Step 2: Update the existing category-based tests**

In `tests/spendly.spec.ts`, replace the three tests below (the category `<select>` is now a text input; category names are free-form; the "% discretionary" line is gone; and the invalid-amount test must supply a category so validation reaches the amount check).

Replace `create, edit and delete an entry`:

```ts
test("create, edit and delete an entry", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);

  await page.getByRole("button", { name: "Add entry" }).click();
  const add = page.locator("dialog[open]");
  await add.getByLabel("Name").fill("Rent");
  await add.getByLabel("Amount (£)").fill("950.00");
  await add.getByLabel("Category").fill("Housing");
  await add.getByLabel("Date").fill(`${month}-01`);
  await add.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Rent")).toBeVisible();
  await expect(page.getByText("£950.00")).toBeVisible();

  await page.goto(`/?month=${month}`);
  await expect(page.locator(".hero")).toHaveText("£950.00");
  await expect(page.getByRole("button", { name: /^Housing:/ })).toBeVisible();

  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.locator("dialog[open]");
  await edit.getByLabel("Amount (£)").fill("960.00");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("£960.00")).toBeVisible();

  await page.getByRole("button", { name: "Delete Rent" }).click();
  await expect(page.getByText("Nothing recorded this month.")).toBeVisible();
});
```

Replace `an invalid amount keeps the dialog open and explains why`:

```ts
test("an invalid amount keeps the dialog open and explains why", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  const form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Nonsense");
  await form.getByLabel("Amount (£)").fill("abc");
  await form.getByLabel("Category").fill("Misc");
  await form.getByLabel("Date").fill(`${month}-01`);
  await form.getByRole("button", { name: "Save" }).click();

  await expect(form.getByRole("alert")).toContainText("Amount must be a number");
  await expect(page.getByRole("dialog")).toBeVisible();
});
```

Replace `the chart tooltip is reachable by keyboard` and `the table view carries the same numbers as the bar` (use a typed category "Treats" instead of the old `luxury` option):

```ts
test("the chart tooltip is reachable by keyboard", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  const form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Trainers");
  await form.getByLabel("Amount (£)").fill("130.00");
  await form.getByLabel("Category").fill("Treats");
  await form.getByLabel("Date").fill(`${month}-06`);
  await form.getByRole("button", { name: "Save" }).click();

  await page.goto(`/?month=${month}`);
  await page.getByRole("button", { name: /^Treats:/ }).focus();
  await expect(page.locator(".tip")).toContainText("Treats");
});

test("the table view carries the same numbers as the bar", async ({ page }) => {
  await page.goto(`/?month=${month}`);
  await page.getByText("View as table").click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row", { name: /Treats/ })).toContainText("£130.00");
});
```

Also update `one user cannot see another user's entries` to supply a category:

```ts
test("one user cannot see another user's entries", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  const form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Alice private");
  await form.getByLabel("Amount (£)").fill("10.00");
  await form.getByLabel("Category").fill("Secret");
  await form.getByLabel("Date").fill(`${month}-01`);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Alice private")).toBeVisible();

  await page.goto("/test-login?who=bob");
  await page.goto(`/entries?month=${month}`);
  await expect(page.getByText("Alice private")).toHaveCount(0);
  await expect(page.getByText("Nothing recorded this month.")).toBeVisible();
});
```

- [ ] **Step 3: Add the new feature tests**

Append to `tests/spendly.spec.ts`. `nextMonth` is derived without importing app code (the suite is standalone). Uses `who=cat` so it starts from a clean per-user dataset within the shared serial DB.

```ts
const nextMonth = (() => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m is 1-based; Date month is 0-based → next month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
})();

test("autocomplete prefills a repeat entry", async ({ page }) => {
  await page.goto("/test-login?who=cat");
  await page.goto(`/entries?month=${month}`);

  // First occurrence establishes the suggestion.
  await page.getByRole("button", { name: "Add entry" }).click();
  let form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Coffee");
  await form.getByLabel("Amount (£)").fill("3.20");
  await form.getByLabel("Category").fill("Fun");
  await form.getByLabel("Date").fill(`${month}-02`);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Coffee")).toBeVisible();

  // Typing the same name prefills amount + category.
  await page.getByRole("button", { name: "Add entry" }).click();
  form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Coffee");
  await expect(form.getByLabel("Amount (£)")).toHaveValue("3.20");
  await expect(form.getByLabel("Category")).toHaveValue("Fun");
});

test("a recurring expense appears in the next month and can be ended", async ({ page }) => {
  await page.goto("/test-login?who=cat");
  await page.goto(`/entries?month=${month}`);

  await page.getByRole("button", { name: "Add entry" }).click();
  const form = page.locator("dialog[open]");
  await form.getByLabel("Name").fill("Netflix");
  await form.getByLabel("Amount (£)").fill("10.99");
  await form.getByLabel("Category").fill("Subs");
  await form.getByLabel("Date").fill(`${month}-15`);
  await form.getByRole("checkbox", { name: "Recurs monthly" }).check();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Netflix")).toBeVisible();

  // Shows next month too.
  await page.goto(`/entries?month=${nextMonth}`);
  await expect(page.getByText("Netflix")).toBeVisible();
  await expect(page.getByText("monthly")).toBeVisible();

  // End it as of next month → gone from the month after.
  await page.getByRole("button", { name: "End recurrence for Netflix" }).click();
  const [y, m] = nextMonth.split("-").map(Number);
  const after = new Date(Date.UTC(y, m, 1));
  const afterMonth = `${after.getUTCFullYear()}-${String(after.getUTCMonth() + 1).padStart(2, "0")}`;
  await expect(page.getByText("Netflix")).toBeVisible(); // still in the ended month
  await page.goto(`/entries?month=${afterMonth}`);
  await expect(page.getByText("Netflix")).toHaveCount(0);
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `rm -f .e2e.db .e2e.db-shm .e2e.db-wal && npm run test:e2e`
Expected: PASS — all updated + new tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/spendly.spec.ts
git commit -m "test: e2e for custom categories, autocomplete and recurrence"
```

---

## Appendix: What was deliberately left out (v1)

Category rename / recolour / merge / delete UI; per-month recurring overrides; "group small categories into Other"; a live/debounced autocomplete endpoint; a colour-previewing custom combobox. See the spec's "Out of scope" section.
