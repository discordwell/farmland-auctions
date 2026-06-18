import type { PoolClient, QueryResultRow } from "pg";
import { ApiError } from "./errors.js";
import {
  capturePreviousHighBid,
  exceedsMaxBid,
  isAuctionOpenForBids,
  minimumLiveBidCents,
  type PreviousHighBid
} from "./bidRules.js";
import { serializeAuction, serializeBid } from "./serializers.js";
import { publicBidHistory } from "./bidVisibility.js";
import { publicReserveView } from "./reserveVisibility.js";
import { query, withTransaction } from "./db/pool.js";

type PlaceBidInput = {
  auctionId: string;
  bidderId?: string;
  bidderEmail?: string;
  amountCents: number;
  idempotencyKey: string;
};

// `PreviousHighBid` now lives in ./bidRules alongside the pure capture logic;
// re-exported here so existing importers of auctionService keep working.
export type { PreviousHighBid };

export type PlaceBidResult = {
  accepted: boolean;
  bid: ReturnType<typeof serializeBid> | null;
  auction: ReturnType<typeof serializeAuction>;
  previousHighBid: PreviousHighBid;
  duplicate?: boolean;
  sealed?: boolean;
  minimumBidCents?: number;
  reason?: string;
};

async function getBidderId(client: PoolClient, input: PlaceBidInput) {
  if (input.bidderId) return input.bidderId;

  const bidder = await client.query<{ id: string }>(
    "SELECT id FROM bidders WHERE lower(email) = lower($1)",
    [input.bidderEmail]
  );

  if (!bidder.rowCount) {
    throw new ApiError(404, "Bidder is not registered");
  }

  return bidder.rows[0].id;
}

async function loadAuctionState(client: PoolClient, auctionId: string) {
  const auction = await client.query(
    `
      SELECT
        a.*,
        l.slug AS listing_slug,
        l.rm AS listing_rm,
        l.acres AS listing_acres,
        l.soil_final_rating AS listing_soil_final_rating,
        l.hero_image_url AS listing_hero_image_url
      FROM auctions a
      JOIN listings l ON l.id = a.listing_id
      WHERE a.id = $1
    `,
    [auctionId]
  );

  if (!auction.rowCount) {
    throw new ApiError(404, "Auction not found");
  }

  return serializeAuction(auction.rows[0]);
}

async function insertRejectedBid(
  client: PoolClient,
  input: PlaceBidInput,
  bidderId: string,
  auctionVersion: number,
  reason: string
) {
  const bid = await client.query<{ id: string }>(
    `
      INSERT INTO bid_events (
        auction_id, bidder_id, amount_cents, bid_type, idempotency_key,
        accepted, rejection_reason, auction_version
      )
      VALUES ($1, $2, $3, 'live', $4, false, $5, $6)
      ON CONFLICT (auction_id, idempotency_key) DO NOTHING
      RETURNING id
    `,
    [
      input.auctionId,
      bidderId,
      input.amountCents,
      input.idempotencyKey,
      reason,
      auctionVersion
    ]
  );

  return bid.rows[0] ? serializeBid(await loadBid(client, bid.rows[0].id)) : null;
}

async function loadBid(client: PoolClient, bidId: string) {
  const bid = await client.query(
    `
      SELECT b.*, bidders.legal_name
      FROM bid_events b
      JOIN bidders ON bidders.id = b.bidder_id
      WHERE b.id = $1
    `,
    [bidId]
  );

  if (!bid.rowCount) throw new ApiError(500, "Bid was not persisted");
  return bid.rows[0];
}

/**
 * Raw, unfiltered bid history. Exposes every bid's amount and bidder alias, so
 * it is for authenticated/internal callers only (admin console, the operator
 * close flow). Public, unauthenticated surfaces must go through
 * `getPublicBidHistory`, which redacts sealed auctions.
 */
export async function getBidHistory(auctionId: string, limit = 50) {
  const result = await query(
    `
      SELECT b.*, bidders.legal_name
      FROM bid_events b
      JOIN bidders ON bidders.id = b.bidder_id
      WHERE b.auction_id = $1
      ORDER BY b.created_at DESC
      LIMIT $2
    `,
    [auctionId, limit]
  );

  return result.rows.map(serializeBid);
}

