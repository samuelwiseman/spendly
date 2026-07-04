# Spend Tracker — Design Spec
**Date:** 2026-03-25
**Stack:** Node.js, Fastify, SQLite (better-sqlite3), Vanilla CSS/JS

---

## Overview

A hosted, multi-user personal finance tracker. Each user independently logs and categorises their monthly outgoings. The app is public-facing — anyone can sign up via OAuth and start tracking.

---

## Architecture

**Monolith:** Fastify serves both the REST API (`/api/*`) and static frontend files from `public/`. One process, one deploy target (e.g. Railway, Render, or Fly.io). SQLite database stored as a file on disk.

```
spend-tracker/
├── server.js               # Fastify entry point, plugin registration
├── routes/
│   ├── auth.js             # OAuth routes (Google + GitHub), session handling
│   └── entries.js          # CRUD for spend entries
├── db/
│   ├── schema.sql          # Table definitions
│   └── db.js               # better-sqlite3 connection + query helpers
├── public/
│   ├── index.html          # Overview page (auth-protected)
│   ├── entries.html        # Entries page (auth-protected)
│   ├── login.html          # Login / OAuth landing page
│   ├── css/
│   │   └── style.css       # All styles — clean white theme
│   └── js/
│       └── app.js          # Fetch API calls, DOM rendering, modal logic
├── .env                    # Secrets (not committed)
└── package.json
```

---

## Data Model

### `users`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| provider | TEXT | `'google'` or `'github'` |
| provider_id | TEXT | ID from OAuth provider — UNIQUE with provider |
| name | TEXT | Display name |
| email | TEXT | |
| avatar_url | TEXT | Profile picture URL |
| created_at | TEXT | ISO 8601 |

### `entries`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| user_id | INTEGER FK | References `users.id` |
| name | TEXT | e.g. "Rent", "Spotify" |
| amount | REAL | Positive number |
| category | TEXT | `'need'`, `'want'`, or `'luxury'` |
| date | TEXT | ISO date (`YYYY-MM-DD`) |
| notes | TEXT | Optional free text |
| recurring | INTEGER | `0` or `1` (boolean) |
| payment_method | TEXT | e.g. "Card", "Bank transfer", "Cash" |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

---

## Authentication

- **Providers:** Google OAuth 2.0 and GitHub OAuth
- **Library:** `@fastify/oauth2` for OAuth flow, `@fastify/session` + `@fastify/cookie` for session management
- **Flow:**
  1. User visits `/login.html` and clicks a provider button
  2. Redirected to OAuth provider, grants permission
  3. Callback hits `/auth/google/callback` or `/auth/github/callback`
  4. Server upserts user in `users` table, sets session cookie
  5. Redirect to `/` (Overview page)
- **Session:** Server-side session, cookie-based. No JWTs or tokens exposed to frontend JS.
- **Protection:** All `/api/*` routes and protected HTML pages check for a valid session. Unauthenticated API requests return `401`. Unauthenticated page requests redirect to `/login.html`.
- **Secrets required in `.env`:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`

---

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/auth/google` | Initiate Google OAuth flow |
| GET | `/auth/google/callback` | Handle Google OAuth callback |
| GET | `/auth/github` | Initiate GitHub OAuth flow |
| GET | `/auth/github/callback` | Handle GitHub OAuth callback |
| GET | `/auth/logout` | Destroy session, redirect to `/login.html` |
| GET | `/auth/me` | Return current user info (name, avatar) |
| GET | `/api/entries?month=YYYY-MM` | All entries for current user in given month |
| POST | `/api/entries` | Create a new entry |
| PUT | `/api/entries/:id` | Update an existing entry (user-scoped) |
| DELETE | `/api/entries/:id` | Delete an entry (user-scoped) |

All `/api/*` routes scope queries by `user_id` from session — users can never read or modify each other's data.

---

## Pages

### Login (`/login.html`)
- Shown to unauthenticated users
- Two buttons: "Continue with Google" and "Continue with GitHub"
- No other content

### Overview (`/index.html`)
- **Month navigator:** previous/next arrows + current month label (`March 2026`); month stored in URL param (`?month=2026-03`), defaults to current month
- **Summary card:** donut chart (CSS conic-gradient), total spend, colour-coded legend (Need / Want / Luxury with amounts)
- **Category breakdown:** three rows — Need, Want, Luxury — each showing entry count, total amount, and percentage of month total
- **+ Add Entry button:** opens the slide-in modal
- **Nav:** links to Overview (active) and Entries; user avatar top-right with logout

### Entries (`/entries.html`)
- **Month navigator:** same as Overview, stays in sync via URL param (`?month=2026-03`)
- **Category filter pills:** All / Need / Want / Luxury — filters the list in place
- **Entry list:** each row shows name, metadata (date · category · recurring · payment method), amount, edit (✏) and delete (✕) icons
- **+ Add Entry button:** same modal as Overview
- **Nav:** same as Overview

### Shared: Add/Edit Modal
- Triggered by "+ Add Entry" or clicking ✏ on any entry
- Slides in from the right
- Fields: Name, Amount, Category (Need/Want/Luxury dropdown), Date, Notes (optional), Recurring (toggle), Payment Method (optional)
- Edit mode: pre-filled with existing entry values
- Submit calls `POST /api/entries` (create) or `PUT /api/entries/:id` (edit)
- Closes on save, backdrop click, or ESC key
- Inline validation: name and amount are required

---

## Visual Design

- **Theme:** Clean white — white cards (`#ffffff`), light grey page background (`#f8f8f8`), subtle borders (`#e5e5e5`)
- **Category colours:**
  - Need: green (`#16a34a` / `#dcfce7` background)
  - Want: amber (`#d97706` / `#fef3c7` background)
  - Luxury: purple (`#7c3aed` / `#ede9fe` background)
- **Typography:** System font stack, bold weights for amounts
- **Accent:** Dark (`#111`) for primary buttons (Add Entry), category left-border on entry rows
- **No framework** — vanilla CSS with CSS variables for the colour palette

---

## Error Handling

- API errors return JSON `{ error: "message" }` with appropriate HTTP status codes
- Frontend shows inline error messages for failed saves (e.g. network error, validation failure)
- If a user tries to edit/delete an entry that isn't theirs, server returns `403`

---

## Deployment

- Single Node.js process, suitable for Railway / Render / Fly.io
- SQLite database file persisted on a mounted volume (not ephemeral storage)
- Environment variables injected via platform dashboard or `.env` file
- No build step — vanilla JS, no bundler required
