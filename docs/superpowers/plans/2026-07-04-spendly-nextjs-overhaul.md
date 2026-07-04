# Spendly Next.js Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Spendly as a self-hosted Next.js application with a designed dark UI, replacing the Fastify + vanilla-JS prototype and the Railway deployment.

**Architecture:** Next.js App Router monolith. Server Components read SQLite directly through `lib/entries.ts`; Server Actions in `lib/actions.ts` perform all mutations. There is no REST API. The selected month is a URL search param so the overview server-renders and deep-links. Auth.js v5 owns the Google OAuth flow and issues a JWT session cookie carrying the local `users.id`.

**Tech Stack:** Next.js 16.2.10, React 19, TypeScript 5.7, `motion` 12, `better-sqlite3` 12, `next-auth` 5.0.0-beta.31, `zod` 4, Vitest 4, Playwright 1.

**Spec:** `docs/superpowers/specs/2026-07-04-spendly-nextjs-overhaul-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

**Ports:** Spendly's dev and `next start` servers bind **3001**, not Next's default 3000 — `samuelwiseman.com` owns 3000 on this machine. Playwright uses **3101** (the site uses 3100). The container listens on 3000 internally and is published on host port **13001** (the site holds 13000). Container-internal 3000 is correct and must not change.

**Versions — pin exactly, no carets on the two risky ones:**
- `next@16.2.10`, `react@19`, `react-dom@19`, `motion@^12.42.2`
- `next-auth@5.0.0-beta.31` — **beta. Pin exactly.** The v5 API is not stable; a floating range will break the build without warning.
- `better-sqlite3@^12.11.1` — native module. See Task 9.
- `zod@^4.4.3`, `vitest@^4.1.10`, `@playwright/test@^1.61.1`, `typescript@^5.7.0`

**Money:** Stored as `amount_pence INTEGER` everywhere. Never `REAL`, never a float. Pounds exist only in `lib/money.ts` and in rendered output. Currency is GBP; locale `en-GB`.

**Timezone:** `TZ=Europe/London` is set in Docker Compose. Never call `new Date()` to derive "the current month" in a component — use `currentMonth()` from `lib/months.ts`.

**Design tokens** (CSS custom properties in `globals.css`, referenced by role — never raw hex in a component):

| Role | Hex |
|---|---|
| `--surface` | `#16150f` |
| `--surface-raised` | `#1d1b14` |
| `--line` | `#2c2a20` |
| `--line-strong` | `#3a3830` |
| `--text` | `#eae8dc` |
| `--text-strong` | `#fdfcf5` |
| `--muted` | `#8d8a76` |
| `--faint` | `#5f5d50` |
| `--critical` | `#d03b3b` |
| `--good` | `#0ca30c` |

**Category ordinal ramp** — validated; do not alter without re-running the validator:

| Category | Token | Hex |
|---|---|---|
| Need | `--cat-need` | `#98362c` |
| Want | `--cat-want` | `#c9564a` |
| Luxury | `--cat-luxury` | `#e8a093` |

Re-validate with:
`node <dataviz-skill>/scripts/validate_palette.js "#98362c,#c9564a,#e8a093" --mode dark --surface "#16150f" --ordinal`

**Design rules:**
- **No shadows.** Elevation is expressed with `--surface-raised` and `1px solid var(--line)`.
- **No red for interactive elements.** Red belongs to the data. Primary buttons are cream-on-ink (`--text-strong` background, `--surface` text). `:focus-visible` is `2px solid var(--text-strong)` with `3px` offset.
- Destructive actions use `--critical` **plus an icon and a text label**, never colour alone.
- All figures are mono with `font-variant-numeric: tabular-nums`. This includes the hero figure.
- Reduced motion is handled by CSS overrides in `globals.css`, **never** by conditional rendering — that causes a hydration mismatch.

**Copy:** The application name is **never** hardcoded. Import `BRAND` from `lib/brand.ts`.

**Limits:** `ENTRY_CAP = 5000` entries per user. Rate limit: **60 mutations per 300 seconds per user.**

**Testing:** TDD throughout. `npm test` runs Vitest. `npm run test:e2e` runs Playwright. Commit after every green test cycle.

---

## File Structure

| File | Responsibility |
|---|---|
| `next.config.ts` | standalone output, native-module tracing |
| `src/lib/brand.ts` | single source for app name/domain |
| `src/lib/money.ts` | pure: pence ↔ GBP. No I/O. |
| `src/lib/months.ts` | pure: month arithmetic on `YYYY-MM`. No I/O. |
| `src/lib/schema.ts` | the SQL schema as a string constant |
| `src/lib/db.ts` | `better-sqlite3` connection + singleton |
| `src/lib/entries.ts` | the **only** module that writes SQL |
| `src/lib/limits.ts` | `ENTRY_CAP` + `exceedsCap()`. Separate from `actions.ts` because a `"use server"` file may only export async functions. |
| `src/lib/action-types.ts` | `ActionResult`. Same reason. |
| `src/lib/rate-limit.ts` | pure-ish: in-memory token bucket |
| `src/lib/auth.ts` | Auth.js configuration |
| `src/lib/session.ts` | `requireUserId()` — the only way to learn who is asking |
| `src/lib/actions.ts` | Server Actions: validate → authorise → rate-limit → call `entries.ts` |
| `src/components/SpendBar.tsx` | stacked bar + tooltip (client) |
| `src/components/SpendTable.tsx` | accessible table view of the same numbers |
| `src/components/MonthNav.tsx` | prev/next month links |
| `src/components/EntryDialog.tsx` | create/edit form (client) |
| `src/components/EntryRow.tsx` | one row in the entries list |
| `src/app/page.tsx` | overview |
| `src/app/entries/page.tsx` | entries list |
| `src/app/account/page.tsx` | export + delete account |
| `src/app/login/page.tsx` | sign-in |
| `src/app/health/route.ts` | `ok` — and proves SQLite loaded |

`entries.ts` takes an explicit `db` handle and a `userId` on **every** call. There is no query that can accidentally cross users, and every function is testable against `:memory:`.

---

## Task 1: Scaffold the Next.js application

Replaces the Fastify app. `db/`, `test/` and `public/js/` are kept for reference until Tasks 2–3 port them, then deleted in Task 3.

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/health/route.ts`, `src/lib/brand.ts`
- Delete: `server.js`, `routes/auth.js`, `routes/entries.js`, `Procfile`, `public/index.html`, `public/entries.html`, `public/login.html`, `public/css/style.css`, `public/js/api.js`, `public/js/entries.js`, `public/js/modal.js`, `public/js/overview.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `BRAND` (`{ name: string; domain: string; url: string; tagline: string }`); the CSS custom properties every later component uses; `npm test` and `npm run build` scripts.

- [ ] **Step 1: Replace `package.json`**

```json
{
  "name": "spendly",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "next": "16.2.10",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "motion": "^12.42.2",
    "better-sqlite3": "^12.11.1",
    "next-auth": "5.0.0-beta.31",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^20.17.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/better-sqlite3": "^7.6.11",
    "vitest": "^4.1.10",
    "@playwright/test": "^1.61.1"
  }
}
```

