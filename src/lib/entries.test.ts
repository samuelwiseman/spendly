import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type DB } from "./db";
import {
  categoryTotals, countEntries, createEntry, deleteEntry, deleteUser,
  exportUser, getEntriesByMonth, updateEntry, upsertUser,
} from "./entries";

let db: DB;
let alice: number;
let bob: number;

const base = { name: "Rent", amount_pence: 95000, category: "need" as const, date: "2026-07-01" };

const countUsers = () => (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;

beforeEach(() => {
  db = createDb(":memory:");
  alice = upsertUser(db, { provider: "google", providerId: "a", name: "Alice", email: "a@x.com", avatarUrl: null }).id;
  bob = upsertUser(db, { provider: "google", providerId: "b", name: "Bob", email: "b@x.com", avatarUrl: null }).id;
});

describe("upsertUser", () => {
  it("is idempotent on (provider, provider_id)", () => {
    const again = upsertUser(db, { provider: "google", providerId: "a", name: "Alice B", email: "a@x.com", avatarUrl: null });
    expect(again.id).toBe(alice);
    expect(countUsers()).toBe(2);
  });
});

describe("createEntry", () => {
  it("returns the created row", () => {
    const entry = createEntry(db, alice, base);
    expect(entry.id).toBeGreaterThan(0);
    expect(entry.amount_pence).toBe(95000);
    expect(entry.recurring).toBe(0);
  });
  it("rejects a zero amount", () => {
    expect(() => createEntry(db, alice, { ...base, amount_pence: 0 })).toThrow();
  });
  it("rejects a negative amount", () => {
    expect(() => createEntry(db, alice, { ...base, amount_pence: -1 })).toThrow();
  });
  it("rejects an unknown category", () => {
    expect(() => createEntry(db, alice, { ...base, category: "vice" as never })).toThrow();
  });
  it("rejects a malformed date", () => {
    expect(() => createEntry(db, alice, { ...base, date: "July" })).toThrow();
  });
});

describe("getEntriesByMonth", () => {
  it("filters by month and by user", () => {
    createEntry(db, alice, base);
    createEntry(db, alice, { ...base, name: "Tesco", date: "2026-08-02" });
    createEntry(db, bob, { ...base, name: "Bob rent" });

    const july = getEntriesByMonth(db, alice, "2026-07");
    expect(july).toHaveLength(1);
    expect(july[0].name).toBe("Rent");
  });
});

describe("categoryTotals", () => {
  it("sums per category and zero-fills the rest", () => {
    createEntry(db, alice, base);
    createEntry(db, alice, { ...base, name: "Pub", amount_pence: 2500, category: "want" });
    createEntry(db, alice, { ...base, name: "Pub2", amount_pence: 1500, category: "want" });

    expect(categoryTotals(db, alice, "2026-07")).toEqual({ need: 95000, want: 4000, luxury: 0 });
  });
  it("ignores other users", () => {
    createEntry(db, bob, base);
    expect(categoryTotals(db, alice, "2026-07")).toEqual({ need: 0, want: 0, luxury: 0 });
  });
});

describe("updateEntry", () => {
  it("updates a row the user owns", () => {
    const entry = createEntry(db, alice, base);
    const updated = updateEntry(db, alice, entry.id, { ...base, amount_pence: 96000 });
    expect(updated?.amount_pence).toBe(96000);
  });
  it("refuses to update another user's row", () => {
    const entry = createEntry(db, alice, base);
    expect(updateEntry(db, bob, entry.id, { ...base, name: "Hijacked" })).toBeUndefined();
    expect(getEntriesByMonth(db, alice, "2026-07")[0].name).toBe("Rent");
  });
});

describe("deleteEntry", () => {
  it("deletes a row the user owns", () => {
    const entry = createEntry(db, alice, base);
    expect(deleteEntry(db, alice, entry.id)).toBe(true);
    expect(countEntries(db, alice)).toBe(0);
  });
  it("refuses to delete another user's row", () => {
    const entry = createEntry(db, alice, base);
    expect(deleteEntry(db, bob, entry.id)).toBe(false);
    expect(countEntries(db, alice)).toBe(1);
  });
});

describe("deleteUser", () => {
  it("cascades to that user's entries and leaves others alone", () => {
    createEntry(db, alice, base);
    createEntry(db, bob, base);
    deleteUser(db, alice);
    expect(countEntries(db, bob)).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM entries").get() as { n: number }).n).toBe(1);
  });
});

describe("exportUser", () => {
  it("returns only that user's entries", () => {
    createEntry(db, alice, base);
    createEntry(db, bob, base);
    expect(exportUser(db, alice).entries).toHaveLength(1);
  });
});
