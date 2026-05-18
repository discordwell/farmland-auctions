import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

const baseUrl = process.env.SMOKE_BASE_URL ?? "https://farmauction.discordwell.com";
const adminKey = process.env.ADMIN_API_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!adminKey) throw new Error("ADMIN_API_KEY is required");
if (!databaseUrl) throw new Error("DATABASE_URL is required for cleanup");

const adminHeader = adminKey;
const unique = Date.now().toString(36);
const slug = `codex-live-flow-${unique}`;
const bidderEmail = `${slug}@example.invalid`;

let listingId = "";
let auctionId = "";
let bidderId = "";

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function adminPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return getJson<T>(path, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminHeader
    },
    method: "POST"
  });
}

async function cleanup() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (auctionId) {
      await client.query("DELETE FROM auction_events WHERE auction_id = $1", [auctionId]);
      await client.query("DELETE FROM post_auction_tasks WHERE auction_id = $1", [auctionId]);
      await client.query("DELETE FROM bid_events WHERE auction_id = $1", [auctionId]);
      await client.query("DELETE FROM auction_bidder_authorizations WHERE auction_id = $1", [
        auctionId
      ]);
      await client.query("DELETE FROM auctions WHERE id = $1", [auctionId]);
    }
    if (listingId) {
      await client.query("DELETE FROM listing_highlights WHERE listing_id = $1", [listingId]);
      await client.query("DELETE FROM listings WHERE id = $1", [listingId]);
    }
    if (bidderId) {
      await client.query("DELETE FROM bidders WHERE id = $1 AND email = $2", [
        bidderId,
        bidderEmail
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  try {
    const listingPayload = await adminPost<{ listing: { id: string } }>("/api/admin/listings", {
      acres: 160,
      avgAssessment: 1,
      description: "Temporary live verification record.",
      highlights: ["Temporary verification"],
      image: "/images/hero-fields.jpg",
      latitude: 51.5,
      longitude: -106.5,
      pricePerAcre: 1,
      publish: true,
      region: "Verification",
      rm: "RM Verification",
      satellite: "/images/satellite-fields.jpg",
      slug,
      soilRating: 50,
      status: "For Sale",
      title: "Live Verification Parcel",
      type: "Grain"
    });
    listingId = listingPayload.listing.id;

    const now = Date.now();
    const auctionPayload = await adminPost<{ auction: { id: string } }>("/api/admin/auctions", {
      auctionType: "live",
      bidIncrement: 1000,
      closesAt: new Date(now + 15 * 60_000).toISOString(),
      listingId,
      opensAt: new Date(now - 60_000).toISOString(),
      reservePrice: 1000,
      reserveVisibility: "met-only",
      softCloseSeconds: 60,
      status: "open",
      title: "Live Verification Auction"
    });
    auctionId = auctionPayload.auction.id;

    const registration = await getJson<{ bidderId: string }>(`/api/auctions/${auctionId}/register`, {
      body: JSON.stringify({
        bidderNotes: "Temporary verification",
        depositReference: "verification",
        email: bidderEmail,
        entityType: "individual",
        legalName: "Live Verification Bidder",
        mailingAddress: "Verification address",
        phone: "3065550100",
        termsAccepted: true,
        termsVersion: "2026-05-18"
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    bidderId = registration.bidderId;

    await adminPost(`/api/admin/auctions/${auctionId}/bidders/${bidderId}/decision`, {
      depositStatus: "verified",
      maxBid: 2000,
      status: "approved",
      verificationStatus: "approved"
    });

    const bid = await getJson<{
      accepted: boolean;
      auction: { currentHighBidCents: number };
    }>(`/api/auctions/${auctionId}/bids`, {
      body: JSON.stringify({
        amountCents: 100000,
        bidderEmail,
        idempotencyKey: randomUUID()
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    if (!bid.accepted || bid.auction.currentHighBidCents !== 100000) {
      throw new Error("Bid was not accepted as expected");
    }

    const overLimit = await fetch(`${baseUrl}/api/auctions/${auctionId}/bids`, {
      body: JSON.stringify({
        amountCents: 300000,
        bidderEmail,
        idempotencyKey: randomUUID()
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    if (overLimit.status !== 409) throw new Error("Bidder max-bid limit was not enforced");

    await adminPost(`/api/admin/auctions/${auctionId}/close`, {});
    const tasks = await getJson<{ tasks: unknown[] }>(`/api/admin/auctions/${auctionId}/tasks`, {
      headers: { "x-admin-key": adminHeader }
    });
    if (tasks.tasks.length < 3) throw new Error("Post-close tasks were not created");

    console.log(`live flow ok: ${baseUrl}`);
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
