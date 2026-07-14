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
