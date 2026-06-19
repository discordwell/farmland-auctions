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
- **Client-side state:** `useState` + `useEffect` per surface. No external store. The §01 inventory fetches every published listing once and filters/sorts in the browser; that logic is a pure, unit-tested module (`app/lib/listingFilter.ts` — `selectListings`/`sortListings`/`listingMatchesFilters`), kept in agreement with the server's query builder (`server/listingQuery.ts`, `LISTING_SORT_CLAUSES`; notably `ppa-asc` sorts unpriced lots last, matching `price_per_acre_cents ASC NULLS LAST`). Both test files pin `LISTING_SORT_KEYS` to the same canonical list so the two halves can't silently drift out of agreement.
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
- **Bidding (`server/auctionService.ts`):** `placeBid` runs inside a `withTransaction` holding a `FOR UPDATE` lock on the auction row — the single writer for bids and high-bid state. The pure decision rules (minimum next bid, open-window check, approved-bidder ceiling, displaced-bidder capture) live in `server/bidRules.ts` as side-effect-free functions so they're documented and unit-testable without a DB; `placeBid` calls them and owns all I/O and side effects. The soft-close (anti-snipe) extension stays in SQL against the DB clock.
- **Idempotency:** Bids carry a client-generated `idempotencyKey` so retries don't double-record. Replays of an accepted bid return the original outcome without re-firing SSE publishes or emails.
- **Inventory query (`server/listingQuery.ts`):** `buildListingWhere` parses the `/api/listings` query (`listingQuerySchema`) and builds the parameterized `WHERE` + `ORDER BY` as a pure, side-effect-free, unit-tested function — no DB, no Fastify. Every user value is bound as a `$n` parameter (injection-safe); only published listings are returned. This is the SQL half of the inventory browse whose client half is `app/lib/listingFilter.ts`; the home page never sends `?sort=`/filter params (it fetches once and sorts client-side), so these branches are otherwise unexercised by the UI. `LISTING_SORT_CLAUSES` (per `ListingSortKey`) and the canonical `LISTING_SORT_KEYS` mirror the client; both test suites pin that key set so a one-sided sort-mode change fails a test. The listing status taxonomy (`LISTING_STATUSES`/`listingStatusSchema`) lives here too and is re-imported by the admin listing schema.
- **Public bid confidentiality (`server/bidVisibility.ts`):** Live auctions are an open outcry — every accepted bid (amount + bidder alias) and the running high bid are public in real time. Sealed-bid auctions (`auction_type='sealed'`) are confidential: no bid detail may reach an unauthenticated client. A pure, unit-tested module decides this on `auctionType` and is the single gate over every public surface — `getPublicBidHistory` (the `/api/auctions/:id/bids` route) and `getAuction`'s bundled history return an empty list for sealed; the accepted-bid SSE publishes a contentless `sealed_bid.accepted` instead of `bid.accepted`; the `auction.closed` SSE blanks the high-bid fields for sealed. Operator/admin surfaces (`requireAdmin`) and the operator's own close response read the raw accessors directly. Sealed *winner selection / reveal* is still unimplemented (`placeBid`'s sealed branch never writes `current_high_*`), so today the redaction is defense in depth; it must stay in place before that feature ships.
- **Reserve confidentiality (`server/reserveVisibility.ts`):** A `met-only` auction publishes whether its reserve is met but not the price; `public` publishes both; `hidden` publishes neither — a `hidden` floor must not be inferable by anyone but the operator. `serializeAuction` never emits the reserve *price*, so the one publicly derived bit is `reserveMet`. A pure, unit-tested module (`reserveMetVisible`/`publicReserveView`, fail-closed for unknown visibilities) is the single gate that forces `reserveMet` to `false` for a hidden reserve on every public surface that carries a serialized auction: the `/api/auctions` catalog, `getAuction` (`/api/auctions/:id`), the `bid.accepted` payload (redacted once in the `/bids` route — covers both the POST response and the SSE fan-out), and the `auction.closed` SSE (composed with the sealed-bid redaction). `reserveVisibility` itself is preserved so the client can tell a redacted hidden reserve apart from a genuine "pending" and render neither (the three lot surfaces — catalog card, auction detail stamp, home stat-rail — suppress the indicator when `reserveVisibility==='hidden'`). The one **authenticated** surface that joins the auction's *raw* reserve columns — `GET /api/me/summary`, the registered bidder's own registrations — is held to the same standard via `registrantReserveView` (`reservePriceVisible` exposes the price only for `public`; the met bit follows `reserveMetVisible`, withheld as `null` rather than `false` for hidden/unknown). A registered bidder is the room a concealed reserve exists to keep in the dark, so this is not looser than the public posture. Operator/admin reads keep the raw `reserveMet` and price.

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

- `npm run test:unit` — pure-logic unit tests (`node:test` via tsx); no DB or server needed. Covers `bidRules` (bid-acceptance math + boundaries), `bidVisibility` (sealed-auction redaction), `reserveVisibility` (hidden-reserve redaction on public surfaces + the `/api/me/summary` registrant price/met gate + canonical level set), `listingQuery` (the `/api/listings` `WHERE`/`ORDER BY` builder + injection-safety), serializers, auth, email-template escaping, and the client inventory filter/sort (`app/lib/listingFilter.ts`).
- `npm run test:smoke` — read-only sanity checks against an API.
- `npm run test:live-flow` — end-to-end with cleanup; needs `ADMIN_API_KEY`.
- `npm run test:bidder-profile` — bidder self-service profile flows; needs local DB + API.
