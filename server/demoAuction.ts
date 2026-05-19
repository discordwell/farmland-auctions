import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { withTransaction } from "./db/pool.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SOFT_CLOSE_SECONDS = 120; // CLHbid-style 2-minute anti-snipe extension
const ROTATE_HEAD_START_MS = 30 * 60 * 1000; // after a rotation, auction "opened" 30 min ago

type DemoBidderSeed = { email: string; alias: string };

const DEMO_BIDDERS: ReadonlyArray<DemoBidderSeed> = [
  { email: "demo-bidder-lakeview@farmauction.demo", alias: "Lakeview Holdings" },
  { email: "demo-bidder-falcon@farmauction.demo", alias: "Falcon Ag Co." },
  { email: "demo-bidder-battlefield@farmauction.demo", alias: "Battlefield Farms" },
  { email: "demo-bidder-riverbend@farmauction.demo", alias: "Riverbend Trust" },
  { email: "demo-bidder-drumheller@farmauction.demo", alias: "Drumheller Land Co." },
  { email: "demo-bidder-aspen@farmauction.demo", alias: "Aspen Grove Partners" },
  { email: "demo-bidder-coulee@farmauction.demo", alias: "Coulee Bridge LLP" },
  { email: "demo-bidder-northgate@farmauction.demo", alias: "Northgate Holdings" },
  { email: "demo-bidder-quill@farmauction.demo", alias: "Quill Plains Farms" }
];

type DemoConfig = {
  listingSlug: string;
  startingBidCents: number;
  incrementCents: number;
  reserveCents: number;
  windowMs: number;
  initialOpenOffsetMs: number; // only used on first creation, to stagger the demo
  bidderEmails: string[]; // subset of DEMO_BIDDERS, in seed order
  seedBidCount: number;
};

const DEMO_CONFIGS: ReadonlyArray<DemoConfig> = [
  {
    // Closing-soon — feels urgent
    listingSlug: "lipton-half-section",
    startingBidCents: 70_000_000,
    incrementCents: 2_500_000,
    reserveCents: 95_000_000,
    windowMs: SIX_HOURS_MS,
    initialOpenOffsetMs: 4 * 60 * 60 * 1000, // started 4h ago → 2h to close
    bidderEmails: [
      "demo-bidder-lakeview@farmauction.demo",
      "demo-bidder-falcon@farmauction.demo",
      "demo-bidder-battlefield@farmauction.demo",
      "demo-bidder-riverbend@farmauction.demo"
    ],
    seedBidCount: 5
  },
  {
    // Mid-cycle
    listingSlug: "caron-north-quarter",
    startingBidCents: 18_000_000,
    incrementCents: 1_000_000,
    reserveCents: 24_000_000,
    windowMs: SIX_HOURS_MS,
    initialOpenOffsetMs: 90 * 60 * 1000, // started 1.5h ago → 4.5h to close
    bidderEmails: [
      "demo-bidder-drumheller@farmauction.demo",
      "demo-bidder-aspen@farmauction.demo",
      "demo-bidder-coulee@farmauction.demo"
    ],
    seedBidCount: 3
  },
  {
    // Fresh — feels new
    listingSlug: "buckland-section",
    startingBidCents: 42_000_000,
    incrementCents: 1_500_000,
    reserveCents: 56_000_000,
    windowMs: SIX_HOURS_MS,
    initialOpenOffsetMs: 30 * 60 * 1000, // started 30 min ago → 5.5h to close
    bidderEmails: [
      "demo-bidder-northgate@farmauction.demo",
      "demo-bidder-quill@farmauction.demo"
    ],
    seedBidCount: 2
  }
];

let resetTimer: NodeJS.Timeout | null = null;

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

