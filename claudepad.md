# Claudepad

## Session Summaries

### 2026-05-19 — Hero unified to one lot; §03 contact slimmed; agent portrait

Cameron yelled "WHY DO WE STILL HAVE EXTRANEOUS TEXT AND TWO CONTACT FORMS!" and "TELL A UNIFIED STORY GOD DAMN IT". Plus "look at ebay. ebay doesn't have so much extraneous bullshit." Two surgical fixes on the home page (`app/components/FarmAuctionApp.tsx` + `app/globals.css`):

- **Hero card.** Was mixing `featuredAuction` (DEMO · Lipton half-section) with `featuredListing` (first For-Sale, could be a different lot). Hardcoded title "Open ledger.", acres from `totalAcres` (sum across all 11 listings), generic `/images/lots/hero.png`. Pulled everything onto the auctioned lot via `featuredAuction.listing` (already nested on `ApiAuction`): image from `listing.image`, kicker `Auction · {listing.rm}`, title from `cleanAuctionTitle(auction.title)` (split-italics), Acres from `listing.acres`, replaced the Reserve/HighBid row with `Current bid` + `Closes In Nm`/`At HH:MM CST`. Coherent with the edition strip and the catalog. New `HeroCaption` helper component lives at FarmAuctionApp.tsx:255.
- **§03 Contact (`#procurement`).** Was: section head `Reach Cameron.` + lede, then a *second* h2 `Tell us what you have, or what you want.` + a *second* lede above the form, then a 6-field form, then a standalone `.newsletter` mini-form whose work was already done by the contact form's `consentNewsletter` checkbox (verified the `/api/contact-inquiries` handler fans out to `newsletter_signups` at server/index.ts ~ line 976). Cut both duplicate intros, cut the RM-hint field (folds into Details), dropped the standalone newsletter block + its handler/state, made textarea `rows={3}` with `min-height: 72px`, tightened form padding 22 → 18. Sole intro is now `§03 · Reach Cameron.` and the form sits to the right of a slim agent card.
- **Agent portrait.** Added a 96px square slot to the left of `.agent-meta`. Ships with a CW monogram (italic serif on `var(--ink)` — same look as the wordmark mark) because LinkedIn is auth-walled and I couldn't grab a public photo. New `.agent-portrait` + `.agent-monogram` rules in globals.css; mobile shrinks to 72px. To swap in a real headshot later: drop a file at `public/images/cameron.png` and replace the `<span class="agent-monogram">CW</span>` with an `<img>` (the slot already handles `object-fit: cover`).

Wet-tested locally: hero shows the lipton lot's painterly aerial with kicker "AUCTION · RM LIPTON NO. 217", title "Lipton half-section.", Acres 318, Current bid $800,000, Closes In 41 min — all from the same source. §03 has one h2, one form, agent card with the CW monogram. Submitted the form with `consentNewsletter` checked → confirmed rows in `contact_inquiries` (consent_newsletter=t) and `newsletter_signups`.

Tsx side of this revision was swept into upstream commit 4d0741b ("Seller land upload v2…") via an unrelated parallel commit; only the CSS work landed in the dedicated commit on top. Future archeologists: the hero+§03 JSX changes are in 4d0741b alongside the seller v2 work even though the commit message doesn't mention them.

### 2026-05-19 — Buyer hub: real navbar, self-service profile, status pill bugfix

Cameron flagged three issues on `/buyer`: should show the full home navbar at top, should let the buyer edit/submit info and see verification status, and the lede "What you're watching, what you've bid on…" was clutter. He also pointed out an "approved" pill was partially blocking the sign-out button.

