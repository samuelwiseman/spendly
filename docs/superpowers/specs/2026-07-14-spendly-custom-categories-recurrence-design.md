# Spendly — Custom Categories, Autocomplete & Real Recurrence — Design

**Date:** 2026-07-14
**Status:** Approved design, ready for implementation plan
**Branch context:** builds on `feat/nextjs-overhaul` (Next.js App Router, SQLite via `better-sqlite3`, Server Actions, money stored as integer pence).

## Summary

Three interlocking changes to the entry/overview model:

1. **User-defined categories** — replace the fixed `need / want / luxury` ordinal scale with free-form, per-user categories created on-the-fly and auto-coloured from a categorical palette. The overview's bar, legend and table become N-category.
2. **Name + category autocomplete** — typing an entry name suggests names used before and prefills amount, category and payment method from the most recent matching entry. The category field autocompletes from existing categories.
3. **Real monthly recurrence** — the `recurring` flag stops being cosmetic. A recurring expense is stored once and appears in every month's totals and entries list from its start month until stopped.

Because the app has **no production data yet**, this is a clean `schema.ts` change with **no migration**.

## Motivation

The `need / want / luxury` scale doesn't fit how the user actually categorises spending; they want their own buckets (e.g. Rent, Subscriptions, Groceries, Fun). Two features surfaced alongside it: reusing prior entries via autocomplete, and making "recurring" actually recur.

## Design decisions (settled)

| Decision | Choice |
|---|---|
| Category creation | On-the-fly: typing a new name on an entry creates the category and auto-assigns a colour. Optional rename/recolour/merge is **future**, not v1. |
| Category colours | Categorical (qualitative) palette, dark-mode validated, assigned in creation order and **stored per category** so colour is stable month to month. |
| `% discretionary` hero line | **Retired** (no ordered scale). Hero stays "Total out £X". |
| Recurrence semantics | From start month **forward until stopped**; one row, no duplication; **no per-month overrides** in v1. |
| Autocomplete transport | Preloaded suggestions passed from the entries page into the dialog (plain Server Component read). No live/debounced endpoint. |
| Prefill behaviour | Selecting a known name fills amount/category/payment method, **overwriting** current values; user can edit before saving. |
| Category field control | Native `<datalist>` (accessible, keyboard-friendly). Colour-previewing combobox is future polish. |
| "More categories than palette colours" | Colours **cycle**; legend + table disambiguate by name; recolour is the future escape hatch. No "group small into Other" in v1. |

## Data model

### New table: `categories`

One set of categories per user.

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL | `REFERENCES users(id) ON DELETE CASCADE` |
| `name` | TEXT NOT NULL | `UNIQUE(user_id, name)` |
| `color` | TEXT NOT NULL | hex, from the categorical palette |
| `sort_order` | INTEGER NOT NULL | stable ordering for a future manage screen (overview sorts by amount) |
| `created_at` | TEXT NOT NULL DEFAULT (datetime('now')) | |

`UNIQUE(user_id, name)` makes "create if not exists" idempotent and enforces isolation.

### Changes to `entries`

- Replace `category TEXT CHECK(category IN ('need','want','luxury'))` with **`category_id INTEGER NOT NULL REFERENCES categories(id)`**.
- Add **`end_month TEXT`** (nullable, `YYYY-MM`, `GLOB '????-??'` when set) — the last month a recurring entry applies; `NULL` = ongoing.
- `recurring INTEGER NOT NULL DEFAULT 0 CHECK(recurring IN (0,1))` stays.
- `date` (`YYYY-MM-DD`) keeps its meaning: for one-offs it's the expense date; **for recurring entries its month is the start month** (the day component is retained but not shown across later months).
- `amount_pence`, `name`, `notes`, `payment_method`, `created_at`, `updated_at` unchanged.

Deleting a category while entries reference it is blocked by the FK; safe merge/reassign is a **future** concern (v1 has no delete-category UI).

### Month resolution query

For month `M`, an entry is included when:

