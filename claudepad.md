# Claudepad

## Session Summaries

### 2026-06-17 20:08 UTC — Close the sealed-auction public confidentiality gap (pure module + unit suite)

Automated maintenance pass (local-only, no deploy). Acted on the standing Key-Finding TODO: **sealed
auctions leaked bids on public surfaces.** `auction_type:"sealed"` is supported by the schema +
`placeBid` (inserts the bid, fires `sealed_bid.accepted`) but no read path distinguished it from a
live open-outcry, so a sealed auction's confidential bids (amount + bidder legal name) were publicly
readable. Continued the established "pull the decision into a pure, side-effect-free, zero-infra-
testable module" trajectory (same shape as `bidRules`/`listingFilter`).

New `server/bidVisibility.ts` — the single gate, decided purely on `auctionType`, applied to **every
public surface that could expose sealed bid/high-bid data**:

1. **`GET /api/auctions/:id/bids`** → new `getPublicBidHistory` (auctionService): empty list for sealed,
   full ledger for live. Preserves the prior 200-empty response for an unknown auction id.
2. **`GET /api/auctions/:id`** → `getAuction` now wraps its bundled `bidHistory` in `publicBidHistory`
   (same gate).
3. **Accepted-bid SSE** (`POST /api/auctions/:id/bids`) → `publicBidAcceptedEvent`: live publishes the
   full `bid.accepted` result as before; sealed publishes a **contentless `sealed_bid.accepted`** (only
   `{auctionId}` — no amount, alias, or bidder id), mirroring the DB event `placeBid` already writes.
4. **`auction.closed` SSE** (`POST /api/admin/auctions/:id/close`) → `publicAuctionClosedAuction` blanks
   the high-bid fields (`currentHigh*`, `reserveMet`) for sealed before broadcast. The events stream is
   public; this was flagged by a leak-hunting review agent as the one public surface my first three
   fixes missed. No-op on today's data (sealed `current_high_*` are always 0/null — see gap below) but
   defense-in-depth for the deferred sealed-reveal feature. The operator's authenticated close response
   and the won/lost emails keep the raw values.

**Behavior-preserving for LIVE auctions (the only type used today):** all four gates are the identity
for non-sealed — `publicBidHistory(live, bids)` returns `bids`; `publicBidAcceptedEvent(live)` returns
the exact prior `{event:"bid.accepted", payload:result}`; `publicAuctionClosedAuction(live)` returns
the input untouched (byte-identical JSON). Two independent review agents confirmed: (1) live path fully
preserved with file:line evidence; (2) the close-broadcast leak, now also closed.

New `server/tests/unit/bidVisibility.test.ts`: 15 tests incl. confidentiality regression guards that
`JSON.stringify` the sealed projections and assert the secret amount/alias/bidder-id do **not** appear.
Suite now **83/83** (was 68).

**Verified:** `npm run test:unit` 83/83, `npx tsc --noEmit` (frontend) + `-p tsconfig.api.json` (API)
clean, `npm run api:build` clean. **NOT live/wet-tested** — port 55432 is the prod-DB ssh tunnel and no
deploy; the change is server logic with no DB schema change. No sealed-auction UI is wired (demo
auctions are all `live`), so this is latent-feature hardening, not a live-traffic fix.

**Remaining sealed gap (still deferred, needs a DB + product semantics):** `placeBid`'s sealed branch
never updates `current_high_*`, so closing a sealed auction computes no winner and sends no won/lost
emails. Defining sealed winner-selection + the reveal flow (which losing bids, if any, become public
after close) is the next pass — and `publicAuctionClosedAuction` must stay in place once it lands.

### 2026-06-17 13:54 UTC — Extract inventory filter/sort to a tested module + fix ppa-asc NULLS-LAST divergence

