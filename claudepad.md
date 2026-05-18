# Claudepad

## Session Summaries

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