```
(recurring = 0 AND substr(date,1,7) = M)
OR
(recurring = 1 AND substr(date,1,7) <= M AND (end_month IS NULL OR end_month >= M))
```

Both `getEntriesByMonth` and `categoryTotals` use this predicate. `categoryTotals` joins `categories` and groups by `category_id`, returning a **dynamic list** of `{ id, name, color, total }` sorted by total descending — replacing the fixed `Record<'need'|'want'|'luxury', number>`.

## Components & data flow

### `lib/entries.ts` (the only SQL writer)

New/changed functions (each still takes explicit `db` + `userId`):

- `listCategories(db, userId): Category[]` — `{ id, name, color, sort_order }`, ordered by `sort_order`.
- `getOrCreateCategory(db, userId, name): Category` — idempotent on `(user_id, name)`; on insert, assigns the next palette colour and `sort_order`.
- `getEntriesByMonth(db, userId, month)` — updated predicate above; joins category name/colour for display.
- `categoryTotals(db, userId, month): CategoryTotal[]` — dynamic list, sorted by total desc.
- `nameSuggestions(db, userId): Suggestion[]` — distinct entry names with the most recent `{ amount_pence, category name, payment_method }`.
- `createEntry` / `updateEntry` — take a resolved `category_id` and optional `end_month`.
- `stopRecurring(db, userId, id, month): boolean` — sets `end_month = month` for a recurring entry the user owns.

### `lib/palette.ts` (new, pure)

Ordered array of ~8 dark-mode-validated categorical hex colours + `nextColor(usedCount)`. Validated with the dataviz palette validator at implementation time. Replaces the `--cat-need/want/luxury` tokens in `globals.css`.

### `lib/actions.ts` (Server Actions)

- `createEntryAction` / `updateEntryAction` — resolve category name → `getOrCreateCategory`, then write. Same order as today: authenticate → rate-limit → validate → cap → write.
- `stopRecurringAction(form)` — authenticate → rate-limit → `stopRecurring`.
- Validation: category name required, trimmed, max length; `recurring` from checkbox; `end_month` never set directly by the create/update form (only by stop).

### Overview (`app/page.tsx`, `SpendBar`, `SpendTable`)

- Hero: "Total out £X" only.
- `SpendBar`: N segments, largest-first, category colours, focusable buttons + per-segment `aria-label` (a11y model unchanged).
- Legend + `SpendTable`: dynamic rows (swatch · name · £ · %). Empty-month state unchanged.

### Entry dialog (`EntryDialog`) & entries page

- Category `<select>` → text input + `<datalist>` of existing category names.
- Name input gains a `<datalist>` of prior names; selecting a known name prefills amount/category/payment method (overwrite; editable).
- Entries page preloads `listCategories` + `nameSuggestions` and passes them to the dialog.
- Recurring rows render a **"monthly" tag** instead of a day-of-month; the dialog notes that edits apply to every month.
- `EntryRow` gains an **"End recurrence"** control (visible only for ongoing recurring entries) posting to `stopRecurringAction` with the viewed month.

## Testing

- **Unit (`entries.test.ts`, extended):** category create-idempotency and per-user isolation; `categoryTotals` dynamic output; the month-resolution predicate for recurring across start/within/after/stopped boundaries; `stopRecurring` ownership + effect; `nameSuggestions` returns latest values per name and never leaks across users.
- **Unit (`palette.test.ts`):** colour assignment cycles past palette length; deterministic order.
- **E2E (Playwright, extended):** create an entry with a new category (appears in bar with a colour); a second entry reusing the category; name autocomplete prefills a repeat entry; mark an expense recurring and confirm it appears in the next month; "End recurrence" removes it from the following month but not the current one.
- TDD throughout; money stays integer pence; `TZ=Europe/London`; commit per green cycle.

## Out of scope (v1)

- Category rename / recolour / merge / delete UI.
- Per-month recurring overrides (edit or skip a single month's instance).
- "Group small categories into Other" in the bar.
- Live/debounced autocomplete endpoint.
- Colour-previewing custom combobox.