Automated maintenance pass (local-only, no deploy). Continued the "pull pure logic out so it's
documented + zero-infra testable" trajectory (same shape as the 2026-06-17 bidRules extraction), this
time on the **frontend's primary browse surface**. The §01 inventory's filter+sort was an inline
~35-line `useMemo` inside `FarmAuctionApp.tsx` (`filteredListings`) with **no tests** — the home page
fetches every published listing once and does all filtering/sorting client-side, so that block is the
authoritative browse logic.

Pulled it into a new side-effect-free `app/lib/listingFilter.ts` (`selectListings`, `sortListings`,
`listingMatchesFilters`, types `ListingLike`/`ListingFilterCriteria`/`ListingSortKey`) and rewired the
component to call it — **behavior-preserving except one deliberate fix**:

- **`ppa-asc` (price low → high) now sorts unpriced lots LAST**, matching the server's
  `price_per_acre_cents ASC NULLS LAST` (`sortClauses` in server/index.ts). The latent bug: a NULL
  `price_per_acre_cents` is serialized to `pricePerAcre === 0` client-side (`centsToDollars(null) = 0`),
  so the old `a - b` floated every $0 lot (unpriced "Wanted" lots, seller drafts with no target price)
  to the TOP of "low → high". `priceAscKey` maps a non-positive price to `+Infinity`. Latent on the
  current fixture data (all 10 lots are priced), reachable as soon as a $0 lot is published. The other
  three sort modes (`ppa-desc`/`acres-desc`/`soil-desc`) already put 0 last under descending order, so
  no change there.
- Tied `SORT_OPTIONS` to `ListingSortKey` (`ReadonlyArray<{value: ListingSortKey; label}>`, dropped the
  `as const` self-derivation) so the dropdown can't drift from the sorter — adding a key the switch
  doesn't handle is now a compile error.

New `app/lib/listingFilter.test.ts`: 16 tests (filter predicates incl. the "All" status bypass and the
`!value` empty-bound guard; every sort mode; the unpriced-last regression guard + a multi-unpriced
stability case; non-mutation of input; `selectListings` composition). `test:unit` glob extended to
`server/tests/unit/*.test.ts app/lib/*.test.ts` — these are the **first tests of any frontend logic**,
in the same node:test/tsx zero-infra harness (the module imports nothing, so the dummy `DATABASE_URL`
prefix is inert). Suite now **68/68** (was 52).

**Verified:** `npm run test:unit` 68/68, `npx tsc --noEmit` (frontend) clean, `npx tsc --noEmit -p
tsconfig.api.json` clean, `npm run build` (static export) clean — the `.test.ts` under `app/lib/` does
NOT become a route and doesn't break the export (23 pages, same as before). Two independent
code-review finder agents (behavior-preservation + cross-file integration) found **zero** correctness
or integration bugs. **NOT live/wet-tested** — port 55432 is still the prod-DB ssh tunnel (lsof showed
`ssh` listening), and no deploy; the change is pure client logic with no API surface touched. Next
session with a real browser: confirm the §01 dropdown visually once a $0 lot exists.

### 2026-06-17 — Extract pure bid rules from placeBid + unit suite (zero-infra)

Automated maintenance pass (local-only, no deploy). The single highest-risk untested code in the
repo was the money path: `placeBid`'s bid-acceptance decision logic lived inline, tangled with DB
access, so the 2026-06-11 unit suite couldn't reach it. Pulled the four pure decisions out into a new
side-effect-free `server/bidRules.ts` and rewired `placeBid` to call them — **behavior-preserving,
verified by exact equivalence**:

1. `minimumLiveBidCents(currentHigh, increment)` — `currentHigh > 0 ? currentHigh + inc : inc`. Same
   value the public auction page computes for its "minimum next bid" hint (client/server agree).
2. `isAuctionOpenForBids({status, nowMs, opensAtMs, closesAtMs})` — De Morgan of the old reject guard
   `status !== "open" || now < opensAt || now > closesAt`; both window boundaries inclusive.