Then: `rm -rf node_modules package-lock.json && npm install`

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "tests"]
}
```

- [ ] **Step 3: Create `next.config.ts`**

`serverExternalPackages` stops Next bundling the native module. `outputFileTracingIncludes` forces the compiled `.node` binary into the standalone output, which tracing alone sometimes misses. Task 9 verifies this empirically — do not assume it works.

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/better-sqlite3/build/Release/*.node"],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

- [ ] **Step 5: Create `src/lib/brand.ts`**

```ts
export const BRAND = {
  name: "Spendly",
  domain: "spend.samuelwiseman.com",
  url: "https://spend.samuelwiseman.com",
  tagline: "Needs, wants, luxuries.",
} as const;
```

- [ ] **Step 6: Create `src/app/globals.css`**

```css
:root {
  --surface: #16150f;
  --surface-raised: #1d1b14;
  --line: #2c2a20;
  --line-strong: #3a3830;
  --text: #eae8dc;
  --text-strong: #fdfcf5;
  --muted: #8d8a76;
  --faint: #5f5d50;
  --critical: #d03b3b;
  --good: #0ca30c;

  --cat-need: #98362c;
  --cat-want: #c9564a;
  --cat-luxury: #e8a093;

  --sans: var(--font-sans), -apple-system, system-ui, sans-serif;
  --mono: var(--font-mono), ui-monospace, Menlo, monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--surface);
  color: var(--text);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.mono, .fig {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}

a { color: inherit; }

:focus-visible {
  outline: 2px solid var(--text-strong);
  outline-offset: 3px;
}

.col { max-width: 820px; margin: 0 auto; padding: 0 24px; }

.label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
}

.hero {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  font-size: 48px;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--text-strong);
}

.btn {
  font: inherit;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--text);
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
}

.btn-primary {
  background: var(--text-strong);
  border-color: var(--text-strong);
  color: var(--surface);
  font-weight: 600;
}

.btn-danger { border-color: var(--critical); color: var(--critical); }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* Reduced motion: CSS override only. Never branch in React — it desyncs hydration. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
  [data-reveal] { opacity: 1 !important; transform: none !important; }
}
```

- [ ] **Step 7: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: "A monthly spend tracker that sorts outgoings into needs, wants and luxuries.",
  metadataBase: new URL(BRAND.url),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <noscript>
          <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create `src/app/health/route.ts`**

Deliberately a plain `ok` for now. Task 3 upgrades it to execute a query, which is what makes it prove the native module loaded.

```ts
export const runtime = "nodejs";

export function GET() {
  return new Response("ok");
}
```

- [ ] **Step 9: Create `.env.example`**

```
# Auth.js — generate with: npx auth secret
AUTH_SECRET=
# Port 3001, not 3000: samuelwiseman.com's dev server owns 3000 on this machine.
AUTH_URL=http://localhost:3001

# Google OAuth — https://console.cloud.google.com/apis/credentials
# Callback: {AUTH_URL}/api/auth/callback/google
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Database
DB_PATH=data.db

# Test-only. NEVER set in production: it disables authentication.
# TEST_AUTH_BYPASS=1
```

- [ ] **Step 10: Delete the Fastify application and ignore Next's build output**

```bash
git rm -r server.js routes Procfile public
printf '\n.next/\n' >> .gitignore
```

`next-env.d.ts` **is** committed (Next regenerates it, but tooling expects it present). `.next/` is not.

`db/` and `test/` stay for now — Task 3 ports their contents, then removes them.

- [ ] **Step 11: Verify the build and the health route**

Run: `npm run build`
Expected: build succeeds, and the output lists `/health` as a route.

Run: `npm run dev` in one shell, then `curl -s localhost:3001/health`
Expected: `ok`

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app, replacing Fastify prototype"
```

---

## Task 2: Pure helpers — money and months

Both modules are pure functions with no I/O, so they are tested exhaustively and cheaply. Everything downstream depends on them being right.

**Files:**
- Create: `src/lib/money.ts`, `src/lib/money.test.ts`
- Create: `src/lib/months.ts`, `src/lib/months.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `toPence(input: string | number): number` — throws `RangeError` on invalid input
  - `formatGBP(pence: number): string` → `"£1,340.20"`
  - `formatGBPCompact(pence: number): string` → `"£1.2k"`
  - `currentMonth(): string` → `"2026-07"`
  - `addMonths(month: string, delta: number): string`
  - `isValidMonth(value: string): boolean`
  - `formatMonthLong(month: string): string` → `"July 2026"`
  - `resolveMonth(value: string | undefined): string` — the requested month if valid, else the current month. Both page components use this; do not inline the ternary.

- [ ] **Step 1: Write the failing money tests**

Create `src/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatGBP, formatGBPCompact, toPence } from "./money";

describe("toPence", () => {
  it("parses whole pounds", () => expect(toPence("12")).toBe(1200));
  it("parses two decimal places", () => expect(toPence("12.34")).toBe(1234));
  it("pads a single decimal place", () => expect(toPence("12.3")).toBe(1230));
  it("strips currency symbols and separators", () =>
    expect(toPence("£1,234.56")).toBe(123456));
  it("accepts a number", () => expect(toPence(12.34)).toBe(1234));
  it("rejects negatives", () => expect(() => toPence("-1")).toThrow(RangeError));
  it("rejects non-numeric input", () => expect(() => toPence("abc")).toThrow(RangeError));
  it("rejects sub-penny precision", () => expect(() => toPence("1.234")).toThrow(RangeError));

  // This is the entire reason amount_pence exists.
  it("does not drift when summed", () => {
    const total = toPence("0.1") + toPence("0.2");
    expect(total).toBe(30);
    expect(formatGBP(total)).toBe("£0.30");
  });
});

describe("formatGBP", () => {
  it("formats with thousands separators", () => expect(formatGBP(134020)).toBe("£1,340.20"));
  it("formats zero", () => expect(formatGBP(0)).toBe("£0.00"));
});