async function ensureBidder(
  client: PoolClient,
  seed: DemoBidderSeed
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    "SELECT id FROM bidders WHERE lower(email) = lower($1)",
    [seed.email]
  );
  if (existing.rowCount) {
    await client.query(
      "UPDATE bidders SET legal_name = $1, verification_status = 'approved', updated_at = now() WHERE id = $2",
      [seed.alias, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO bidders (email, legal_name, verification_status)
     VALUES (lower($1), $2, 'approved')
     RETURNING id`,
    [seed.email, seed.alias]
  );
  return inserted.rows[0].id;
}

async function authorizeBidder(
  client: PoolClient,
  auctionId: string,
  bidderId: string
) {
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

async function ensureOneDemoAuction(
  client: PoolClient,
  config: DemoConfig,
  bidderIdByEmail: Map<string, string>,
  demoBuyerBidderId: string | null,
  now: Date
): Promise<void> {
  const listingResult = await client.query<{ id: string; title: string }>(
    "SELECT id, title FROM listings WHERE slug = $1 LIMIT 1",
    [config.listingSlug]
  );
  if (!listingResult.rowCount) {
    console.warn(`[demo] no listing with slug ${config.listingSlug}; skipping`);
    return;
  }
  const listing = listingResult.rows[0];

  const auctionResult = await client.query<{
    id: string;
    opens_at: string;
    closes_at: string;
  }>(
    `SELECT id, opens_at, closes_at FROM auctions
     WHERE is_demo = true AND listing_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [listing.id]
  );

  const existing = auctionResult.rows[0] ?? null;
  const needsRefresh =
    !existing || new Date(existing.closes_at).getTime() <= now.getTime();

  // First creation: use config's initial-stagger offset.
  // Rotation: use a small head-start so the ledger doesn't look weird.
  const openOffsetMs = existing ? ROTATE_HEAD_START_MS : config.initialOpenOffsetMs;
  const opensAt = new Date(now.getTime() - openOffsetMs);
  const closesAt = new Date(opensAt.getTime() + config.windowMs);

  let auctionId: string;
  if (!existing) {
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
        `DEMO · ${listing.title}`,
        opensAt,
        closesAt,
        SOFT_CLOSE_SECONDS,
        config.incrementCents,
        config.reserveCents
      ]
    );
    auctionId = inserted.rows[0].id;
  } else {
    auctionId = existing.id;
    if (needsRefresh) {
      await client.query(
        `UPDATE auctions SET
           current_high_bid_id = NULL,
           current_high_bidder_id = NULL,
           current_high_bid_cents = 0,
           status = 'open',
           version = 0,
           opens_at = $1,
           closes_at = $2,
           bid_increment_cents = $3,
           reserve_price_cents = $4,
           soft_close_seconds = $5,
           updated_at = now()
         WHERE id = $6`,
        [
          opensAt,
          closesAt,
          config.incrementCents,
          config.reserveCents,
          SOFT_CLOSE_SECONDS,
          auctionId
        ]
      );
      await client.query("DELETE FROM bid_events WHERE auction_id = $1", [auctionId]);
      await client.query("DELETE FROM auction_events WHERE auction_id = $1", [auctionId]);
    }
  }

  // Authorize the auction-specific bidder set.
  const auctionBidderIds: string[] = [];
  for (const email of config.bidderEmails) {
    const bidderId = bidderIdByEmail.get(email);
    if (!bidderId) continue;
    auctionBidderIds.push(bidderId);
    await authorizeBidder(client, auctionId, bidderId);
  }

  // Always authorize the human Demo Buyer.
  if (demoBuyerBidderId) {
    await authorizeBidder(client, auctionId, demoBuyerBidderId);
  }

  // Seed bid history when the auction was freshly created or rotated.
  const existingBidCount = await client.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM bid_events WHERE auction_id = $1",
    [auctionId]
  );
  const hasBids = asNumber(existingBidCount.rows[0]?.n ?? 0) > 0;
  if (hasBids || auctionBidderIds.length === 0) return;

  let runningHigh = config.startingBidCents - config.incrementCents;
  let runningVersion = 0;
  let lastBidId: string | null = null;
  let lastBidderId: string | null = null;

  const seededCount = Math.min(config.seedBidCount, auctionBidderIds.length * 2);
  for (let i = 0; i < seededCount; i += 1) {
    const bidder = auctionBidderIds[i % auctionBidderIds.length];
    runningHigh += config.incrementCents;
    runningVersion += 1;
    const minutesAgo = (seededCount - i) * 7 + 3;
    const createdAt = new Date(now.getTime() - minutesAgo * 60 * 1000);
    const idempotencyKey = `demo-${auctionId}-${runningVersion}-${randomUUID()}`;
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

export async function ensureDemoAuction(now: Date = new Date()): Promise<void> {
  await withTransaction(async (client) => {
    // Ensure all bidder profiles exist (idempotent), keyed by email.
    const bidderIdByEmail = new Map<string, string>();
    for (const seed of DEMO_BIDDERS) {
      const id = await ensureBidder(client, seed);
      bidderIdByEmail.set(seed.email, id);
    }

    // Look up the Demo Buyer (human user) and link to a bidder row.
    let demoBuyerBidderId: string | null = null;
    const demoBuyerUser = await client.query<{ email: string }>(
      "SELECT email FROM users WHERE email = 'buyer@farmauction.demo' LIMIT 1"
    );
    if (demoBuyerUser.rowCount) {
      const buyerEmail = demoBuyerUser.rows[0].email;
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM bidders WHERE lower(email) = lower($1)",
        [buyerEmail]
      );
      if (existing.rowCount) {
        demoBuyerBidderId = existing.rows[0].id;
        await client.query(
          "UPDATE bidders SET legal_name = COALESCE(NULLIF(legal_name, ''), 'Demo Buyer'), verification_status = 'approved', updated_at = now() WHERE id = $1",
          [demoBuyerBidderId]
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO bidders (email, legal_name, verification_status)
           VALUES ($1, 'Demo Buyer', 'approved')
           RETURNING id`,
          [buyerEmail]
        );
        demoBuyerBidderId = inserted.rows[0].id;
      }
    }

    for (const config of DEMO_CONFIGS) {
      await ensureOneDemoAuction(client, config, bidderIdByEmail, demoBuyerBidderId, now);
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
  if (typeof resetTimer.unref === "function") resetTimer.unref();
}

export function stopDemoLoop() {
  if (resetTimer) {
    clearInterval(resetTimer);
    resetTimer = null;
  }
}