- **SiteHeader extraction** (`app/components/SiteHeader.tsx`): moved the home's `<header class="mast">` into a reusable client component (props: `user`, `authStatus`, `onSignOut`, `onHome`, `highlightAuction`). FarmAuctionApp, /buyer, /seller all use it now. The home's anchor logic (`#inventory` vs `/#inventory`) is encoded as `onHome`. Sign-out button is rendered in the mast when `onSignOut` is provided (new `.mast-signout` CSS, ember color, monospace, underline on hover). Mobile nav toggle state moved inside SiteHeader.
- **Buyer page rewrite** (`app/buyer/page.tsx`): SiteHeader replaces hub-bar; dropped the lede; new "Your buyer info" card with form fields legal name / phone / entity-type select / mailing address that PATCHes `/api/me/bidder`. Verification status is rendered as a `.lot-status` pill in the card head plus a context-sensitive blurb (pending/approved/rejected). Form prefills from `summary.bidder`, falls back to `user.displayName` for legal name when no bidder row exists. Success message clears on any field edit so stale "Saved" doesn't sit next to a fresh error.
- **Seller page** (`app/seller/page.tsx`): hub-bar → SiteHeader. The explicit "Switch to buyer →" chip is gone — the SiteHeader nav still exposes Buyer/Seller links for `intent='both'` users so it's not a true regression.
- **New endpoint** `PATCH /api/me/bidder` (`server/index.ts:513`): upserts legal_name/phone/entity_type/mailing_address for the session user. Schema rejects empty legal name (min 2). `verification_status` is column-omitted so a client can't escalate. Hardened ON CONFLICT with `WHERE bidders.user_id IS NULL OR bidders.user_id = EXCLUDED.user_id` — if a bidder row exists under a different owner, the update returns no rows and the endpoint returns 409 instead of stomping it. `COALESCE(bidders.user_id, EXCLUDED.user_id)` still claims orphaned rows for the current user.
- **CSS pill fix** (`app/globals.css:4408`): root cause of the "approved partially blocks sign out" bug was `.lot-status` being `position: absolute` with no positioned ancestor inside `.hub-row` — it fell back to the viewport's initial containing block (top:14px, right:14px), landing on top of the sign-out button. Scoped override `.hub-row .lot-status, .hub-card-head .lot-status { position: static; … }` puts the pill back in flex flow at the row's right edge. Verified no regression against other `.lot-status` consumers (`.lot-media`, `.watch-card-media`, `.detail-head`, `.account-*` all have positioned ancestors and aren't matched by the new selector).
- **Test** (`server/tests/bidderProfile.ts`, `npm run test:bidder-profile`): signs up a user, PATCHes a new bidder row, attempts to tamper `verification_status` (stays pending), updates same row, fetches `/api/me/summary` to confirm round-trip, and the cross-owner collision case (pins the row's email to a second user, asserts that user's PATCH gets 409 — verifies the ON CONFLICT WHERE clause). Also covers 401 unauthenticated.
- **Wet-tested** locally via Chrome: signed in as a fresh `wetbuyer@example.invalid` with a seeded approved auction registration. Confirmed nav matches home (Wyatt mark, Lots/Auction/Contact/Buyer, name link + Sign out), no lede, info card with Approved pill, registrations row with APPROVED pill sitting inside the row (not on the nav), form save round-trip works.

Code-review feedback addressed: reverted accidental `next-env.d.ts` change (auto-generated by `next dev` vs `next build`); added the ON CONFLICT WHERE hardening + 409; added collision test; success-message clears on field edit.

Local dev requires `docker compose up -d db` + `npm run db:migrate` + `npm run db:seed`, then `npm run api:dev` + `npm run dev` on 3510 / 3000.

### 2026-05-18 — Homepage decluttering pass

Cameron pushed back on the home page being "cluttered" and "too many fucking words" — and on the editorial "file" metaphor, which read as filesystem-file to him as a developer. Surgical fix, no logic changes:

- **Masthead nav**: 4 items → 3 (`Lots / Auction / Contact`). Dropped "The Almanac" (id is still in the colophon footer, just no nav link).
- **Auth chip → text link**: Removed the multi-segment chip (display name + Admin console + My account + Sign out, or Sign in + Sign up). Replaced with a single small monospace text link: `Sign in` when logged out, `<displayName>` linking to `/account/` when logged in. New `.mast-auth` CSS rule (the stale `.auth-chip` rules remain in globals.css but no longer reference any markup). Also dropped the duplicate `Bring a file` + `Open auction` masthead CTAs — hero already has them.
- **"file" → "lot" / "listing" / "details"**: Replaced across `FarmAuctionApp.tsx` (lot card CTAs, empty states, §01 head, §03 head + form labels, footer columns, floor-quiet, contact-block lede) and `ListingDetail.tsx` (loading state, error state, sold inquiry header, back link). Backend `name="fileType"` form field unchanged because server zod schema expects it (`server/index.ts:91`).
- **X/100**: Stripped from the soil rating in lot card (`{listing.soilRating}` only) + listing detail stat. The bar visualization remains.
- **"X of X" bid ledger count**: `{bids.length} of {bids.length}` → `{bids.length} bid(s)`. Was a dead duplicate that read as broken.
- **Section ledes**: §01 trimmed to "Saskatchewan farmland — sale, lease, wanted, pending." §03 head + lede reworked to "Reach Cameron." / "Saskatchewan farmland — sale, lease, auction, or a property you're after." §02 (Auction Floor) left alone per Cameron's "the auction section itself looks okay".

Wet-tested on prod (`farmauction.discordwell.com`) post-deploy at 1440×900: edition strip + new masthead clean; lot cards show soil "62" not "62/100"; "VIEW LOT →" everywhere instead of "View file"; demo admin shows as a single subtle `DEMO ADMIN` link top-right; §01 "Open lots." renders with the trimmed lede.

Deploy: `npm run build` → `rsync -az --delete out/ ovh2:/opt/farmauction/site/`. No API change, so PM2 untouched. Local dev backend isn't bootable without Docker Postgres on :55432 (`docker compose up -d db` is the path) — for next session, either run Docker or `ssh -L 55432:127.0.0.1:55432 ovh2` to wet-test against prod DB.

### 2026-05-18 — Auth/login + data model (users, sessions, role-based admin/bidder)

Goal: from `x-admin-key`-only to a real auth system with admin + regular bidder roles for the demo.

1. **Migration 004_auth.sql.** New `users` (email unique, password_hash, role admin|user CHECK, display_name, last_login_at), `user_sessions` (token_hash unique sha256 of opaque base64url 32-byte token, expires_at, last_seen_at, user_agent), and `bidders.user_id` FK with ON DELETE SET NULL.

2. **`server/auth.ts`.** Node-crypto-only password hashing: `scrypt` cost 16384, 16-byte salt, 64-byte key, encoded `scrypt$cost$salt$hash`, `timingSafeEqual` verification with length guard. Opaque session tokens (`randomBytes(32).base64url`), stored only as sha256. Cookie attributes: `HttpOnly; SameSite=Lax; Path=/; Secure=config.cookieSecure`, 14-day TTL. `getSessionUser` reads + touches `last_seen_at` fire-and-forget. `requireAdmin` checks session-role first, then `x-admin-key` fallback for prod scripts; `requireUser` for bidder-only routes.

3. **Auth endpoints** (`server/index.ts`): `POST /api/auth/{signup,login,logout}`, `GET /api/auth/me`. Plus `GET /api/me/summary` returning `{ user, bidder, registrations, bids }` for the bidder dashboard — bidder match scoped `WHERE user_id = $1 OR (user_id IS NULL AND lower(email) = lower($2))` so already-claimed bidder files can't be hijacked across users by an email collision. Auction registration POST now records `bidders.user_id` when a session is present (auto-linking the bidder profile to the logged-in user). Added CORS `credentials: true` and an `assertSameOriginIfBrowserPost` Origin allowlist (against `config.corsOrigin`) on `/api/auctions/:id/{bids,register}` to mitigate CSRF since session cookies are now in play.

4. **Frontend.** Three parallel subagents:
   - `app/login/page.tsx` + `app/signup/page.tsx` (Almanac §05/§06, paper form + dark aside with seeded demo creds; `?next=` open-redirect guard requires leading `/` and rejects `//`).
   - `app/account/page.tsx` (§02·c bidder dashboard: profile pill, registrations w/ deposit + max bid, bid ledger with accepted/rejected). Redirects to `/login/?next=/account/` if not authed.
   - `app/admin/AdminConsole.tsx` rewritten: dropped the `apiKey` textbox + localStorage; redirects to `/login/?next=/admin/` if not authed; shows "Restricted" panel for non-admin role; fetches with `credentials: "include"` (no header).
   - Shared `app/lib/useAuth.ts` (`useAuth() → { user, status, refresh, signOut }`, `loginRequest`, `signupRequest`).
   - Masthead in `FarmAuctionApp.tsx`: auth chip with displayName/email + Sign out + My account + (admins) Admin console; "Sign in"/"Sign up" links when logged out; an invisible placeholder during loading to prevent layout shift.

5. **Seed.** `npm run db:seed` now upserts two demo accounts: `admin@farmauction.demo / admin12345` (admin) and `bidder@farmauction.demo / bidder12345` (user) BEFORE seeding listings.

6. **Next dev rewrite.** `next.config.mjs` adds `rewrites()` forwarding `/api/:path*` to `${NEXT_PUBLIC_API_ORIGIN ?? http://127.0.0.1:3510}` so the same-origin cookie story works in dev too; rewrites are dev-only when `output: "export"`, so prod build is unaffected (Caddy proxies `/api/*` at the edge).

Wet-tested end-to-end against dev: anon → masthead shows Sign in/Sign up; admin login → /admin loads with "Signed in · admin@…" header; non-admin → /admin shows "Restricted"; bidder dashboard renders profile + 1 registration + 1 accepted bid after full flow (create auction, register, approve via admin-key fallback, bid). Sign out clears cookie. Code-review subagent caught two issues that were fixed before commit: bidder auto-claim scoped to user_id IS NULL, and same-origin Origin check on the two mutating public POSTs.

Known limitations / future work: session rotation on password reset (not implemented — no reset endpoint exists yet); explicit prod seed should NOT run (`npm run db:seed` would overwrite admin password to the demo value).

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

- **Auth model:** `users(role admin|user)` + `user_sessions` (opaque token; sha256 stored). Cookie `farmauction_session` HttpOnly, SameSite=Lax, Secure tied to `config.cookieSecure` (default = `NODE_ENV === "production"`). Bidder profiles link to users via `bidders.user_id`, auto-linked on auction registration when a session is present. `requireAdmin` checks session role first, then legacy `x-admin-key` as a server-script fallback. **Do NOT run `npm run db:seed` on prod** — it overwrites the admin password to the demo value (`admin12345`); the seed exists for the demo only.
- **Same-origin POST guard:** `/api/auctions/:id/{bids,register}` reject browser POSTs whose `Origin` header isn't in `config.corsOrigin`. Server-to-server callers (no Origin header) pass through.
- **`/api/me/summary` bidder match** is scoped to `user_id = $1 OR (user_id IS NULL AND lower(email) = lower($2))` — already-claimed bidder rows cannot be hijacked across users by an email collision.
- **Next dev API proxy:** `next.config.mjs` rewrites `/api/:path*` → `${NEXT_PUBLIC_API_ORIGIN ?? http://127.0.0.1:3510}`. This is dev-only with `output: "export"`; prod relies on Caddy to proxy `/api/*` on the same origin.
- **308 trailing-slash redirect quirk:** Next's `trailingSlash: true` 308-redirects every `POST /api/foo` to `/api/foo/`. Browsers follow 308 with method+body intact, so it works; if you ever swap to a less compliant client, fetch will lose the body.
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