describe("formatGBPCompact", () => {
  it("abbreviates thousands", () => expect(formatGBPCompact(241280)).toBe("£2.4k"));
  it("drops a trailing zero", () => expect(formatGBPCompact(200000)).toBe("£2k"));
  it("leaves small values whole", () => expect(formatGBPCompact(64018)).toBe("£640"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/money.test.ts`
Expected: FAIL — `Failed to resolve import "./money"`

- [ ] **Step 3: Implement `src/lib/money.ts`**

Parsing is done on the *string*, never by multiplying a float by 100 — `Math.round(1.005 * 100)` is `100`, not `101`.

```ts
const AMOUNT = /^\d+(\.\d{1,2})?$/;

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/** Parse a user-supplied amount into integer pence. Throws on anything invalid. */
export function toPence(input: string | number): number {
  const raw = typeof input === "number" ? input.toFixed(2) : input;
  const cleaned = raw.trim().replace(/[£,\s]/g, "");

  if (!AMOUNT.test(cleaned)) {
    throw new RangeError(`Not a valid amount: ${JSON.stringify(input)}`);
  }

  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatGBP(pence: number): string {
  return gbp.format(pence / 100);
}

/** For axis ticks, where precision is noise. */
export function formatGBPCompact(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) {
    return `£${(pounds / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `£${Math.round(pounds)}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/money.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Write the failing months tests**

Create `src/lib/months.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addMonths, formatMonthLong, isValidMonth, resolveMonth } from "./months";

describe("resolveMonth", () => {
  it("keeps a valid month", () => expect(resolveMonth("2026-03")).toBe("2026-03"));
  it("falls back when undefined", () => expect(resolveMonth(undefined)).toMatch(/^\d{4}-\d{2}$/));
  it("falls back when invalid", () => expect(resolveMonth("2026-13")).toMatch(/^\d{4}-\d{2}$/));
  it("falls back when a day is supplied", () => expect(resolveMonth("2026-03-01")).toMatch(/^\d{4}-\d{2}$/));
});

describe("addMonths", () => {
  it("steps forward", () => expect(addMonths("2026-07", 1)).toBe("2026-08"));
  it("steps backward", () => expect(addMonths("2026-07", -1)).toBe("2026-06"));
  it("rolls over the year end", () => expect(addMonths("2026-12", 1)).toBe("2027-01"));
  it("rolls back over the year start", () => expect(addMonths("2026-01", -1)).toBe("2025-12"));
  it("pads single-digit months", () => expect(addMonths("2026-10", -1)).toBe("2026-09"));
});

describe("isValidMonth", () => {
  it("accepts YYYY-MM", () => expect(isValidMonth("2026-07")).toBe(true));
  it("rejects a day component", () => expect(isValidMonth("2026-07-01")).toBe(false));
  it("rejects month zero", () => expect(isValidMonth("2026-00")).toBe(false));
  it("rejects month thirteen", () => expect(isValidMonth("2026-13")).toBe(false));
  it("rejects nonsense", () => expect(isValidMonth("july")).toBe(false));
});

describe("formatMonthLong", () => {
  it("renders a human month", () => expect(formatMonthLong("2026-07")).toBe("July 2026"));
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- src/lib/months.test.ts`
Expected: FAIL — `Failed to resolve import "./months"`

- [ ] **Step 7: Implement `src/lib/months.ts`**

```ts
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: string): boolean {
  return MONTH.test(value);
}

/** The current month in Europe/London, as YYYY-MM. */
export function currentMonth(): string {
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return now.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const match = MONTH.exec(month);
  if (!match) throw new RangeError(`Not a valid month: ${month}`);

  const year = Number(match[1]);
  const zeroBased = Number(match[2]) - 1 + delta;

  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12 + 1;

  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

export function formatMonthLong(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** The month a page should render: the requested one if it parses, else today's. */
export function resolveMonth(value: string | undefined): string {
  return value && isValidMonth(value) ? value : currentMonth();
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npm test`
Expected: PASS, 26 tests across both files.

- [ ] **Step 9: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts src/lib/months.ts src/lib/months.test.ts
git commit -m "feat: pure money and month helpers, money stored as integer pence"
```

---

## Task 3: Database — schema, connection, queries

The schema lives in TypeScript, not in a `.sql` file. Next's file tracing does not reliably copy arbitrary data files into the standalone build, and a missing schema at runtime is a production crash. A string constant cannot be dropped.

**Files:**
- Create: `src/lib/schema.ts`, `src/lib/db.ts`, `src/lib/entries.ts`, `src/lib/entries.test.ts`
- Modify: `src/app/health/route.ts`
- Delete: `db/schema.sql`, `db/db.js`, `test/db.test.js`, `test/entries.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Category = "need" | "want" | "luxury"`
  - `interface Entry` — `{ id, user_id, name, amount_pence, category, date, notes, recurring, payment_method, created_at, updated_at }`
  - `interface EntryInput` — `{ name, amount_pence, category, date, notes?, recurring?, payment_method? }`
  - `type DB` — alias for `better-sqlite3`'s `Database` instance type, exported from `db.ts`. Use this everywhere; `import type { Database } from "better-sqlite3"` does **not** resolve to the instance type and will not compile.
  - `createDb(file: string): DB`
  - `getDb(): DB`
  - `upsertUser(db, { provider, providerId, name, email, avatarUrl }): { id: number }`
  - `getEntriesByMonth(db, userId: number, month: string): Entry[]`
  - `categoryTotals(db, userId: number, month: string): Record<Category, number>`
  - `countEntries(db, userId: number): number`
  - `createEntry(db, userId: number, input: EntryInput): Entry`
  - `updateEntry(db, userId: number, id: number, input: EntryInput): Entry | undefined`
  - `deleteEntry(db, userId: number, id: number): boolean`
  - `exportUser(db, userId: number): { user: unknown; entries: Entry[] }`
  - `deleteUser(db, userId: number): void`

- [ ] **Step 1: Create `src/lib/schema.ts`**

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
```

- [ ] **Step 2: Create `src/lib/db.ts`**

The `globalThis` cache exists because Next's dev server re-evaluates modules on hot reload; without it you leak a SQLite handle per edit until the process runs out of file descriptors.

```ts
import Database from "better-sqlite3";
import { SCHEMA } from "./schema";

/** The instance type. `import { Database }` gives you the constructor, not this. */
export type DB = Database.Database;

export function createDb(file: string): DB {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

const globalForDb = globalThis as unknown as { __spendlyDb?: DB };

export function getDb(): DB {
  globalForDb.__spendlyDb ??= createDb(process.env.DB_PATH ?? "data.db");
  return globalForDb.__spendlyDb;
}
```

- [ ] **Step 3: Write the failing entries tests**

Create `src/lib/entries.test.ts`. Note the tests that assert users cannot touch each other's rows — those are the ones that matter.

```ts
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
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- src/lib/entries.test.ts`
Expected: FAIL — `Failed to resolve import "./entries"`

- [ ] **Step 5: Implement `src/lib/entries.ts`**

```ts
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
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test`
Expected: PASS. If `deleteUser` cascade fails, `foreign_keys = ON` was not applied — check `createDb`.

- [ ] **Step 7: Upgrade `/health` to exercise SQLite**

This is what makes Task 9's verification meaningful: a `200` now proves the native module loaded and the schema applied.

```ts
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return new Response("ok");
  } catch (error) {
    console.error("health: database unreachable", error);
    return new Response("database unreachable", { status: 503 });
  }
}
```

- [ ] **Step 8: Delete the old database layer**

```bash
git rm -r db test
```

- [ ] **Step 9: Verify the health route still answers**

Run: `npm run dev`, then `curl -s -o /dev/null -w "%{http_code}" localhost:3001/health`
Expected: `200`

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: SQLite layer with integer pence, cascade delete and per-user isolation"
```

---

## Task 4: Authentication

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/session.ts`, `src/types/next-auth.d.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `getDb()`, `upsertUser()`, `BRAND`.
- Produces:
  - `auth()`, `signIn()`, `signOut()`, `handlers` from `lib/auth.ts`
  - `requireUserId(): Promise<number>` from `lib/session.ts` — redirects to `/login` when unauthenticated. **The only sanctioned way to learn the caller's identity.**

- [ ] **Step 1: Create `src/types/next-auth.d.ts`**

```ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    userId: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: number;
  }
}
```

- [ ] **Step 2: Create `src/lib/auth.ts`**

`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `AUTH_SECRET` are read from the environment automatically by Auth.js — do not pass them explicitly.

The user is upserted in the `jwt` callback, which runs only on initial sign-in (when `account` is present). Doing it in `session` would hit the database on every request.

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import { upsertUser } from "@/lib/entries";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, account, profile }) {
      if (account && profile?.sub) {
        const user = upsertUser(getDb(), {
          provider: "google",
          providerId: profile.sub,
          name: profile.name ?? null,
          email: profile.email ?? null,
          avatarUrl: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) session.userId = token.userId;
      return session;
    },
  },
});
```

- [ ] **Step 3: Create `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/lib/auth";

export const runtime = "nodejs";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Create `src/lib/session.ts`**

`TEST_AUTH_BYPASS` disables authentication entirely. It is read from the environment, never from a request, so an attacker cannot enable it. Task 9's Compose file does not set it; Task 10's Playwright config does.

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** The caller's local users.id. Redirects to /login when unauthenticated. */
export async function requireUserId(): Promise<number> {
  if (process.env.TEST_AUTH_BYPASS === "1") {
    const testUser = (await cookies()).get("test_user_id")?.value;
    if (testUser) return Number(testUser);
  }

  const session = await auth();
  if (!session?.userId) redirect("/login");
  return session.userId;
}
```

- [ ] **Step 5: Create `src/app/login/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export default async function LoginPage() {
  if ((await auth())?.userId) redirect("/");

  return (
    <main className="col" style={{ minHeight: "100dvh", display: "grid", placeContent: "center", textAlign: "center" }}>
      <h1 className="hero" style={{ fontSize: 34 }}>{BRAND.name}</h1>
      <p style={{ color: "var(--muted)", margin: "10px 0 28px" }}>{BRAND.tagline}</p>

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button className="btn btn-primary" type="submit">Continue with Google</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Verify the OAuth flow by hand**

Create a Google OAuth client (Web application) with authorised redirect URI `http://localhost:3001/api/auth/callback/google`. Populate `.env` from `.env.example`; generate `AUTH_SECRET` with `npx auth secret`.

Run: `npm run dev`, visit `http://localhost:3001/login`, click through Google.
Expected: redirect to `/` (which 404s until Task 6 — that is correct at this point). Then verify the user landed in the database:

```bash
sqlite3 data.db "SELECT id, provider, email FROM users;"
```
Expected: exactly one row.

Sign in a second time and re-run the query.
Expected: still exactly one row — the upsert is idempotent.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Google sign-in via Auth.js, JWT session carrying local user id"
```

---

## Task 5: Server Actions — validation, rate limiting, entry cap

**Files:**
- Create: `src/lib/limits.ts`, `src/lib/limits.test.ts`, `src/lib/action-types.ts`
- Create: `src/lib/rate-limit.ts`, `src/lib/rate-limit.test.ts`, `src/lib/actions.ts`

**Interfaces:**
- Consumes: `requireUserId()`, `getDb()`, `toPence()`, `createEntry/updateEntry/deleteEntry/countEntries`.
- Produces:
  - `ENTRY_CAP: number` and `exceedsCap(count: number): boolean` from `lib/limits.ts`
  - `type ActionResult = { ok: true } | { ok: false; error: string }` from `lib/action-types.ts`
  - `consume(key: number, now?: number): boolean` from `lib/rate-limit.ts`
  - `createEntryAction(prev: ActionResult | null, form: FormData): Promise<ActionResult>`
  - `updateEntryAction(prev: ActionResult | null, form: FormData): Promise<ActionResult>`
  - `deleteEntryAction(form: FormData): Promise<void>`

> **A `"use server"` module may only export async functions.** Exporting `ENTRY_CAP` or
> `type ActionResult` from `actions.ts` fails the build with *"Only async functions are
> allowed to be exported in a 'use server' file."* That is why they live in their own
> modules — which also makes the cap unit-testable, since it is no longer trapped inside
> a Server Action.

- [ ] **Step 1: Write the failing limits test**

Create `src/lib/limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ENTRY_CAP, exceedsCap } from "./limits";

describe("exceedsCap", () => {
  it("allows a user below the cap", () => expect(exceedsCap(ENTRY_CAP - 1)).toBe(false));
  it("rejects a user at the cap", () => expect(exceedsCap(ENTRY_CAP)).toBe(true));
  it("rejects a user above the cap", () => expect(exceedsCap(ENTRY_CAP + 1)).toBe(true));
  it("caps at five thousand", () => expect(ENTRY_CAP).toBe(5000));
});
```

Run: `npm test -- src/lib/limits.test.ts`
Expected: FAIL — `Failed to resolve import "./limits"`

- [ ] **Step 2: Implement `src/lib/limits.ts` and `src/lib/action-types.ts`**

`src/lib/limits.ts`:

```ts
export const ENTRY_CAP = 5000;

export function exceedsCap(count: number): boolean {
  return count >= ENTRY_CAP;
}
```

`src/lib/action-types.ts`:

```ts
export type ActionResult = { ok: true } | { ok: false; error: string };
```

Run: `npm test -- src/lib/limits.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Write the failing rate-limit tests**

`now` is injected so the test controls time rather than sleeping.

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { CAPACITY, WINDOW_MS, consume, __reset } from "./rate-limit";

beforeEach(() => __reset());

describe("consume", () => {
  it("allows up to capacity", () => {
    for (let i = 0; i < CAPACITY; i++) expect(consume(1, 0)).toBe(true);
  });

  it("rejects beyond capacity", () => {
    for (let i = 0; i < CAPACITY; i++) consume(1, 0);
    expect(consume(1, 0)).toBe(false);
  });

  it("refills fully after the window", () => {
    for (let i = 0; i < CAPACITY; i++) consume(1, 0);
    expect(consume(1, WINDOW_MS)).toBe(true);
  });

  it("refills proportionally within the window", () => {
    for (let i = 0; i < CAPACITY; i++) consume(1, 0);
    expect(consume(1, WINDOW_MS / 2)).toBe(true);
  });

  it("tracks users independently", () => {
    for (let i = 0; i < CAPACITY; i++) consume(1, 0);
    expect(consume(1, 0)).toBe(false);
    expect(consume(2, 0)).toBe(true);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- src/lib/rate-limit.test.ts`
Expected: FAIL — `Failed to resolve import "./rate-limit"`

- [ ] **Step 5: Implement `src/lib/rate-limit.ts`**

In-memory is sufficient: the app is a single process. If it is ever scaled horizontally this must move to shared storage.

```ts
export const CAPACITY = 60;
export const WINDOW_MS = 300_000;

interface Bucket {
  tokens: number;
  updated: number;
}

const buckets = new Map<number, Bucket>();

/** Take one token. Returns false when the caller is over budget. */
export function consume(key: number, now: number = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: CAPACITY, updated: now };

  const refill = ((now - bucket.updated) / WINDOW_MS) * CAPACITY;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + refill);
  bucket.updated = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

/** Test-only. */
export function __reset(): void {
  buckets.clear();
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test -- src/lib/rate-limit.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Implement `src/lib/actions.ts`**

Order matters: authenticate, then rate-limit, then validate, then check the cap, then write. Validation before rate limiting would let an attacker probe validation for free.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-types";
import { getDb } from "@/lib/db";
import { ENTRY_CAP, exceedsCap } from "@/lib/limits";
import { toPence } from "@/lib/money";
import { consume } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";
import { countEntries, createEntry, deleteEntry, updateEntry } from "@/lib/entries";

const EntrySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  amount: z.string().trim().min(1, "Amount is required"),
  category: z.enum(["need", "want", "luxury"]),
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
    input: {
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

function refresh() {
  revalidatePath("/");
  revalidatePath("/entries");
}

export async function createEntryAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!consume(userId)) return { ok: false, error: "Too many changes. Try again in a few minutes." };

  const parsed = parse(form);
  if (!parsed.ok) return parsed;

  const db = getDb();
  if (exceedsCap(countEntries(db, userId))) {
    return { ok: false, error: `You have reached the limit of ${ENTRY_CAP} entries.` };
  }

  createEntry(db, userId, parsed.input);
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

  if (!updateEntry(getDb(), userId, id, parsed.input)) {
    return { ok: false, error: "Unknown entry" };
  }

  refresh();
  return { ok: true };
}

export async function deleteEntryAction(form: FormData): Promise<void> {
  const userId = await requireUserId();
  if (!consume(userId)) return;

  const id = Number(form.get("id"));
  if (Number.isInteger(id)) deleteEntry(getDb(), userId, id);

  refresh();
}
```

- [ ] **Step 8: Typecheck and run the full unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all unit tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/limits.ts src/lib/limits.test.ts src/lib/action-types.ts \
        src/lib/rate-limit.ts src/lib/rate-limit.test.ts src/lib/actions.ts
git commit -m "feat: server actions with validation, rate limiting and entry cap"
```

---

## Task 6: Overview page — stacked bar, table view, month navigation

Replaces the donut. Position on a common axis, single-hue ordinal ramp, direct labels, and a table view so category is never conveyed by colour alone.

**Files:**
- Create: `src/components/SpendBar.tsx`, `src/components/SpendTable.tsx`, `src/components/MonthNav.tsx`
- Create: `src/app/page.tsx`
- Modify: `src/app/globals.css` (append the chart styles below)

**Interfaces:**
- Consumes: `requireUserId()`, `categoryTotals()`, `formatGBP()`, `formatGBPCompact()`, `currentMonth()`, `isValidMonth()`, `addMonths()`, `formatMonthLong()`.
- Produces: `<SpendBar totals={...} />`, `<SpendTable totals={...} />`, `<MonthNav month="2026-07" />`.

- [ ] **Step 1: Append chart styles to `src/app/globals.css`**

```css
/* ---- stacked bar ---- */
.bar { display: flex; gap: 2px; height: 40px; margin: 10px 0 6px; }
.bar-seg { border: 0; padding: 0; cursor: default; position: relative; }
.bar-seg:first-child { border-radius: 4px 0 0 4px; }
.bar-seg:last-child { border-radius: 0 4px 4px 0; }
.bar-seg[data-cat="need"] { background: var(--cat-need); }
.bar-seg[data-cat="want"] { background: var(--cat-want); }
.bar-seg[data-cat="luxury"] { background: var(--cat-luxury); }

.bar-empty {
  height: 40px; border: 1px dashed var(--line-strong); border-radius: 4px;
  display: grid; place-content: center; color: var(--faint); font-size: 13px;
}

.bar-axis {
  display: flex; justify-content: space-between;
  border-top: 1px solid var(--line); padding-top: 5px;
  font-family: var(--mono); font-size: 10px; color: var(--muted);
}

.tip {
  position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
  background: var(--surface-raised); border: 1px solid var(--line-strong);
  border-radius: 5px; padding: 6px 9px; white-space: nowrap; font-size: 12px;
  pointer-events: none; z-index: 5;
}

.legend { display: grid; gap: 8px; margin-top: 18px; }
.legend-row { display: flex; align-items: center; gap: 9px; }
.legend-sw { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.legend-name { flex: 1; }
.legend-pct { color: var(--muted); font-size: 13px; width: 42px; text-align: right; }

.table-toggle { margin-top: 20px; }
.table-toggle summary { cursor: pointer; color: var(--muted); font-size: 13px; }
.data-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
.data-table th, .data-table td { text-align: left; padding: 7px 0; border-bottom: 1px solid var(--line); }
.data-table td.num, .data-table th.num { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 2: Create `src/components/SpendBar.tsx`**

Segments are `<button>` rather than `<div>` so they are focusable — the tooltip must be reachable by keyboard, not only by pointer.

The bar container carries **no `role="img"`**. `img` is a leaf role: it hides its own children from assistive technology, which would make the focusable segments unreachable to a screen reader. The per-segment `aria-label`s carry the meaning instead, and `SpendTable` is the non-visual equivalent of the whole chart.

```tsx
"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_LABELS as LABELS, type Category } from "@/lib/entries";
import { formatGBP, formatGBPCompact } from "@/lib/money";

export function SpendBar({ totals }: { totals: Record<Category, number> }) {
  const [active, setActive] = useState<Category | null>(null);

  const total = CATEGORIES.reduce((sum, c) => sum + totals[c], 0);
  if (total === 0) {
    return <div className="bar-empty">No spending recorded this month</div>;
  }

  const pct = (value: number) => Math.round((value / total) * 100);

  return (
    <>
      <div className="bar">
        {CATEGORIES.filter((c) => totals[c] > 0).map((c) => (
          <button
            key={c}
            type="button"
            className="bar-seg"
            data-cat={c}
            style={{ flexGrow: totals[c] }}
            onMouseEnter={() => setActive(c)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(c)}
            onBlur={() => setActive(null)}
            aria-label={`${LABELS[c]}: ${formatGBP(totals[c])}, ${pct(totals[c])}%`}
          >
            {active === c && (
              <span className="tip mono">
                {LABELS[c]} · {formatGBP(totals[c])} · {pct(totals[c])}%
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
        {CATEGORIES.map((c) => (
          <div className="legend-row" key={c}>
            <span className="legend-sw" style={{ background: `var(--cat-${c})` }} />
            <span className="legend-name">{LABELS[c]}</span>
            <span className="fig">{formatGBP(totals[c])}</span>
            <span className="legend-pct mono">{pct(totals[c])}%</span>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Create `src/components/SpendTable.tsx`**

```tsx
import { CATEGORIES, CATEGORY_LABELS as LABELS, type Category } from "@/lib/entries";
import { formatGBP } from "@/lib/money";

export function SpendTable({ totals }: { totals: Record<Category, number> }) {
  const total = CATEGORIES.reduce((sum, c) => sum + totals[c], 0);

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
          {CATEGORIES.map((c) => (
            <tr key={c}>
              <th scope="row">{LABELS[c]}</th>
              <td className="num">{formatGBP(totals[c])}</td>
              <td className="num">{total === 0 ? "—" : `${Math.round((totals[c] / total) * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
```

- [ ] **Step 4: Create `src/components/MonthNav.tsx`**

```tsx
import Link from "next/link";
import { addMonths, formatMonthLong } from "@/lib/months";

export function MonthNav({ month, basePath = "/" }: { month: string; basePath?: string }) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Link href={`${basePath}?month=${addMonths(month, -1)}`} aria-label="Previous month">←</Link>
      <span className="mono" style={{ minWidth: 120, textAlign: "center" }}>{formatMonthLong(month)}</span>
      <Link href={`${basePath}?month=${addMonths(month, 1)}`} aria-label="Next month">→</Link>
    </nav>
  );
}
```

- [ ] **Step 5: Create `src/app/page.tsx`**

In Next 16 `searchParams` is a Promise and must be awaited.

```tsx
import Link from "next/link";
import { MonthNav } from "@/components/MonthNav";
import { SpendBar } from "@/components/SpendBar";
import { SpendTable } from "@/components/SpendTable";
import { BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import { CATEGORIES, categoryTotals } from "@/lib/entries";
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
  const total = CATEGORIES.reduce((sum, c) => sum + totals[c], 0);
  const discretionary = totals.want + totals.luxury;

  return (
    <main className="col" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <strong className="mono">{BRAND.name}</strong>
        <MonthNav month={month} />
      </header>

      <p className="label">Total out</p>
      <p className="hero">{formatGBP(total)}</p>
      <p className="mono" style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
        {total === 0 ? "—" : `${Math.round((discretionary / total) * 100)}% discretionary`}
      </p>

      <section style={{ marginTop: 32 }}>
        <SpendBar totals={totals} />
        <SpendTable totals={totals} />
      </section>

      <p style={{ marginTop: 40 }}>
        <Link href={`/entries?month=${month}`} className="btn">View entries</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Verify by hand**

Run: `npm run dev`, sign in, visit `/`.
Expected: hero reads `£0.00`, the bar shows "No spending recorded this month", the legend lists all three categories at `£0.00`.

Insert a row directly and reload:

```bash
sqlite3 data.db "INSERT INTO entries (user_id, name, amount_pence, category, date) VALUES (1, 'Rent', 95000, 'need', '$(date +%Y-%m)-01');"
```
Expected: hero reads `£950.00`, the bar is a single Need-coloured segment, `0% discretionary`.

Tab to the segment with the keyboard.
Expected: focus ring appears and the tooltip opens — the tooltip is not pointer-only.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: overview with stacked bar on ordinal ramp, replacing the donut"
```

---

## Task 7: Entries page — list, create, edit, delete

**Files:**
- Create: `src/components/EntryDialog.tsx`, `src/components/EntryRow.tsx`, `src/app/entries/page.tsx`
- Modify: `src/app/globals.css` (append the entry styles below)

**Interfaces:**
- Consumes: `createEntryAction`, `updateEntryAction`, `deleteEntryAction`, `getEntriesByMonth()`, `formatGBP()`.
- Produces: `<EntryDialog entry={entry ?? null} month={month} />`, `<EntryRow entry={entry} month={month} />`.

- [ ] **Step 1: Append entry styles to `src/app/globals.css`**

```css
.entry { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.entry-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.entry-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-date { font-family: var(--mono); font-size: 11px; color: var(--faint); }
.entry-amt { font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--text-strong); }

dialog {
  background: var(--surface-raised); color: var(--text);
  border: 1px solid var(--line-strong); border-radius: 10px;
  padding: 22px; width: min(440px, 92vw);
}
dialog::backdrop { background: rgb(0 0 0 / 0.6); }
dialog label { display: block; margin-bottom: 12px; font-size: 13px; color: var(--muted); }
dialog input, dialog select, dialog textarea {
  display: block; width: 100%; margin-top: 5px; font: inherit;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--line-strong); border-radius: 5px; padding: 8px 10px;
}
dialog input[type="checkbox"] { width: auto; display: inline-block; margin: 0 6px 0 0; }
.form-error { color: var(--critical); font-size: 13px; margin-bottom: 12px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
```

- [ ] **Step 2: Create `src/components/EntryDialog.tsx`**

`useActionState` is the React 19 hook for form actions. The dialog closes only once the action reports success — otherwise the error stays visible.

```tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/action-types";
import type { Entry } from "@/lib/entries";
import { createEntryAction, updateEntryAction } from "@/lib/actions";

export function EntryDialog({ entry, month }: { entry: Entry | null; month: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const action = entry ? updateEntryAction : createEntryAction;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <button className={entry ? "btn" : "btn btn-primary"} onClick={() => ref.current?.showModal()}>
        {entry ? "Edit" : "Add entry"}
      </button>

      <dialog ref={ref}>
        <form action={formAction}>
          {entry && <input type="hidden" name="id" value={entry.id} />}

          {state && !state.ok && <p className="form-error" role="alert">{state.error}</p>}

          <label>Name
            <input name="name" defaultValue={entry?.name ?? ""} required maxLength={120} />
          </label>

          <label>Amount (£)
            <input name="amount" inputMode="decimal" required
              defaultValue={entry ? (entry.amount_pence / 100).toFixed(2) : ""} />
          </label>

          <label>Category
            <select name="category" defaultValue={entry?.category ?? "need"}>
              <option value="need">Need</option>
              <option value="want">Want</option>
              <option value="luxury">Luxury</option>
            </select>
          </label>

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
            Recurring
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

- [ ] **Step 3: Create `src/components/EntryRow.tsx`**

Delete is `--critical` **plus** a `✕` glyph **plus** the word "Delete" in its accessible name — never colour alone.

```tsx
import { deleteEntryAction } from "@/lib/actions";
import { EntryDialog } from "@/components/EntryDialog";
import type { Entry } from "@/lib/entries";
import { formatGBP } from "@/lib/money";

export function EntryRow({ entry, month }: { entry: Entry; month: string }) {
  const day = new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short",
  });

  return (
    <li className="entry">
      <span className="entry-dot" style={{ background: `var(--cat-${entry.category})` }} />
      <span className="entry-name">
        {entry.name}
        {entry.recurring === 1 && <span className="label" style={{ marginLeft: 8 }}>recurring</span>}
      </span>
      <span className="entry-date">{day}</span>
      <span className="entry-amt">{formatGBP(entry.amount_pence)}</span>

      <EntryDialog entry={entry} month={month} />

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

- [ ] **Step 4: Create `src/app/entries/page.tsx`**

```tsx
import Link from "next/link";
import { EntryDialog } from "@/components/EntryDialog";
import { EntryRow } from "@/components/EntryRow";
import { MonthNav } from "@/components/MonthNav";
import { getDb } from "@/lib/db";
import { getEntriesByMonth } from "@/lib/entries";
import { resolveMonth } from "@/lib/months";
import { requireUserId } from "@/lib/session";

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const month = resolveMonth((await searchParams).month);

  const entries = getEntriesByMonth(getDb(), userId, month);

  return (
    <main className="col" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <Link href={`/?month=${month}`} className="mono">← Overview</Link>
        <MonthNav month={month} basePath="/entries" />
      </header>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p className="label">{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
        <EntryDialog entry={null} month={month} />
      </div>

      {entries.length === 0 ? (
        <p style={{ color: "var(--faint)", padding: "36px 0" }}>Nothing recorded this month.</p>
      ) : (
        <ul style={{ listStyle: "none" }}>
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} month={month} />
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Verify the full CRUD cycle by hand**

Run: `npm run dev`, sign in, go to `/entries`.

1. Click **Add entry**, submit with an empty name → the browser blocks it (`required`).
2. Enter name `Test`, amount `abc` → dialog stays open, shows "Amount must be a number, e.g. 12.34".
3. Enter amount `12.34`, category `Want`, save → dialog closes, row appears reading `£12.34`.
4. Go to `/` → hero reads `£12.34`, `100% discretionary`.
5. Back to `/entries`, click **Edit**, change amount to `0` → shows "Amount must be greater than zero".
6. Change to `20`, save → row reads `£20.00`.
7. Click **Delete** → row disappears without a page reload.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: entries list with create, edit and delete via server actions"
```

---

## Task 8: Account — data export and deletion

Required because signup is open: you hold third parties' financial records.

**Files:**
- Create: `src/app/account/page.tsx`, `src/app/account/export/route.ts`
- Modify: `src/lib/actions.ts` (append `deleteAccountAction`)
- Modify: `src/app/page.tsx` (link to `/account`)

**Interfaces:**
- Consumes: `requireUserId()`, `exportUser()`, `deleteUser()`, `signOut()`.
- Produces: `deleteAccountAction(form: FormData): Promise<void>`.

- [ ] **Step 1: Append `deleteAccountAction` to `src/lib/actions.ts`**

Deleting the user cascades to their entries via the foreign key. Requires the user to type the confirmation phrase, because this is irreversible.

First replace the two affected import lines at the top of the file — do **not** add a second `@/lib/entries` import:

```ts
import { signOut } from "@/lib/auth";
import { countEntries, createEntry, deleteEntry, deleteUser, updateEntry } from "@/lib/entries";
```

Then append at the end of the file:

```ts
export async function deleteAccountAction(form: FormData): Promise<void> {
  const userId = await requireUserId();

  if (form.get("confirm") !== "DELETE") return;

  deleteUser(getDb(), userId);
  await signOut({ redirectTo: "/login" });
}
```

- [ ] **Step 2: Create `src/app/account/export/route.ts`**

```ts
import { getDb } from "@/lib/db";
import { exportUser } from "@/lib/entries";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  const payload = exportUser(getDb(), userId);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="spendly-export.json"',
    },
  });
}
```

- [ ] **Step 3: Create `src/app/account/page.tsx`**

```tsx
import Link from "next/link";
import { deleteAccountAction } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { countEntries } from "@/lib/entries";
import { requireUserId } from "@/lib/session";

export default async function AccountPage() {
  const userId = await requireUserId();
  const count = countEntries(getDb(), userId);

  return (
    <main className="col" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <p style={{ marginBottom: 30 }}><Link href="/" className="mono">← Overview</Link></p>

      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Your data</h1>
      <p style={{ color: "var(--muted)", marginBottom: 28 }}>
        You have {count} {count === 1 ? "entry" : "entries"} stored.
      </p>

      <p style={{ marginBottom: 44 }}>
        <a className="btn" href="/account/export">Download my data (JSON)</a>
      </p>

      <h2 style={{ fontSize: 17, marginBottom: 8 }}>Delete account</h2>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Permanently deletes your account and all {count} of your entries. This cannot be undone.
      </p>

      <form action={deleteAccountAction} style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label className="sr-only" htmlFor="confirm">Type DELETE to confirm</label>
        <input id="confirm" name="confirm" placeholder="Type DELETE" autoComplete="off"
          style={{ font: "inherit", background: "var(--surface)", color: "var(--text)",
                   border: "1px solid var(--line-strong)", borderRadius: 5, padding: "8px 10px" }} />
        <button type="submit" className="btn btn-danger">
          <span aria-hidden="true">✕</span> Delete my account
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Link to it from the overview**

In `src/app/page.tsx`, replace the closing `<p style={{ marginTop: 40 }}>` block with:

```tsx
      <p style={{ marginTop: 40, display: "flex", gap: 12 }}>
        <Link href={`/entries?month=${month}`} className="btn">View entries</Link>
        <Link href="/account" className="btn">Account</Link>
      </p>
```

- [ ] **Step 5: Verify by hand**

1. Visit `/account/export` → a `spendly-export.json` file downloads containing only your rows.
2. On `/account`, click **Delete my account** with the box empty → nothing happens.
3. Type `DELETE`, submit → redirected to `/login`.
4. Confirm the cascade:

```bash
sqlite3 data.db "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM entries;"
```
Expected: `0` and `0`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: data export and account deletion"
```

---

## Task 9: Container image and Compose stack

`better-sqlite3` is a native module. On glibc it installs a prebuilt binary; on Alpine's musl it must be compiled from source. The base image therefore differs from `samuelwiseman.com`, which is on Alpine because it has no native dependencies.

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

**Interfaces:**
- Consumes: `npm run build`, `/health`.
- Produces: an image serving on container port `3000`, published on host port `13001`.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
.next
.git
data
*.db
*.db-shm
*.db-wal
.env
.superpowers
docs
tests
test-results
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

`13000` belongs to `samuelwiseman.com`. `TZ` is what makes `currentMonth()` correct. `TEST_AUTH_BYPASS` is deliberately absent.

```yaml
services:
  web:
    build: .
    ports:
      - "13001:3000"
    restart: unless-stopped
    environment:
      DB_PATH: /data/spendly.db
      TZ: Europe/London
    volumes:
      - ./data:/data
    env_file:
      - path: .env
        required: false
```

- [ ] **Step 4: Verify the native module survived the standalone build**

This is the step that catches the failure mode `next.config.ts` is defending against. Do not skip it.

```bash
mkdir -p data
docker compose up -d --build
```

Check the compiled binary actually made it into the runner image:

```bash
docker compose exec web sh -c 'find / -name "better_sqlite3.node" 2>/dev/null'
```
Expected: at least one path. Empty output means tracing dropped it — see Step 5.

- [ ] **Step 5: Verify the health route proves SQLite works**

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:13001/health
```
Expected: `200`. A `503` means the module loaded but the database did not open. A `500` or a crash loop means the `.node` binary is missing — check `docker compose logs web` for `ERR_DLOPEN_FAILED` or `Cannot find module`.

**If the binary is missing,** add this to the runner stage and rebuild:

```dockerfile
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
```

- [ ] **Step 6: Verify the database persists across a rebuild**

```bash
docker compose exec web node -e "require('better-sqlite3')('/data/spendly.db').prepare('SELECT 1 AS x').get()"
docker compose down && docker compose up -d --build
ls -l data/spendly.db
```
Expected: the file exists and its `mtime` predates the rebuild.

- [ ] **Step 7: Ignore runtime state and commit**

```bash
printf '\ndata/\nbackups/\n' >> .gitignore
git add Dockerfile docker-compose.yml .dockerignore .gitignore
git commit -m "build: bookworm-slim image with native sqlite, compose on 13001"
```

---

## Task 10: End-to-end tests

**Files:**
- Create: `playwright.config.ts`, `tests/spendly.spec.ts`, `src/app/test-login/route.ts`

**Interfaces:**
- Consumes: `TEST_AUTH_BYPASS`, `requireUserId()`.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Create the test-only login route `src/app/test-login/route.ts`**

Returns `404` unless `TEST_AUTH_BYPASS=1`, so it does not exist in production even if the file ships.

```ts
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { upsertUser } from "@/lib/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.TEST_AUTH_BYPASS !== "1") {
    return new Response("Not found", { status: 404 });
  }

  const who = new URL(request.url).searchParams.get("who") ?? "alice";
  const user = upsertUser(getDb(), {
    provider: "test", providerId: who, name: who, email: `${who}@example.com`, avatarUrl: null,
  });

  (await cookies()).set("test_user_id", String(user.id), { httpOnly: true, path: "/" });
  return Response.redirect(new URL("/", request.url), 302);
}
```

- [ ] **Step 2: Create `playwright.config.ts`**

Port `3101` — `samuelwiseman.com` uses `3100`, and running both suites at once must not collide. Each run gets a scratch database.

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3101" },
  webServer: {
    command: "rm -f .e2e.db && npm run build && npx next start -p 3101",
    url: "http://localhost:3101/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      TEST_AUTH_BYPASS: "1",
      DB_PATH: ".e2e.db",
      AUTH_SECRET: "e2e-secret-at-least-32-characters-long!!",
      TZ: "Europe/London",
    },
  },
});
```

- [ ] **Step 3: Write the failing e2e tests**

Create `tests/spendly.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

// One SQLite file is shared by every test in this run, so state accumulates and
// order matters. Serial mode makes that explicit rather than accidental.
test.describe.configure({ mode: "serial" });

const month = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit",
}).format(new Date()).slice(0, 7);

test.beforeEach(async ({ page }) => {
  await page.goto("/test-login?who=alice");
});

test("unauthenticated visitors are sent to login", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
});

test("an empty month reads zero", async ({ page }) => {
  await expect(page.getByText("£0.00")).toBeVisible();
  await expect(page.getByText("No spending recorded this month")).toBeVisible();
});

test("create, edit and delete an entry", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);

  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByLabel("Name").fill("Rent");
  await page.getByLabel("Amount (£)").fill("950.00");
  await page.getByLabel("Category").selectOption("need");
  await page.getByLabel("Date").fill(`${month}-01`);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Rent")).toBeVisible();
  await expect(page.getByText("£950.00")).toBeVisible();

  await page.goto(`/?month=${month}`);
  await expect(page.locator(".hero")).toHaveText("£950.00");
  await expect(page.getByText("0% discretionary")).toBeVisible();

  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Amount (£)").fill("960.00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("£960.00")).toBeVisible();

  await page.getByRole("button", { name: "Delete Rent" }).click();
  await expect(page.getByText("Nothing recorded this month.")).toBeVisible();
});

test("an invalid amount keeps the dialog open and explains why", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByLabel("Name").fill("Nonsense");
  await page.getByLabel("Amount (£)").fill("abc");
  await page.getByLabel("Date").fill(`${month}-01`);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("alert")).toContainText("Amount must be a number");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("one user cannot see another user's entries", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByLabel("Name").fill("Alice private");
  await page.getByLabel("Amount (£)").fill("10.00");
  await page.getByLabel("Date").fill(`${month}-01`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Alice private")).toBeVisible();

  await page.goto("/test-login?who=bob");
  await page.goto(`/entries?month=${month}`);
  await expect(page.getByText("Alice private")).toHaveCount(0);
  await expect(page.getByText("Nothing recorded this month.")).toBeVisible();
});

test("the chart tooltip is reachable by keyboard", async ({ page }) => {
  await page.goto(`/entries?month=${month}`);
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByLabel("Name").fill("Trainers");
  await page.getByLabel("Amount (£)").fill("130.00");
  await page.getByLabel("Category").selectOption("luxury");
  await page.getByLabel("Date").fill(`${month}-06`);
  await page.getByRole("button", { name: "Save" }).click();

  await page.goto(`/?month=${month}`);
  await page.getByRole("button", { name: /^Luxury:/ }).focus();
  await expect(page.locator(".tip")).toContainText("Luxury");
});

test("the table view carries the same numbers as the bar", async ({ page }) => {
  await page.goto(`/?month=${month}`);
  await page.getByText("View as table").click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row", { name: /Luxury/ })).toContainText("£130.00");
});

// The negative case — that /test-login 404s when TEST_AUTH_BYPASS is unset — cannot be
// asserted here, because this whole suite requires the flag to be on. It is verified
// against the deployed server in Task 11, Step 11. That check is not optional.
test("the test-login route redirects when the bypass flag is set", async ({ request }) => {
  const response = await request.get("/test-login?who=carol", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npx playwright install --with-deps chromium` then `npm run test:e2e`
Expected: FAIL — `/test-login` 404s until Step 1's file is saved and the app rebuilt.

- [ ] **Step 5: Run to verify pass**

Run: `npm run test:e2e`
Expected: PASS, 8 tests.

If "one user cannot see another user's entries" fails, `requireUserId()` is not reading the `test_user_id` cookie — check that `TEST_AUTH_BYPASS` reached the server process.

- [ ] **Step 6: Add `.e2e.db*` to `.gitignore` and commit**

```bash
printf '\n.e2e.db*\ntest-results/\nplaywright-report/\n' >> .gitignore
git add -A
git commit -m "test: playwright coverage for CRUD, isolation, a11y and validation"
```

---

## Task 11: Deploy to the Ubuntu server

Server-side runbook. Nothing here is application code.

**Railway is already gone and the app is currently down.** There is therefore no fallback and no cutover window to protect — this is a cold start, not a migration. Two consequences: nothing here is a "point of no return", and the only data at risk is the local `data.db`, which holds test data. Take the steps in order anyway, because step 7 gates whether anyone other than you can sign in.

**Files:**
- Create: `docs/deploy.md` (capture the commands actually run, for next time)
- Modify: `README.md`

**Interfaces:**
- Consumes: the image from Task 9.
- Produces: `https://spend.samuelwiseman.com` serving the app.

- [ ] **Step 1: Confirm port 13001 is free**

On the server: `ss -tlnp | grep 13001`
Expected: no output. If occupied, choose `13002` and change `docker-compose.yml` to match.

- [ ] **Step 2: Point DNS at the box**

Add an `A` record for `spend.samuelwiseman.com` → the server's public IPv4, matching whatever `samuelwiseman.com` already resolves to.

Verify before continuing — certbot will fail otherwise:

```bash
dig +short spend.samuelwiseman.com
```
Expected: the server's IP. Wait for propagation if not.

- [ ] **Step 3: Clone and configure**

```bash
git clone https://github.com/samuelwiseman/spendly.git /srv/spendly
cd /srv/spendly
mkdir -p data
cp .env.example .env
```

Edit `.env`:
```
AUTH_SECRET=<npx auth secret>
AUTH_URL=https://spend.samuelwiseman.com
AUTH_GOOGLE_ID=<new production client id>
AUTH_GOOGLE_SECRET=<new production client secret>
```

`DB_PATH` and `TZ` come from Compose — do not set them here.

- [ ] **Step 4: Create the Google production OAuth client**

In Google Cloud Console, create a new OAuth client (Web application):
- Authorised redirect URI: `https://spend.samuelwiseman.com/api/auth/callback/google`

Do **not** reuse the Railway credentials — their callback URL is wrong and they should die with the old deployment.

- [ ] **Step 5: Bring the stack up**

```bash
docker compose up -d --build
curl -s -o /dev/null -w "%{http_code}\n" localhost:13001/health
```
Expected: `200`.

- [ ] **Step 6: nginx server block and certificate**

Create `/etc/nginx/sites-available/spendly`:

```nginx
server {
    listen 80;
    server_name spend.samuelwiseman.com;

    location / {
        proxy_pass http://127.0.0.1:13001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

`X-Forwarded-Proto` is required: without it Auth.js builds `http://` callback URLs behind the TLS terminator and the OAuth flow fails with a redirect-URI mismatch.

```bash
ln -s /etc/nginx/sites-available/spendly /etc/nginx/sites-enabled/spendly
nginx -t && systemctl reload nginx
certbot --nginx -d spend.samuelwiseman.com
```

Verify: `curl -sI https://spend.samuelwiseman.com/health | head -1`
Expected: `HTTP/2 200`

- [ ] **Step 7: Publish the Google consent screen**

In Google Cloud Console → OAuth consent screen → **Publish app**.

Scopes are `openid`, `email`, `profile` — non-sensitive, so this does not trigger verification review. Until it is published, only accounts on the test-user list can sign in.

Verify with a Google account that is **not** on the test-user list: sign in at `https://spend.samuelwiseman.com`.
Expected: sign-in completes.

- [ ] **Step 8: Nightly encrypted-at-rest backup**

`.backup` is WAL-safe; copying the file is not.

Create `/etc/cron.daily/spendly-backup`:

```bash
#!/bin/sh
set -eu
DEST=/srv/spendly/backups
mkdir -p "$DEST"
chmod 700 "$DEST"
sqlite3 /srv/spendly/data/spendly.db ".backup '$DEST/spendly-$(date +%F).db'"
chmod 600 "$DEST"/spendly-*.db
find "$DEST" -name 'spendly-*.db' -mtime +14 -delete
```

```bash
chmod +x /etc/cron.daily/spendly-backup
/etc/cron.daily/spendly-backup
ls -l /srv/spendly/backups
```
Expected: one `0600` file owned by root. These contain other users' financial records — they must never leave the box unencrypted.

Add `backups/` to `.gitignore`.

- [ ] **Step 9: Confirm no Railway artefacts remain**

The Railway project is already deleted. Confirm the repo agrees:

```bash
git ls-files | grep -E '^(Procfile|server\.js)$'
```
Expected: no output.

Delete the old Railway OAuth client in Google Cloud Console — its callback URL now points at nothing, and a dangling client is a credential you are not watching.

- [ ] **Step 10: Update `README.md`**

Replace the Railway URL, the tech stack, and the setup instructions:

```markdown
# Spendly

**Live:** https://spend.samuelwiseman.com

A hosted, multi-user monthly spend tracker. Log and categorise your outgoings as
**Need**, **Want**, or **Luxury** — with a stacked-bar overview and a filterable entries list.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Database:** SQLite (better-sqlite3), amounts stored as integer pence
- **Auth:** Google OAuth via Auth.js v5
- **Tests:** Vitest (unit), Playwright (e2e)

## Development

    cp .env.example .env    # then fill in AUTH_* values
    npm install
    npm run dev

    npm test                # unit
    npm run test:e2e        # end-to-end

## Deploy

    docker compose up -d --build   # serves on :13001

Behind nginx + certbot. `/health` returns `ok` and proves SQLite opened.
See `docs/deploy.md`.
```

- [ ] **Step 11: Final verification against production**

```bash
curl -sI https://spend.samuelwiseman.com/health | head -1     # HTTP/2 200
curl -sI https://spend.samuelwiseman.com/test-login | head -1  # HTTP/2 404
```

The second is the important one: it proves `TEST_AUTH_BYPASS` is not set in production. **If it returns 302, stop and remove the variable from the server's environment immediately** — authentication is disabled.

Then, in a browser: sign in, add an entry, reload, confirm it persists; `docker compose down && docker compose up -d` and confirm it still persists.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "docs: deploy runbook, retire Railway"
```

---

## Appendix: What was deliberately left out

Budgets, month-over-month trends, CSV import/export, multi-currency, a light theme. All are non-goals in the spec. A light theme in particular is not a flip of these tokens — it is a second palette that must be selected and re-validated against a light surface.
