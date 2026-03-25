# Spendly

A hosted, multi-user monthly spend tracker. Log and categorise your outgoings as **Need**, **Want**, or **Luxury** — with a donut chart overview and a filterable entries list.

## Features

- Sign in with Google or GitHub (no passwords)
- Add, edit, and delete spend entries
- Categorise as Need / Want / Luxury
- Monthly overview with donut chart and category breakdown
- Filterable entries list with recurring and payment method tracking
- Month navigation to review past spending

## Tech Stack

- **Backend:** Node.js, Fastify 5
- **Database:** SQLite (better-sqlite3)
- **Auth:** Google + GitHub OAuth via @fastify/oauth2
- **Frontend:** Vanilla HTML, CSS, and JavaScript — no framework, no build step

## Getting Started

### Prerequisites

- Node.js 18+
- A Google OAuth app and/or GitHub OAuth app

### Setup

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/samuelwiseman/spendly.git
cd spendly
npm install
```

2. Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

```
SESSION_SECRET=<random string, at least 32 chars>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

3. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### OAuth Setup

**Google:** [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) → Create Credentials → OAuth client ID → Web application. Add `http://localhost:3000/auth/google/callback` as an authorised redirect URI.

**GitHub:** [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App. Set callback URL to `http://localhost:3000/auth/github/callback`.

## Running Tests

```bash
npm test
```

19 tests covering the database layer and the full entries API.

## Deployment

The app is a single Node.js process suitable for Railway, Render, or Fly.io.

- Use the included `Procfile` (`web: node server.js`)
- Attach a persistent volume and set `DB_PATH` to a path within it (e.g. `/data/data.db`) — SQLite data is lost on restart without this
- Set all env vars from `.env.example` in your platform dashboard
- Update your OAuth callback URLs to your production domain before deploying

## Project Structure

```
spendly/
├── server.js          # Fastify app factory + entry point
├── routes/
│   ├── auth.js        # OAuth routes and session endpoints
│   └── entries.js     # Entries CRUD API
├── db/
│   ├── schema.sql     # Table definitions
│   └── db.js          # SQLite query helpers
├── public/
│   ├── index.html     # Overview page
│   ├── entries.html   # Entries list page
│   ├── login.html     # Sign-in page
│   ├── css/style.css  # All styles
│   └── js/
│       ├── api.js     # Fetch wrappers
│       ├── modal.js   # Add/edit modal
│       ├── overview.js
│       └── entries.js
└── test/
    ├── db.test.js
    └── entries.test.js
```
