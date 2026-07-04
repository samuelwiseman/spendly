# Spendly — Next.js Overhaul & Self-Host Migration

**Date:** 2026-07-04
**Supersedes:** `2026-03-25-spend-tracker-design.md` (Fastify + vanilla JS)
**Stack:** Next.js 16 (App Router), React 19, TypeScript, `motion`, SQLite (`better-sqlite3`), Auth.js v5

---

## Overview

Rebuild Spendly as a full-stack Next.js application and migrate it off Railway onto the
Ubuntu server that already hosts `samuelwiseman.com`. The feature set is unchanged: sign in
with Google, log spend entries categorised as Need / Want / Luxury, review a monthly
overview and a filterable entries list.

Two things change materially: the application gets a designed dark UI in place of the
current unstyled prototype, and the overview's donut chart is replaced with a form that can
actually be read.

### Goals

- Feature parity with the existing app, no regressions.
- A visual identity that is recognisably by the same hand as `samuelwiseman.com`, without
  borrowing its git metaphor.
- Self-hosted alongside the personal site, deployed the same way, with the database
  surviving rebuilds.
- Correct handling of money and of other people's data.

### Non-goals

Budgets, month-over-month trends, CSV import/export, multi-currency, a light theme, and
anything resembling a native app. All deliberately deferred. Currency is GBP.

---

## Design

### Direction

The brief settled on **sibling, not twin**. Spendly shares its palette DNA, its
mono-for-metadata rule, its hairline rules and its no-shadow discipline with
`samuelwiseman.com`, but inverts the paper: where the site is ink on cream, Spendly is
cream on ink. It is denser and more data-forward — a tool, not an essay — and carries none
of the site's git-commit metaphor, which does not survive contact with a supermarket
receipt.

Dark is the only theme in v1. A light theme is a separate palette that must be selected and
validated against a light surface, not derived by flipping this one.

### Tokens

| Role | Hex |
|---|---|
| Page surface | `#16150f` |
| Raised surface | `#1d1b14` |
| Hairline | `#2c2a20` |
| Hairline, strong | `#3a3830` |
| Body text | `#eae8dc` |
| Strong text | `#fdfcf5` |
| Muted text | `#8d8a76` |
| Faint text | `#5f5d50` |
| Status: critical | `#d03b3b` |
| Status: good | `#0ca30c` |

Sans for prose. Mono for every figure, label and piece of metadata, always with
`font-variant-numeric: tabular-nums` so columns of money align.

**Accent inversion.** The category ramp is terracotta, and the site's brand accent is also
red. If links, buttons and focus rings were red they would be the same hue as the data. So
interactive accent inverts instead: primary buttons are cream on ink, focus rings are cream
(`2px`, `3px` offset). Red is reserved for the chart. Destructive delete uses the status
critical `#d03b3b` paired with an icon and a text label, never colour alone.

### Charts

**Need → Want → Luxury is an ordered scale, not three arbitrary identities.** It therefore
gets a single-hue **ordinal ramp** rather than three unrelated colours. Brighter means more
discretionary, so the bright end of any mark reads directly as "money I didn't have to
spend".

| Category | Hex | Contrast vs `#16150f` |
|---|---|---|
| Need | `#98362c` | 2.52:1 |
| Want | `#c9564a` | — |
| Luxury | `#e8a093` | — |

Validated with `dataviz/scripts/validate_palette.js --mode dark --surface "#16150f" --ordinal`:
lightness monotone, adjacent ΔL gaps ≥ 0.06, light-end contrast clears the 2:1 ordinal
floor, hue spread 1°. An earlier candidate (`#7d2b24`) failed the contrast floor at 1.95:1
and was corrected. **Re-run the validator if any of these hexes change.**

**The donut is removed.** Angle is the least accurately-read visual channel and hollowing
the centre discards area as a cue, so the donut forced readers into the legend — meaning the
chart was decoration. Part-to-whole is replaced by a **horizontal stacked bar**: position
along a common axis, the channel read most precisely. It also stacks cleanly into a
month-over-month view if trends are ever added.