3. `exceedsMaxBid(amount, maxCents|null)` — null ceiling = no limit; cap is inclusive (equal is OK).
4. `capturePreviousHighBid(bidderId|null, cents)` — the displaced-bidder capture from under the
   `FOR UPDATE` lock (the 2026-06-11 outbid-correctness fix), now named + tested. `PreviousHighBid`
   type moved here; re-exported from auctionService for back-compat.

New `server/tests/unit/bidRules.test.ts`: 15 tests covering opening-bid floor, negative-guard,
window boundaries (inclusive), zero-ceiling-is-a-real-limit, strictly-above rejection, opening bid
displaces no one. Suite is now **52/52** (was 37).

**Verified:** `npm run test:unit` 52/52 green, `npx tsc --noEmit -p tsconfig.api.json` clean, `npm run
api:build` clean. No frontend touched (no `next build` needed). **NOT live-tested** — per the
standing note, local port 55432 is the prod-DB ssh tunnel, so DB-backed lanes
(`test:bidder-profile`, `test:smoke`) stay off-limits; the change is a pure refactor whose tests run
without any DB. Next session with a real local DB: a `placeBid` integration test could now assert the
rejection reasons against these named rules.

### 2026-06-11 — Backend correctness/security pass + first zero-infra unit suite

Automated maintenance pass (no human at the wheel; local-only, no deploy). Four backend fixes plus a new test lane:

