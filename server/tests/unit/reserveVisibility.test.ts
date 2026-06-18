import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RESERVE_VISIBILITIES,
  publicReserveView,
  reserveMetVisible
} from "../../reserveVisibility.js";

// A serialized auction as `serializeAuction` produces it — the fields a public
// client could read. `reserveMet` is the one publicly derived reserve bit.
const auction = (overrides: Record<string, unknown> = {}) => ({
  id: "auc-1",
  title: "Lipton half-section",
  status: "open",
  auctionType: "live",
  reserveVisibility: "met-only",
  reserveMet: true,
  currentHighBidId: "bid-9",
  currentHighBidCents: 81_000_000,
  currentHighBidDollars: 810_000,
  currentHighBidderId: "bidder-7",
  version: 4,
  ...overrides
});

describe("reserveMetVisible", () => {
  it("shows the met/pending bit for met-only and public", () => {
    assert.equal(reserveMetVisible({ reserveVisibility: "met-only" }), true);
    assert.equal(reserveMetVisible({ reserveVisibility: "public" }), true);
  });

  it("hides the met/pending bit for a hidden reserve", () => {
    assert.equal(reserveMetVisible({ reserveVisibility: "hidden" }), false);
  });

  it("fails closed for any unknown/typo'd visibility", () => {
    // A mis-configured value must never accidentally open the gate — only an
    // exact recognized "show it" value does.
    for (const reserveVisibility of ["", "Hidden", "Met-Only", "met", "all", "none"]) {
      assert.equal(reserveMetVisible({ reserveVisibility }), false);
    }
  });
});

describe("RESERVE_VISIBILITIES contract", () => {
  it("pins the exact set the auctions.reserve_visibility column allows", () => {
    // Mirror of the migration 001 CHECK (reserve_visibility IN (...)). If the
    // column's taxonomy changes, this test should change with it.
    assert.deepEqual([...RESERVE_VISIBILITIES], ["hidden", "met-only", "public"]);
  });

  it("exposes the met bit for every level except hidden", () => {
    for (const level of RESERVE_VISIBILITIES) {
      assert.equal(reserveMetVisible({ reserveVisibility: level }), level !== "hidden");
    }
  });
});

describe("publicReserveView", () => {
  it("passes a met-only auction through untouched (same reference)", () => {
    const a = auction({ reserveVisibility: "met-only", reserveMet: true });
    assert.equal(publicReserveView(a), a);
  });

  it("passes a public-reserve auction through untouched (same reference)", () => {
    const a = auction({ reserveVisibility: "public", reserveMet: true });
    assert.equal(publicReserveView(a), a);
  });

  it("redacts a hidden auction's met state to false but keeps the rest", () => {
    const redacted = publicReserveView(
      auction({ reserveVisibility: "hidden", reserveMet: true })
    );
    assert.equal(redacted.reserveMet, false);
    // Visibility itself survives so the UI can render neither "met" nor
    // "pending" for a hidden reserve.
    assert.equal(redacted.reserveVisibility, "hidden");
    // Non-reserve fields pass through.
    assert.equal(redacted.title, "Lipton half-section");
    assert.equal(redacted.status, "open");
    assert.equal(redacted.currentHighBidCents, 81_000_000);
  });

  it("fails closed: an unknown visibility is also redacted", () => {
    const redacted = publicReserveView(
      auction({ reserveVisibility: "weird", reserveMet: true })
    );
    assert.equal(redacted.reserveMet, false);
  });

  it("leaves an already-unmet hidden reserve as false", () => {
    const redacted = publicReserveView(
      auction({ reserveVisibility: "hidden", reserveMet: false })
    );
    assert.equal(redacted.reserveMet, false);
  });

  it("does not mutate the hidden input", () => {
    const a = auction({ reserveVisibility: "hidden", reserveMet: true });
    publicReserveView(a);
    assert.equal(a.reserveMet, true);
  });

  it("never lets a hidden auction's met=true survive onto the public view", () => {
    // The whole point of the gate: a cleared floor must not be inferable from
    // the public projection of a hidden-reserve auction.
    for (const reserveMet of [true, false]) {
      const redacted = publicReserveView(auction({ reserveVisibility: "hidden", reserveMet }));
      assert.equal(redacted.reserveMet, false);
    }
  });
});