/**
 * Bid history shaped for PUBLIC consumption: the full ledger for a live auction,
 * empty for a sealed one (see ./bidVisibility). The unauthenticated
 * `GET /api/auctions/:id/bids` route uses this instead of the raw
 * `getBidHistory` so a sealed auction's bids never become publicly readable.
 */
export async function getPublicBidHistory(auctionId: string, limit = 50) {
  const auction = await query<{ auction_type: string }>(
    "SELECT auction_type FROM auctions WHERE id = $1",
    [auctionId]
  );
  // Unknown auction → no bids. Matches the prior empty-list response, and the
  // bid_events FK guarantees there are none to show anyway.
  if (!auction.rowCount) return [];

  return publicBidHistory(
    { auctionType: auction.rows[0].auction_type },
    await getBidHistory(auctionId, limit)
  );
}

export async function getAuction(auctionId: string) {
  const auction = await query(
    `
      SELECT
        a.*,
        l.slug AS listing_slug,
        l.rm AS listing_rm,
        l.acres AS listing_acres,
        l.soil_final_rating AS listing_soil_final_rating,
        l.hero_image_url AS listing_hero_image_url
      FROM auctions a
      JOIN listings l ON l.id = a.listing_id
      WHERE a.id = $1
    `,
    [auctionId]
  );

  if (!auction.rowCount) throw new ApiError(404, "Auction not found");

  // `GET /api/auctions/:id` is public, so its bundled payload is redacted for
  // confidential cases: sealed auctions hide their bid history (just like the
  // standalone `/bids` route), and hidden-reserve auctions hide their
  // met/pending state. `publicBidHistory` reads only `auctionType`, which
  // `publicReserveView` leaves untouched.
  const serialized = serializeAuction(auction.rows[0]);
  return {
    auction: publicReserveView(serialized),
    bidHistory: publicBidHistory(serialized, await getBidHistory(auctionId))
  };
}

