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
  - Structure: hairline rules, section signs (§00–§06), tabular-nums on every figure.
- **Pages:**
  - `app/page.tsx` → `app/components/FarmAuctionApp.tsx` — public surface (edition strip, masthead with auth chip, hero, stat rail, §01 Inventory, §02 Floor, §03 Procurement, colophon).
  - `app/bidder-terms/page.tsx` — §04 terms of the bell, static markdown-style list.
  - `app/login/page.tsx` — §05 sign-in form (`?next=` honored if same-site).
  - `app/signup/page.tsx` — §06 open self-serve signup (creates `role=user` accounts).
  - `app/account/page.tsx` — §02·c logged-in bidder dashboard (profile, registrations, bid ledger).
  - `app/admin/page.tsx` → `app/admin/AdminConsole.tsx` — operator console; gated by session role=admin (redirects to /login otherwise).
  - `app/health/page.tsx` — readiness probe.
- **Auth (client):** `app/lib/useAuth.ts` — `useAuth() → { user, status, refresh, signOut }` reads `/api/auth/me` on mount. All authed fetches use `credentials: "include"`. No localStorage tokens; cookie is HttpOnly.
- **Client-side state:** `useState` + `useEffect` per surface. No external store. Filtering/sorting is client-side over the listings array.
- **Real-time:** `EventSource("/api/auctions/:id/events")` for `bid.accepted` push; reconnect is left to the browser.

## Backend (`server/`)

- **Framework:** Fastify 5 + `@fastify/cors` (with `credentials: true`).
- **Persistence:** PostgreSQL via `pg`. Migrations in `server/db/migrations/`.
- **Auth (`server/auth.ts`):** scrypt password hashing (cost 16384, 16-byte salt, 64-byte key, format `scrypt$cost$salt$hash`, `timingSafeEqual` verify). Opaque 32-byte session tokens; only sha256 hash stored in `user_sessions`. Cookie `farmauction_session` is HttpOnly, SameSite=Lax, Path=/, 14d, Secure controlled by `config.cookieSecure` (defaults to `NODE_ENV==='production'`). `requireAdmin` checks session role first, then accepts the legacy `x-admin-key` header (constant-time compare) as a server-side fallback for prod scripts. `requireUser` gates bidder-only routes. `assertSameOriginIfBrowserPost` (allowlist against `config.corsOrigin`) protects `/api/auctions/:id/{bids,register}` from CSRF via session cookies; server-to-server callers (no Origin header) pass through.
- **Routes (subset):**
  - Auth: `POST /api/auth/{signup,login,logout}`, `GET /api/auth/me`.
  - Bidder self: `GET /api/me/summary` (requires session) → `{ user, bidder, registrations, bids }`.
  - Public: `/api/listings`, `/api/auctions`, `/api/auctions/:id`, `/api/auctions/:id/events`, `/api/auctions/:id/bids`, `/api/auctions/:id/register`, `/api/contact-inquiries`, `/api/newsletter-signups`, `/api/health`.
  - Admin (session role=admin OR `x-admin-key`): `/api/admin/dashboard`, `/api/admin/listings`, `/api/admin/auctions`, `/api/admin/auctions/:id/{status,close,bidders,tasks}`, `/api/admin/inquiries`, `/api/admin/newsletter-signups`, `/api/admin/events`, `/api/admin/notifications`, `/api/admin/tasks/:id/status`.
- **Notifications:** Outbox table; SMTP delivery when configured, retained otherwise. HTML bodies escape user-supplied values (`escapeHtml` in `emailTemplates.ts`). Outbid notices go to the bidder captured under the bid's row lock (`placeBid` returns `previousHighBid`), so self-raises never notify; 60s per-bidder throttle. Demo auctions (`serializeAuction.isDemo`) send no outbid or won/lost emails — their seeded bidders use fake addresses.
- **Idempotency:** Bids carry a client-generated `idempotencyKey` so retries don't double-record. Replays of an accepted bid return the original outcome without re-firing SSE publishes or emails.

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

## Tests

- `npm run test:unit` — pure-logic unit tests (`node:test` via tsx); no DB or server needed.
- `npm run test:smoke` — read-only sanity checks against an API.
- `npm run test:live-flow` — end-to-end with cleanup; needs `ADMIN_API_KEY`.
- `npm run test:bidder-profile` — bidder self-service profile flows; needs local DB + API.
