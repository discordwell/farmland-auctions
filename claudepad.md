# Claudepad

## Session Summaries

### 2026-05-18 — Production hardening: sample data, copy trim, working links, LOT detail

Goal: take the Almanac demo to a professional auction site. Four work streams:

1. **Sample data.** Built `server/db/seed.ts` with 10 realistic SK farmland listings (Lipton, Caron, Vanscoy, Coalfields, Buckland, Snipe Lake, Eyebrow, Edenwold, Hudson Bay, Battle River) covering all five statuses, real RM numbers, coords, soil ratings, prices, highlights. Idempotent upsert by slug. Ran against production Postgres via `ssh ovh2 + npm run db:seed`. Live API now returns 10 listings.

2. **Copy trim & assumption removal.** Dropped the Vol./No. weekly-edition framing, "filed weekly", "Est. 2019", hardcoded "North Lipton" hero caption (now data-driven from first For Sale listing or live auction), "One edition each Monday" newsletter promise, "anti-snipe rule in effect" hardcoded legal subtitle (now data-driven from `auction.softCloseSeconds`), fabricated license/phone placeholders in the agent card, and boasty filler ("We work files; we don't print brochures", "Real platform... Not a concept"). All section ledes shortened.

3. **Working links.** Footer "Closed lots" → `#inventory?status=Sold` with a `hashchange` listener that applies the status chip filter; "Wanted files" → `#inventory?status=Wanted`. LOT card "View file →" now routes to `/listings/?slug=...` (new page). Dropped dead `Firesky Resorts Ltd.` placeholder and duplicated "Deposit instructions"/"Anti-snipe rule" footer items.

4. **LOT detail page.** New static page `app/listings/page.tsx` + `ListingDetail.tsx` reads `?slug=` from URL, fetches `/api/listings/:slug`, renders hero photo (Photo/Satellite toggle), stat block (acres / $/ac / Avg AV / soil / type / status), highlights list, description, and a per-lot inquiry form that posts to `/api/contact-inquiries` with the lot context prepended. Empty-state and 404 surfaces included.

Wet-tested end-to-end against live: 10 listings rendering, hash filter works, LOT detail loads, contact form posts (Cameron sees the inquiry), newsletter posts, admin sync works, created a live auction (Lipton half-section), registered + approved a test bidder, submitted two bids via API, confirmed the SSE EventSource pushed both to the open browser in real time and the ledger/reserve stamp/high-bid display all updated correctly. Cleaned up test auction + bidder + inquiries afterward so production state is clean.

Also dropped `public/images/pasture.jpg` from rotation — that asset is a vegetable-market photo, not farmland. Seed now uses only `hero-fields.jpg`, `harvest.jpg`, `satellite-fields.jpg`. Fixed admin masthead wordmark lockup (was rendering inline when sub text was short — forced `display: flex; flex-direction: column`).

### 2026-05-18 — Almanac visual redesign

Implemented the design handoff bundle "Wyatt Farmland Auctions — The Almanac" against the live Next.js app. Replaced the generic SaaS surface (Inter, beige+sage, 8px-rounded cards) with an editorial-cartographic system: Newsreader display serif + IBM Plex Sans UI + IBM Plex Mono numerics; sun-bleached prairie paper / deep ink palette; ember-red reserved exclusively for the LIVE auction state; §-section signs (§01–§04 + §00 admin); LOT cards with catalog numbering and legal land descriptors; teletype bid ledger; rotated notarial reserve stamp; cartographic RM map with compass rose, township grid, scale bar, and legend; masthead with edition strip; colophon footer.

Scope: `app/layout.tsx` (Google Fonts), `app/globals.css` (full rewrite — 16 numbered token sections), `app/components/FarmAuctionApp.tsx` (public surface), `app/bidder-terms/page.tsx` (§04), `app/admin/AdminConsole.tsx` (operator console). Data flow preserved verbatim — every API endpoint, request shape, EventSource handler, and `x-admin-key` header carries over unchanged.

