# Architecture

Wyatt Farmland Auctions is a Saskatchewan farmland marketplace + live-auction platform for Wyatt Realty Group. Two services: a static Next.js export served by Caddy, and a Fastify API backed by PostgreSQL.

## Top-level shape

```
Browser ──► Caddy (farmauction.discordwell.com)
              ├── /            → static export from /opt/farmauction/site (Next out/)
              └── /api/*       → reverse-proxy to Fastify on 127.0.0.1
                                  (PM2 process: farmauction-api)
                                          │
                                          └── PostgreSQL (Docker, port 55432 dev)
```

## Frontend (`app/`)

- **Framework:** Next.js 16 (App Router) + React 19, `output: "export"` static build.
- **Design language:** "The Almanac" — editorial-cartographic. Tokens in `app/globals.css`:
  - Type: Newsreader (display serif), IBM Plex Sans (UI), IBM Plex Mono (figures).
  - Palette: paper / paper-soft / paper-deep / ink / ink-2 / mute / mute-2 / rule / prairie / moss / soil / wheat / **ember (LIVE only)** / stamp.
  - Structure: hairline rules, section signs (§00–§04), tabular-nums on every figure.
- **Pages:**
  - `app/page.tsx` → `app/components/FarmAuctionApp.tsx` — public surface (edition strip, masthead, hero, stat rail, §01 Inventory, §02 Floor, §03 Procurement, colophon).
  - `app/bidder-terms/page.tsx` — §04 terms of the bell, static markdown-style list.
  - `app/admin/page.tsx` → `app/admin/AdminConsole.tsx` — operator console, gated by `x-admin-key` header.
  - `app/health/page.tsx` — readiness probe.
- **Client-side state:** `useState` + `useEffect` per surface. No external store. Filtering/sorting is client-side over the listings array.
- **Real-time:** `EventSource("/api/auctions/:id/events")` for `bid.accepted` push; reconnect is left to the browser.

## Backend (`server/`)

- **Framework:** Fastify 5 + `@fastify/cors`.
- **Persistence:** PostgreSQL via `pg`. Migrations in `server/db/migrations/`.
- **Routes (subset):**
  - Public: `/api/listings`, `/api/auctions`, `/api/auctions/:id`, `/api/auctions/:id/events`, `/api/auctions/:id/bids`, `/api/auctions/:id/register`, `/api/contact-inquiries`, `/api/newsletter-signups`, `/api/health`.
  - Admin (`x-admin-key` required): `/api/admin/dashboard`, `/api/admin/listings`, `/api/admin/auctions`, `/api/admin/auctions/:id/{status,close,bidders,tasks}`, `/api/admin/inquiries`, `/api/admin/newsletter-signups`, `/api/admin/events`, `/api/admin/notifications`, `/api/admin/tasks/:id/status`.
- **Notifications:** Outbox table; SMTP delivery when configured, retained otherwise.
- **Idempotency:** Bids carry a client-generated `idempotencyKey` so retries don't double-record.

## Deployment (`deploy/`)

- **Host:** OVH-2 (Caddy + PM2 + Docker Postgres).
- **Web root:** `/opt/farmauction/site` (Caddy serves the Next `out/` export here).
- **API:** `/opt/farmauction/app` under PM2 (`ecosystem.config.cjs` → `farmauction-api`).
- **Caddy vhost:** `deploy/Caddyfile.farmauction.discordwell.com`.
- **DB backup:** `deploy/backup-postgres.sh` (cron, 14-day retention).

## Local development

```bash
docker compose up -d db
npm run db:migrate
npm run api:dev          # Fastify on 3510
npm run dev              # Next on 3000 (or auto-bumped)
```

## Smoke / live-flow tests

- `npm run test:smoke` — read-only sanity checks against an API.
- `npm run test:live-flow` — end-to-end with cleanup; needs `ADMIN_API_KEY`.