1. **Bidder ownership stomp (security).** `POST /api/auctions/:id/register` upserted `user_id = COALESCE(EXCLUDED.user_id, bidders.user_id)` — a logged-in user registering with someone else's email re-owned that bidder row, vanishing the victim's registrations/bids from `/api/me/summary` and surfacing them under the attacker's account. Flipped to `COALESCE(bidders.user_id, EXCLUDED.user_id)` (first-claim-wins), matching the hardened `PATCH /api/me/bidder` semantics that bidderProfile.ts already pins.
2. **Outbid notices now authoritative.** `placeBid` captures the displaced high bidder from the `FOR UPDATE` auction row before overwriting (`previousHighBid` on the result, typed `PreviousHighBid` in auctionService.ts) instead of the route's old "highest accepted bid by someone else" heuristic, which re-notified stale bidders on self-raises. Route also: skips outbid emails on demo auctions (seeded @farmauction.demo recipients would bounce/clutter the outbox), and gates ALL side effects (SSE publish, ops email, outbid notice) on `!result.duplicate` — idempotent replays of an accepted bid used to re-publish `bid.accepted` to every open EventSource and re-email ops. `placeBid` has an explicit `PlaceBidResult` return type (a forgotten field on a new branch is now a compile error); `serializeAuction` exposes `isDemo` on every auction payload (additive; frontend ignores it).
3. **Timing-safe admin key.** `requireAdmin` compared `x-admin-key` with `===`; new `constantTimeEquals` (sha256-then-timingSafeEqual, length-hiding) in auth.ts.
4. **Email HTML injection.** All six HTML email bodies interpolated `bidderName` (public form input, no charset restriction), `auctionTitle`, `operatorNotes` raw — a crafted legal name could smuggle phishing markup into mail from the trusted sender (registration confirmations go to any email you type). New exported `escapeHtml` in emailTemplates.ts applied to every user-supplied interpolation; plain-text bodies intentionally left raw.
5. **`npm run test:unit`** — `tsx --test server/tests/unit/*.test.ts` (node:test), 37 tests / zero infra: emailTemplates escaping, serializers (cents round-trip incl. pg-bigint strings, N/W coordinate formatting, reserveMet edges, isDemo coercion), auth (parseCookies edge cases, scrypt round-trip + malformed encodings, constantTimeEquals). Script inlines a dummy `DATABASE_URL` pointing at port 9 so config.ts never throws and nothing can accidentally connect (pg.Pool is lazy — fine to import).
6. **Max-effort /code-review round (9 finder angles + sweep) before commit.** Three confirmed findings, all fixed: (a) admin close on a demo auction emailed won/lost to fake demo bidders — close route now gates on `payload.auction.isDemo`; (b) five `null as PreviousHighBid` casts + an `"duplicate" in result` guard were type-fragility — replaced with the explicit `PlaceBidResult`; (c) unit test hardcoded `"$800,000"` which can flake on small-ICU Node builds — now computes expected via the same `Intl.NumberFormat` call. Refuted/deferred: plain-text email escaping (not HTML — intentional), Promise.all on outbid queries (throttle depends on the bidder lookup's email), moving notification logic out of the route (single bid entry point today), shared SQL helper for the two bidder upserts (the upserts differ materially), POSIX-only inline env var in the npm script (Windows not a target).

**Verified:** `npx tsc --noEmit` clean, `npm run api:build` clean, `npm run build` (static export) clean, 36/36 unit tests green. **NOT live-tested** — port 55432 was an active **ssh tunnel** (lsof showed `ssh` listening, i.e. the prod-DB tunnel pattern from the 2026-05-18 note), so DB-backed tests were off limits this pass; Docker was unavailable. The two SQL-semantics changes are one-token COALESCE flips mirrored from the already-live-tested PATCH endpoint. Next session with a real local DB: run `npm run test:bidder-profile` and consider a register-flow regression test for the ownership fix.

### 2026-05-19 — Wire ~15 dead/decorative elements; SiteHeader on detail pages

Cameron audited the top of `/` and asked "which of these ACTUALLY DO ANYTHING?" — answered, then "do it" + "then check the rest of the site. Same methodology" + "all 5". Five problems and their fixes:

1. **Edition strip + hero byline (already shipped earlier in session).** "North Caron quarter · closes in N min" → `#floor`. "Avg $/ac N" → `#inventory?sort=ppa-asc`. "Acres listed N" → `#inventory`. Hero byline "Cameron Wyatt · Saskatchewan REALTOR®" → `#procurement`. New helper introduced inline; later lifted out.

2. **Footer Sold/Wanted broken.** `<a href="#inventory?status=Sold">` and `…?status=Wanted` — browsers can't resolve a hash with a query string to an element id, so the status filter applied (via the hashchange listener) but no scroll happened. Replaced with `anchorJump` helper calls that update history, dispatch hashchange, AND scroll to the element by id.

3. **`/auctions` catalog + detail used old `hub-bar` instead of SiteHeader.** Lost full nav, user pill, sign out. Replaced both `CatalogView` and `AuctionDetail` (3 hub-bar instances — loading state, error state, main render) with `<SiteHeader user authStatus onSignOut highlightAuction>`. Added small `.auction-page-crumb` ("All auctions →") above the hero on detail view to preserve the cross-link.

4. **Stat tiles dead.**
   - Home `.stat-rail` 4 cells (Listings/Acres/Auctions/High bid) → anchors to `#inventory`/`#floor`.
   - `/buyer` `.hub-stat` 4 tiles (Saved/Bids/Registrations/Verification) → anchors to `#watchlist`/`#bids`/`#registrations`/`#buyer-info` (added matching ids to the four `<section className="hub-card">` blocks).
   - `/seller` `.hub-stat` 2 tiles (Listings/Inquiries) → anchors to `#my-listings`/`#my-inquiries`.
   - All `<div>` → `<a>`; new CSS rules: `a.cell` and `a.hub-stat` (color inherit, no underline, hover background + ember val).

5. **RM map legend dead.** The 6 legend rows next to the map (For sale/Pending/Sold/Wanted/Lease/Live now) looked clickable, weren't. Converted to anchors using `anchorJump` with the appropriate `status` param; "Live now" → `#floor` since the status-filter equivalent doesn't exist. New `.legend a.item` hover styling.

**Listing detail page (`/listings/[slug]`)** also restructured: replaced custom inline mast (lines 111-131 of `ListingDetail.tsx`) with `<SiteHeader>`. Edition strip rewired:
- Left: "← All listings" → `/#inventory` (was "← Wyatt Farmland Auctions")
- Center: `{listing.rm} — see more` → `/?q={rm}#inventory` (was dead text). The URL state reader on home reads `q` from `window.location.search`, applies the search filter, and the hash scrolls — verified the round-trip: clicking the lot's "RM Lipton No. 217 — see more" → landed on home with search input populated and filteredCount=1.
- Right: `{listing.region}` → `/?region={region}#inventory` (was "All listings").

**Shared helper** `app/lib/anchorJump.ts`. Module-level function (no React state) so RmMap, ListingDetail, and main app can all import. Signature: `anchorJump(event, "#target", params?)`. Calls `preventDefault`, `history.replaceState`, dispatches `HashChangeEvent`, then `window.scrollTo({top: elTop, behavior: 'smooth'})`. Pure imperative scroll instead of `scrollIntoView` because the latter raced with CSS `scroll-behavior: smooth` on `html` and stalled at 0 in Chrome.

**Wet-test artifact noted:** In the Chrome MCP automation harness, requestAnimationFrame is frozen, so smooth scrolls never animate (`scrollY` stays 0). Hash + filter state changes are observable and correct; visual scroll only confirms in a real browser. Don't trust `scrollY` measurements in the harness; trust `location.hash` and observable state instead.

Files: `app/lib/anchorJump.ts` (new), `app/components/FarmAuctionApp.tsx`, `app/auctions/page.tsx`, `app/auctions/AuctionDetail.tsx`, `app/listings/ListingDetail.tsx`, `app/buyer/page.tsx`, `app/seller/page.tsx`, `app/globals.css`. 244 insertions / 132 deletions across 7 files + 1 new file.

Deploy: `npm run build` → `rsync -az --delete out/ ovh2:/opt/farmauction/site/`. Smoke-tested all routes (200). No API surface changed — PM2 untouched.

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
- **Inventory filter/sort is a pure module:** `app/lib/listingFilter.ts` (`selectListings`/`sortListings`/`listingMatchesFilters`), unit-tested, imported by `FarmAuctionApp`. It MUST stay in agreement with the server's `sortClauses` (server/index.ts). The home page never sends `?sort=`/filter params — it fetches all published listings once and selects client-side — so this module, not the SQL, is what users actually see. Notably `ppa-asc` puts unpriced lots last (client `pricePerAcre === 0` ⇔ server `NULLS LAST`). If you add a sort mode, add it to both `LISTING_SORT_KEYS` and the server `sortClauses`.
- **Sealed-auction public confidentiality — GATED (2026-06-17).** The read-path leaks are closed by `server/bidVisibility.ts`, the single `auctionType`-based gate over every public surface: `getPublicBidHistory` (the `/api/auctions/:id/bids` route) and `getAuction`'s bundled history return `[]` for sealed; the accepted-bid SSE publishes a contentless `sealed_bid.accepted` (only `{auctionId}`) instead of the full `bid.accepted`; the `auction.closed` SSE blanks `current_high_*`/`reserveMet` for sealed via `publicAuctionClosedAuction`. All four are the identity for live (byte-identical behavior). Unit-tested (`server/tests/unit/bidVisibility.test.ts`, incl. stringify-and-assert-absent leak guards). If you add a public surface that returns bid or high-bid data, route it through `bidVisibility` too. Admin/operator surfaces (`requireAdmin`) and the operator close response intentionally read the RAW accessors (`getBidHistory`, full `payload`).
- **Sealed auctions still incomplete — winner selection (FUTURE PASS, needs a DB + product semantics).** `placeBid`'s sealed branch inserts the bid + fires `sealed_bid.accepted` but **never updates `current_high_*`**, so closing a sealed auction computes no winner and sends no won/lost emails. The intended sealed-reveal semantics aren't defined in code (which losing bids, if any, become public after close). No sealed-auction UI is wired (demo auctions are all `live`), so it's latent. When implementing: keep the `bidVisibility` gates in place — `publicAuctionClosedAuction` exists precisely so a freshly-computed sealed winner doesn't leak over the public close-broadcast.
