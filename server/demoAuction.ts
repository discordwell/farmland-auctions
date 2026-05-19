import { randomUUID } from "node:crypto";

import { withTransaction } from "./db/pool.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const DEMO_LISTING_SLUG = "lipton-half-section";
const DEMO_AUCTION_TITLE_PREFIX = "DEMO";
const STARTING_BID_CENTS = 70_000_000; // $700,000
const BID_INCREMENT_CENTS = 2_500_000; // $25,000
const RESERVE_PRICE_CENTS = 95_000_000; // $950,000
const SOFT_CLOSE_SECONDS = 60;

const DEMO_BIDDERS: ReadonlyArray<{ email: string; alias: string }> = [
  { email: "demo-bidder-lakeview@farmauction.demo", alias: "Lakeview Holdings" },
  { email: "demo-bidder-falcon@farmauction.demo", alias: "Falcon Ag Co." },
  { email: "demo-bidder-battlefield@farmauction.demo", alias: "Battlefield Farms" },
  { email: "demo-bidder-riverbend@farmauction.demo", alias: "Riverbend Trust" }
];

let resetTimer: NodeJS.Timeout | null = null;

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

export async function ensureDemoAuction(now: Date = new Date()): Promise<void> {
  await withTransaction(async (client) => {
    const listingResult = await client.query<{ id: string; title: string }>(
      "SELECT id, title FROM listings WHERE slug = $1 LIMIT 1",
      [DEMO_LISTING_SLUG]
    );
    if (!listingResult.rowCount) {
      console.warn(`[demo] no listing with slug ${DEMO_LISTING_SLUG}; skipping demo auction setup`);
      return;
    }
    const listing = listingResult.rows[0];

    // Ensure demo bidders + an auction shell exist.
    const bidderIds: string[] = [];
    for (const seed of DEMO_BIDDERS) {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM bidders WHERE lower(email) = lower($1)",
        [seed.email]
      );
      if (existing.rowCount) {
        bidderIds.push(existing.rows[0].id);
        await client.query(
          "UPDATE bidders SET legal_name = $1, verification_status = 'approved', updated_at = now() WHERE id = $2",
          [seed.alias, existing.rows[0].id]
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO bidders (email, legal_name, verification_status)
           VALUES (lower($1), $2, 'approved')
           RETURNING id`,
          [seed.email, seed.alias]
        );
        bidderIds.push(inserted.rows[0].id);
      }
    }

    // Find the demo auction (if any).
    const auctionResult = await client.query<{
      id: string;
      opens_at: string;
      closes_at: string;
    }>(
      `SELECT id, opens_at, closes_at FROM auctions WHERE is_demo = true ORDER BY created_at DESC LIMIT 1`
    );

    let auctionId: string;
    const needsRefresh =
      !auctionResult.rowCount ||
      new Date(auctionResult.rows[0].closes_at).getTime() <= now.getTime();

    const opensAt = needsRefresh ? new Date(now.getTime() - 30 * 60 * 1000) : new Date(auctionResult.rows[0].opens_at);
    const closesAt = needsRefresh ? new Date(now.getTime() + SIX_HOURS_MS) : new Date(auctionResult.rows[0].closes_at);

    if (!auctionResult.rowCount) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO auctions (
           listing_id, title, status, auction_type, opens_at, closes_at,
           soft_close_seconds, bid_increment_cents, reserve_price_cents,
           reserve_visibility, current_high_bid_cents, version, is_demo
         )
         VALUES ($1, $2, 'open', 'live', $3, $4, $5, $6, $7, 'met-only', 0, 0, true)
         RETURNING id`,
        [
          listing.id,
          `${DEMO_AUCTION_TITLE_PREFIX} · ${listing.title}`,
          opensAt,
          closesAt,
          SOFT_CLOSE_SECONDS,
          BID_INCREMENT_CENTS,
          RESERVE_PRICE_CENTS
        ]
      );
      auctionId = inserted.rows[0].id;
    } else {
      auctionId = auctionResult.rows[0].id;
      if (needsRefresh) {
        // Wipe prior history then reset window forward.
        await client.query(
          "UPDATE auctions SET current_high_bid_id = NULL, current_high_bidder_id = NULL, current_high_bid_cents = 0, status = 'open', version = 0, opens_at = $1, closes_at = $2, updated_at = now() WHERE id = $3",
          [opensAt, closesAt, auctionId]
        );
        await client.query("DELETE FROM bid_events WHERE auction_id = $1", [auctionId]);
        await client.query("DELETE FROM auction_events WHERE auction_id = $1", [auctionId]);
      }
    }

    // Authorize every demo bidder (idempotent).
    for (const bidderId of bidderIds) {
      await client.query(
        `INSERT INTO auction_bidder_authorizations (auction_id, bidder_id, status, deposit_status, terms_accepted_at)
         VALUES ($1, $2, 'approved', 'verified', now())
         ON CONFLICT (auction_id, bidder_id) DO UPDATE SET
           status = 'approved',
           deposit_status = 'verified',
           updated_at = now()`,
        [auctionId, bidderId]
      );
    }

    // Also approve the human Demo Buyer so the signed-in demo can actually place a bid.
    const demoBuyerUser = await client.query<{ email: string }>(
      "SELECT email FROM users WHERE email = 'buyer@farmauction.demo' LIMIT 1"
    );
    if (demoBuyerUser.rowCount) {
      const buyerEmail = demoBuyerUser.rows[0].email;
      const buyerBidder = await client.query<{ id: string }>(
        "SELECT id FROM bidders WHERE lower(email) = lower($1)",
        [buyerEmail]
      );
      let buyerBidderId: string;
      if (buyerBidder.rowCount) {
        buyerBidderId = buyerBidder.rows[0].id;
        await client.query(
          "UPDATE bidders SET legal_name = COALESCE(NULLIF(legal_name, ''), 'Demo Buyer'), verification_status = 'approved', updated_at = now() WHERE id = $1",
          [buyerBidderId]
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO bidders (email, legal_name, verification_status)
           VALUES ($1, 'Demo Buyer', 'approved')
           RETURNING id`,
          [buyerEmail]
        );
        buyerBidderId = inserted.rows[0].id;
      }
      await client.query(
        `INSERT INTO auction_bidder_authorizations (auction_id, bidder_id, status, deposit_status, terms_accepted_at)
         VALUES ($1, $2, 'approved', 'verified', now())
         ON CONFLICT (auction_id, bidder_id) DO UPDATE SET
           status = 'approved',
           deposit_status = 'verified',
           updated_at = now()`,
        [auctionId, buyerBidderId]
      );
    }

    // Seed mock bid history when the auction is freshly opened (no bids yet).
    const existingBidCount = await client.query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM bid_events WHERE auction_id = $1",
      [auctionId]
    );
    const hasBids = asNumber(existingBidCount.rows[0]?.n ?? 0) > 0;

    if (!hasBids) {
      let runningHigh = STARTING_BID_CENTS - BID_INCREMENT_CENTS;
      let runningVersion = 0;
      let lastBidId: string | null = null;
      let lastBidderId: string | null = null;

      const seededCount = Math.min(4, bidderIds.length);
      for (let i = 0; i < seededCount; i += 1) {
        const bidder = bidderIds[i];
        runningHigh += BID_INCREMENT_CENTS;
        runningVersion += 1;
        const minutesAgo = (seededCount - i) * 7 + 3; // 31, 24, 17, 10 minutes ago
        const createdAt = new Date(now.getTime() - minutesAgo * 60 * 1000);
        const idempotencyKey = `demo-${runningVersion}-${randomUUID()}`;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO bid_events (
             auction_id, bidder_id, amount_cents, bid_type, idempotency_key,
             accepted, auction_version, created_at
           )
           VALUES ($1, $2, $3, 'live', $4, true, $5, $6)
           RETURNING id`,
          [auctionId, bidder, runningHigh, idempotencyKey, runningVersion, createdAt]
        );
        lastBidId = inserted.rows[0].id;
        lastBidderId = bidder;
      }

      await client.query(
        "UPDATE auctions SET current_high_bid_id = $1, current_high_bidder_id = $2, current_high_bid_cents = $3, version = $4, updated_at = now() WHERE id = $5",
        [lastBidId, lastBidderId, runningHigh, runningVersion, auctionId]
      );
    }
  });
}

export function scheduleDemoLoop(intervalMs: number = SIX_HOURS_MS) {
  if (resetTimer) clearInterval(resetTimer);
  resetTimer = setInterval(() => {
    ensureDemoAuction().catch((error) => {
      console.error("[demo] reset failed", error);
    });
  }, intervalMs);
  // Allow process to exit even with timer pending.
  if (typeof resetTimer.unref === "function") resetTimer.unref();
}

export function stopDemoLoop() {
  if (resetTimer) {
    clearInterval(resetTimer);
    resetTimer = null;
  }
}