Code review (general-purpose agent) caught: (1) `.floor .sec-head .title em` cascading prairie green onto dark ink → invisible "open ledger." italic — fixed by overriding with `var(--wheat)`; (2) new `rmHint` field was silently dropped by server zod schema — fixed by folding into `message` client-side as `"RM hint: …\n\n…"`; (3) masthead CTAs overflowed at <900px — fixed by hiding `.mast-actions .btn:not(.nav-toggle)`; (4) `Number("")` → NaN when bid input cleared — fixed by guarding with `Number.isFinite`; (5) lot numbers were reshuffling on docket filter — fixed with stable `Map<id, lotNumber>` derived once from full backend list; (6) Sync button could fire concurrent admin loads — fixed with `isSyncing` guard + disabled button while in-flight.

Wet-tested at 1440×900 against `npm run dev` on port 3002 (port 3000 was held by another project). All four surfaces (home, /bidder-terms/, /admin) render the Almanac vocabulary; `npx tsc --noEmit` clean. The API backend was not running during the test — empty-state markup validated end-to-end.

## Key Findings

- The Next config has `output: "export"` — `/api/*` is proxied at the Caddy layer (production) or hit on a separate Fastify port in dev. The frontend never carries server-side handlers; treat the React tree as a static client over a Fastify backend on PostgreSQL.
- LOT numbering is derived from the index in the full `backendListings` array, not the filtered docket. Filtering changes which cards are visible, but each lot's number is stable per the listing's position in the full inventory.
- The Almanac design language reserves **ember red (`#a93826`) exclusively for the LIVE auction state**. Don't reach for it for buttons, alerts, or status pills. Stamps use moss; pending uses wheat; sold uses mute-2; wanted uses soil; lease uses moss.
- Section signs (§) follow a global numbering: §00 admin · §01 Inventory · §02 Floor · §02·b Bidder portal · §03 Procurement · §03·a Brief · §04 Bidder terms. Keep this numbering stable; future sections add to the end.
- Google Fonts is loaded via `<link>` in `app/layout.tsx`. If we later want to self-host, switch to `next/font` (the static-export build is compatible).
- **`public/images/pasture.jpg` is a vegetable-market photo, not farmland.** Don't use it — the seed and frontend rotate only `hero-fields.jpg` (wheat at sunset), `harvest.jpg` (vineyard rows), and `satellite-fields.jpg`. Consider deleting or replacing pasture.jpg with an actual SK pasture photo.
- **Production admin key is in `/opt/farmauction/app/.env` on ovh2** as `ADMIN_API_KEY`. Pass via `x-admin-key` header. Public POSTs to `/api/contact-inquiries`, `/api/newsletter-signups`, `/api/auctions/:id/register`, and `/api/auctions/:id/bids` are unauthenticated.
- **Auction creation gotcha:** The admin form sets `opensAt = now + 15 minutes` by default. Even with `status: "open"`, the auctionService rejects bids while `now < opensAt`. To wet-test auctions immediately, either set opensAt in the past via the form OR UPDATE the row directly. The auction list endpoint hides `closed`/`settled` auctions but exposes `registration`/`open`/`paused`.
- **DB tables** (server/db/migrations): `agents`, `listings`, `listing_highlights`, `bidders`, `auctions`, `auction_bidder_authorizations` (NOT `bidder_auction_authorizations`), `bid_events` (NOT `bids`), `auction_events`, `post_auction_tasks`, `contact_inquiries`, `newsletter_signups`, `notification_outbox`, `schema_migrations`.
- **Listing slugs in the seed are stable** so re-running `npm run db:seed` upserts in place. Slugs: lipton-half-section, caron-north-quarter, vanscoy-three-quarter, coalfields-pasture, buckland-section, snipe-lake-wanted, eyebrow-quarter, edenwold-half-section, hudson-bay-pasture-lease, battle-river-quarter.
- **The `/listings/?slug=...` route is a single static page** that reads slug from `window.location.search` (no `useSearchParams` to keep static export simple). Linking is via query string, not dynamic segment.
