import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capturePreviousHighBid,
  exceedsMaxBid,
  isAuctionOpenForBids,
  minimumLiveBidCents
} from "../../bidRules.js";

describe("minimumLiveBidCents", () => {
  it("requires a single increment for the opening bid", () => {
    assert.equal(minimumLiveBidCents(0, 2_500_000), 2_500_000);
  });

  it("treats a negative standing bid as no standing bid", () => {
    // Defensive: the DB never stores negatives, but the floor must not collapse
    // below one increment if a bad value ever slips through.
    assert.equal(minimumLiveBidCents(-1, 2_500_000), 2_500_000);
  });

  it("adds one increment to the standing high bid", () => {
    assert.equal(minimumLiveBidCents(80_000_000, 2_500_000), 82_500_000);
  });

  it("a bid equal to the minimum clears the floor (reject is strictly-below)", () => {
    const minimum = minimumLiveBidCents(80_000_000, 2_500_000);
    assert.equal(82_500_000 >= minimum, true);
    assert.equal(82_499_999 >= minimum, false);
  });
});

describe("isAuctionOpenForBids", () => {
  const base = { status: "open", nowMs: 1_500, opensAtMs: 1_000, closesAtMs: 2_000 };

  it("accepts an open auction within its window", () => {
    assert.equal(isAuctionOpenForBids(base), true);
  });

  it("rejects any status other than open", () => {
    for (const status of ["draft", "registration", "paused", "closed", "settled"]) {
      assert.equal(isAuctionOpenForBids({ ...base, status }), false);
    }
  });

  it("rejects bids before the auction opens", () => {
    assert.equal(isAuctionOpenForBids({ ...base, nowMs: 999 }), false);
  });

  it("rejects bids after the auction closes", () => {
    assert.equal(isAuctionOpenForBids({ ...base, nowMs: 2_001 }), false);
  });

  it("treats both window boundaries as inclusive", () => {
    assert.equal(isAuctionOpenForBids({ ...base, nowMs: 1_000 }), true);
    assert.equal(isAuctionOpenForBids({ ...base, nowMs: 2_000 }), true);
  });
});

describe("exceedsMaxBid", () => {
  it("never blocks when there is no ceiling", () => {
    assert.equal(exceedsMaxBid(999_999_999, null), false);
  });

  it("allows bids at or below the ceiling (inclusive cap)", () => {
    assert.equal(exceedsMaxBid(50_000_000, 50_000_000), false);
    assert.equal(exceedsMaxBid(49_999_999, 50_000_000), false);
  });

  it("blocks a bid strictly above the ceiling", () => {
    assert.equal(exceedsMaxBid(50_000_001, 50_000_000), true);
  });

  it("treats a zero ceiling as a real limit, not 'no limit'", () => {
    assert.equal(exceedsMaxBid(1, 0), true);
    assert.equal(exceedsMaxBid(0, 0), false);
  });
});

describe("capturePreviousHighBid", () => {
  it("returns null when no prior bidder held the lot (opening bid)", () => {
    assert.equal(capturePreviousHighBid(null, 0), null);
    assert.equal(capturePreviousHighBid(undefined, 0), null);
  });

  it("captures the displaced bidder and their amount", () => {
    assert.deepEqual(capturePreviousHighBid("bd-7", 82_500_000), {
      bidderId: "bd-7",
      amountCents: 82_500_000
    });
  });
});