export async function placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
  return withTransaction(async (client): Promise<PlaceBidResult> => {
    const bidderId = await getBidderId(client, input);

    const lockedAuction = await client.query<QueryResultRow>(
      "SELECT * FROM auctions WHERE id = $1 FOR UPDATE",
      [input.auctionId]
    );

    if (!lockedAuction.rowCount) {
      throw new ApiError(404, "Auction not found");
    }

    const auction = lockedAuction.rows[0];
    const existing = await client.query(
      `
        SELECT b.*, bidders.legal_name
        FROM bid_events b
        JOIN bidders ON bidders.id = b.bidder_id
        WHERE b.auction_id = $1 AND b.idempotency_key = $2
      `,
      [input.auctionId, input.idempotencyKey]
    );

    if (existing.rowCount) {
      return {
        accepted: Boolean(existing.rows[0].accepted),
        duplicate: true,
        previousHighBid: null,
        bid: serializeBid(existing.rows[0]),
        auction: await loadAuctionState(client, input.auctionId)
      };
    }

    const authorization = await client.query(
      `
        SELECT *
        FROM auction_bidder_authorizations
        WHERE auction_id = $1 AND bidder_id = $2
        FOR UPDATE
      `,
      [input.auctionId, bidderId]
    );

    if (!authorization.rowCount || authorization.rows[0].status !== "approved") {
      throw new ApiError(403, "Bidder is not approved for this auction");
    }

    const maxBidCents =
      authorization.rows[0].max_bid_cents == null
        ? null
        : Number(authorization.rows[0].max_bid_cents);
    if (exceedsMaxBid(input.amountCents, maxBidCents)) {
      const bid = await insertRejectedBid(
        client,
        input,
        bidderId,
        Number(auction.version),
        "Bid exceeds approved bidder limit"
      );
      return {
        accepted: false,
        previousHighBid: null,
        bid,
        auction: await loadAuctionState(client, input.auctionId),
        reason: "Bid exceeds approved bidder limit"
      };
    }

    const now = Date.now();
    const opensAt = new Date(auction.opens_at as string).getTime();
    const closesAt = new Date(auction.closes_at as string).getTime();

    if (
      !isAuctionOpenForBids({
        status: auction.status as string,
        nowMs: now,
        opensAtMs: opensAt,
        closesAtMs: closesAt
      })
    ) {
      const bid = await insertRejectedBid(
        client,
        input,
        bidderId,
        Number(auction.version),
        "Auction is not open"
      );
      return {
        accepted: false,
        previousHighBid: null,
        bid,
        auction: await loadAuctionState(client, input.auctionId),
        reason: "Auction is not open"
      };
    }

    if (auction.auction_type === "sealed") {
      const bid = await client.query<{ id: string }>(
        `
          INSERT INTO bid_events (
            auction_id, bidder_id, amount_cents, bid_type, idempotency_key,
            accepted, auction_version
          )
          VALUES ($1, $2, $3, 'sealed', $4, true, $5)
          RETURNING id
        `,
        [input.auctionId, bidderId, input.amountCents, input.idempotencyKey, auction.version]
      );

      await client.query(
        `
          INSERT INTO auction_events (auction_id, actor_type, actor_id, event_type, payload)
          VALUES ($1, 'bidder', $2, 'sealed_bid.accepted', jsonb_build_object('bidId', $3::uuid))
        `,
        [input.auctionId, bidderId, bid.rows[0].id]
      );

      return {
        accepted: true,
        sealed: true,
        previousHighBid: null,
        bid: serializeBid(await loadBid(client, bid.rows[0].id)),
        auction: await loadAuctionState(client, input.auctionId)
      };
    }

    const currentHigh = Number(auction.current_high_bid_cents);
    const bidIncrement = Number(auction.bid_increment_cents);
    const minimumBid = minimumLiveBidCents(currentHigh, bidIncrement);

    if (input.amountCents < minimumBid) {
      const bid = await insertRejectedBid(
        client,
        input,
        bidderId,
        Number(auction.version),
        `Bid must be at least ${minimumBid} cents`
      );
      return {
        accepted: false,
        previousHighBid: null,
        bid,
        auction: await loadAuctionState(client, input.auctionId),
        minimumBidCents: minimumBid,
        reason: `Bid must be at least ${minimumBid} cents`
      };
    }

    const nextVersion = Number(auction.version) + 1;
    // Captured from the FOR UPDATE row before we overwrite it — this is the
    // authoritative "who just got outbid", immune to self-raises.
    const previousHighBid = capturePreviousHighBid(
      auction.current_high_bidder_id as string | null,
      currentHigh
    );
    const bid = await client.query<{ id: string }>(
      `
        INSERT INTO bid_events (
          auction_id, bidder_id, amount_cents, bid_type, idempotency_key,
          accepted, auction_version
        )
        VALUES ($1, $2, $3, 'live', $4, true, $5)
        RETURNING id
      `,
      [input.auctionId, bidderId, input.amountCents, input.idempotencyKey, nextVersion]
    );

    await client.query(
      `
        UPDATE auctions
        SET
          current_high_bid_id = $1,
          current_high_bid_cents = $2,
          current_high_bidder_id = $3,
          version = $4,
          closes_at = CASE
            WHEN closes_at - now() <= (soft_close_seconds * interval '1 second')
            THEN now() + (soft_close_seconds * interval '1 second')
            ELSE closes_at
          END,
          updated_at = now()
        WHERE id = $5
      `,
      [bid.rows[0].id, input.amountCents, bidderId, nextVersion, input.auctionId]
    );

    await client.query(
      `
        INSERT INTO auction_events (auction_id, actor_type, actor_id, event_type, payload)
        VALUES (
          $1, 'bidder', $2, 'bid.accepted',
          jsonb_build_object('bidId', $3::uuid, 'amountCents', $4::bigint, 'auctionVersion', $5::int)
        )
      `,
      [input.auctionId, bidderId, bid.rows[0].id, input.amountCents, nextVersion]
    );

    return {
      accepted: true,
      previousHighBid,
      bid: serializeBid(await loadBid(client, bid.rows[0].id)),
      auction: await loadAuctionState(client, input.auctionId)
    };
  });
}
