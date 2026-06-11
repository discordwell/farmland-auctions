import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  centsToDollars,
  dollarsToCents,
  serializeAuction,
  serializeBid,
  serializeListing
} from "../../serializers.js";

describe("centsToDollars / dollarsToCents", () => {
  it("handles pg bigint strings", () => {
    assert.equal(centsToDollars("123456"), 1234.56);
  });

  it("treats null and undefined as zero", () => {
    assert.equal(centsToDollars(null), 0);
    assert.equal(centsToDollars(undefined), 0);
  });

  it("rounds fractional cents instead of truncating", () => {
    assert.equal(dollarsToCents(10.005), 1001);
    assert.equal(dollarsToCents(2850), 285000);
  });

  it("round-trips whole-cent amounts", () => {
    assert.equal(centsToDollars(dollarsToCents(1234.56)), 1234.56);
  });
});

function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "l-1",
    slug: "lipton-half-section",
    title: "Lipton half-section",
    rm: "RM Lipton No. 217",
    region: "South East",
    acres: "318",
    price_per_acre_cents: "285000",
    avg_assessment_per_quarter_cents: "21000000",
    soil_final_rating: "62",
    legal_description: null,
    status: "For Sale",
    hero_image_url: "/images/lots/lipton.png",
    satellite_image_url: "/images/satellite-fields.jpg",
    latitude: "50.911",
    longitude: "-103.844",
    description: "Half section.",
    highlights: null,
    photos: null,
    published_at: "2026-05-18T00:00:00Z",
    updated_at: "2026-05-18T00:00:00Z",
    ...overrides
  };
}

describe("serializeListing", () => {
  it("converts numerics and formats coordinates as N/W", () => {
    const listing = serializeListing(listingRow());
    assert.equal(listing.acres, 318);
    assert.equal(listing.pricePerAcre, 2850);
    assert.equal(listing.soilRating, 62);
    assert.equal(listing.coordinates, "50.911 N, 103.844 W");
    assert.equal(listing.latitude, 50.911);
    assert.equal(listing.longitude, -103.844);
  });

  it("renders empty coordinates when either side is missing", () => {
    assert.equal(serializeListing(listingRow({ latitude: null })).coordinates, "");
    assert.equal(serializeListing(listingRow({ longitude: null })).coordinates, "");
  });

  it("defaults highlights and photos to empty arrays", () => {
    const listing = serializeListing(listingRow());
    assert.deepEqual(listing.highlights, []);
    assert.deepEqual(listing.photos, []);
  });
});

function auctionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a-1",
    listing_id: "l-1",
    title: "DEMO · Lipton half-section",
    status: "open",
    auction_type: "live",
    opens_at: "2026-05-19T00:00:00Z",
    closes_at: "2026-05-19T06:00:00Z",
    soft_close_seconds: "120",
    bid_increment_cents: "2500000",
    reserve_price_cents: "95000000",
    reserve_visibility: "met-only",
    current_high_bid_id: null,
    current_high_bid_cents: "80000000",
    current_high_bidder_id: null,
    version: "4",
    listing_slug: "lipton-half-section",
    listing_rm: "RM Lipton No. 217",
    listing_acres: "318",
    listing_soil_final_rating: "62",
    listing_hero_image_url: "/images/lots/lipton.png",
    ...overrides
  };
}

describe("serializeAuction", () => {
  it("computes reserveMet only when a positive reserve is reached", () => {
    assert.equal(serializeAuction(auctionRow()).reserveMet, false);
    assert.equal(
      serializeAuction(auctionRow({ current_high_bid_cents: "95000000" })).reserveMet,
      true
    );
  });

  it("never reports reserveMet for a zero reserve", () => {
    const auction = serializeAuction(
      auctionRow({ reserve_price_cents: "0", current_high_bid_cents: "100" })
    );
    assert.equal(auction.reserveMet, false);
  });

  it("nests listing fields when the join columns are present", () => {
    const auction = serializeAuction(auctionRow());
    assert.deepEqual(auction.listing, {
      slug: "lipton-half-section",
      rm: "RM Lipton No. 217",
      acres: 318,
      soilRating: 62,
      image: "/images/lots/lipton.png"
    });
  });

  it("returns a null listing when join columns are absent", () => {
    assert.equal(serializeAuction(auctionRow({ listing_slug: null })).listing, null);
  });

  it("coerces is_demo to a boolean, defaulting false when absent", () => {
    assert.equal(serializeAuction(auctionRow()).isDemo, false);
    assert.equal(serializeAuction(auctionRow({ is_demo: true })).isDemo, true);
  });
});

describe("serializeBid", () => {
  it("falls back to the Bidder alias when no legal name joins in", () => {
    const bid = serializeBid({
      id: "b-1",
      auction_id: "a-1",
      bidder_id: "bd-1",
      legal_name: undefined,
      amount_cents: "80000000",
      bid_type: "live",
      accepted: true,
      rejection_reason: null,
      auction_version: "4",
      created_at: "2026-05-19T01:00:00Z"
    });
    assert.equal(bid.bidderAlias, "Bidder");
    assert.equal(bid.amountCents, 80000000);
    assert.equal(bid.amountDollars, 800000);
    assert.equal(bid.rejectionReason, null);
  });
});