Mark specs: `2px` surface-coloured gap between segments, `4px` rounded outer ends, a
per-segment hover tooltip, direct labels on all three segments, and a recessive axis. A
legend is always present (three series), and a keyboard-reachable table view of the same
numbers exists — so category is never communicated by colour alone.

The month total is a hero figure (≥ 48px). It deviates from the usual "hero figures are
sans" convention deliberately: this design system sets *all* figures in mono, and an
exception for the largest number on the page would break the column alignment it exists to
create.

Motion uses `motion`, matching the site. Reduced-motion is handled through CSS overrides,
not conditional rendering — conditional rendering is what caused the hydration mismatch
`samuelwiseman.com` had to fix in `9388d40`.

---

## Architecture

Server Components read SQLite directly; Server Actions mutate it. **The `/api/entries` REST
layer is deleted** — it exists today only so `public/js/api.js` has something to `fetch`,
and in the App Router that indirection has no purpose. The selected month becomes a URL
search param (`/?month=2026-07`), so the overview server-renders, deep-links, and survives a
refresh without client-side state.

Client Components appear only where there is genuine interactivity: the entry dialog, the
month navigation, and the chart tooltip.

```
src/
  app/
    layout.tsx
    globals.css
    page.tsx                      # Overview — reads searchParams.month
    entries/page.tsx              # Filterable entries list
    login/page.tsx
    health/route.ts               # returns "ok", for uptime checks
    api/auth/[...nextauth]/route.ts
  components/
    SpendBar.tsx                  # stacked bar + tooltip (client)
    SpendTable.tsx                # accessible table view of the same data
    EntryDialog.tsx               # create / edit (client)
    EntryRow.tsx
    MonthNav.tsx
  lib/
    db.ts                         # better-sqlite3 singleton
    entries.ts                    # query helpers (ported from db/db.js)
    actions.ts                    # Server Actions + zod validation
    auth.ts                       # Auth.js config
    money.ts                      # pence <-> GBP formatting
    brand.ts                      # single source for app name + domain
```

`brand.ts` exists so the eventual rename away from "Spendly" is a one-line change rather
than a grep. The name is used, never hardcoded.

### Units of isolation

- `lib/money.ts` — pure. Knows pence and formatting, nothing else. Trivially testable.
- `lib/entries.ts` — the only module that writes SQL. Takes a `userId` on every call; there
  is no query that can accidentally cross users.
- `lib/actions.ts` — validation, authorisation, rate limiting. Calls `entries.ts`. Never
  builds SQL itself.
- `components/SpendBar.tsx` — takes computed totals, renders. Does no arithmetic on money.

---

## Data model

Two changes, both free because there is no production data to migrate.

**`amount REAL` → `amount_pence INTEGER`.** Money in a binary float is a latent bug:
`0.1 + 0.2 !== 0.3`, and summing a month of entries drifts in the last penny. Store integer
minor units, format at the edge.

**Referential integrity.** `entries.user_id` currently references `users(id)` with no
`ON DELETE` behaviour, orphaning rows when a user is removed — which the account-deletion
requirement below makes load-bearing.

```sql
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
```

The index matches the only access pattern the app has: filter by user, filter by month
prefix on `date`, order by `date`.

---

## Auth

**Auth.js v5** (`next-auth@5`) with the Google provider and a JWT session strategy. Scopes
are `openid`, `email`, `profile` — all non-sensitive.

A `signIn` callback upserts into the existing `users` table using the current
`(provider, provider_id)` unique constraint; a `session` callback attaches the local
`users.id` to the session so `entries.user_id` keeps its meaning. The `users` table is
owned by the app, not by an Auth.js adapter.

This replaces the hand-rolled `@fastify/oauth2` + server-side session flow, and with it the
class of bug fixed in `c6904ac` (`saveUninitialized: true so oauth2 state survives the
redirect`). CSRF and OAuth state become the library's problem.

Environment: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`, `DB_PATH`,
`PORT`.

Callback URL: `https://spend.samuelwiseman.com/api/auth/callback/google`.

---

## Public signup and its obligations

Signup stays open: any Google account can register. That means strangers store financial
records on a disk you own, and three things follow. They are cheap to build now and awkward
to retrofit.

**You are a data controller.** Ship a *delete my account* action that genuinely deletes
(one statement, given `ON DELETE CASCADE`) and a *data export* returning the user's entries
as JSON. Nightly database backups will contain third-party financial data: `chmod 600`,
owned by the service user, and encrypted if they ever leave the box.

**Disk is unbounded.** A per-user cap of **5,000 entries**, enforced in the create action. A
simple in-memory token bucket on the mutating Server Actions — **60 mutations per 5 minutes
per user**. The app is single-process, so in-memory is genuinely sufficient; no Redis.

**Google's consent screen must be published.** Because the scopes are non-sensitive, this
does not trigger Google's verification review — but until the app is moved out of *Testing*
mode, only accounts on the test-user list can sign in at all. Do this early; it silently
blocks launch otherwise.

---

## Deployment

A second Docker Compose stack on the existing Ubuntu box, mirroring the pattern
`samuelwiseman.com` already uses.

```yaml
services:
  web:
    build: .
    ports:
      - "13001:3000"          # the site holds 13000
    restart: unless-stopped
    volumes:
      - ./data:/data          # DB survives rebuilds
    env_file:
      - path: .env
        required: false
```

`DB_PATH=/data/spendly.db`. An nginx server block proxies `spend.samuelwiseman.com` to
`127.0.0.1:13001`; `certbot --nginx` issues the certificate. `/health` returns `ok`.

Deploy is `git pull && docker compose up -d --build`, run over SSH — identical to the site,
so there is one deployment procedure to remember rather than two.

**The image moves off Alpine to `node:20-bookworm-slim`.** `better-sqlite3` is a native
module; on glibc it installs a prebuilt binary, whereas Alpine's musl forces a source build
with `python3`/`make`/`g++` in the image. The site gets away with Alpine because it has no
native dependencies.

**Next `standalone` output traces files rather than copying `node_modules`,** which can drop
a native `.node` binary. Mitigation: `serverExternalPackages: ['better-sqlite3']` in
`next.config.ts`. Fallback if tracing still misses it: copy the package explicitly into the
runner stage.

**Backups.** A nightly cron running `sqlite3 /data/spendly.db ".backup ..."` — WAL-safe,
unlike copying the file — with 14 days of retention and `600` permissions.

### Cutover

1. Build and verify locally against a fresh database.
2. Create a new Google OAuth client with the production callback URL.
3. Deploy to `spend.samuelwiseman.com`; verify sign-in, CRUD, month navigation, `/health`.
4. Publish the Google consent screen.
5. Delete the Railway project; remove `Procfile`.

Railway stays up until step 3 passes. There is never a moment when the only working copy is
the one being changed. (The current Railway data is test data only and is not migrated.)

---

## Testing

**Vitest** for `lib/money.ts` and `lib/entries.ts`, porting the assertions in the existing
`test/db.test.js` and `test/entries.test.js`. Money formatting and pence arithmetic get
particular attention, since that is the change most likely to introduce a silent error.

**Playwright** for the flows — sign in, create, edit, delete, navigate months, filter —
matching the site's existing setup. The current `enableTestRoutes` session-injection trick
ports to a test-only auth bypass guarded by an environment variable.

Explicit coverage for: an entry belonging to another user cannot be read, updated or
deleted; the entry cap and the rate limiter both reject; `amount_pence` rejects zero and
negatives.

---

## Risks

| Risk | Mitigation |
|---|---|
| Next standalone drops `better-sqlite3`'s native binary | `serverExternalPackages`; fallback is an explicit copy in the runner stage. Verify in the built image, not just `next dev`. |
| Google consent screen left in Testing mode | Step 4 of cutover; verify with an account not on the test-user list. |
| DNS for `spend.samuelwiseman.com` must resolve to the box before certbot runs | Add the A record and confirm propagation before requesting the cert. |
| Port 13001 already in use | Check `ss -tlnp` on the box before deploying. |
| Float → integer conversion introduces off-by-a-penny errors | No production data to convert; `money.ts` is unit-tested at the boundary. |
| Auth.js v5 API churn | Pin the exact version in `package.json`. |
