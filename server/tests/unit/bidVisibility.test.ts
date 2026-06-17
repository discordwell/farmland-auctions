import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSealedAuction,
  publicAuctionClosedAuction,
  publicBidAcceptedEvent,
  publicBidHistory,
  publicBidsVisible
} from "../../bidVisibility.js";

// A bid as `serializeBid` produces it: the fields a public client could read.
const bid = (overrides: Record<string, unknown> = {}) => ({
  id: "bid-1",
  auctionId: "auc-1",
  bidderId: "bidder-7",
  bidderAlias: "Jane Confidential",
  amountCents: 81_000_000,
  amountDollars: 810_000,
  bidType: "live",
  accepted: true,
  rejectionReason: null,
  auctionVersion: 4,
  createdAt: "2026-06-17T00:00:00.000Z",
  ...overrides
});

describe("isSealedAuction / publicBidsVisible", () => {
  it("classifies a sealed auction as sealed and not publicly visible", () => {
    assert.equal(isSealedAuction({ auctionType: "sealed" }), true);
    assert.equal(publicBidsVisible({ auctionType: "sealed" }), false);
  });

  it("treats a live auction as an open, publicly visible ledger", () => {
    assert.equal(isSealedAuction({ auctionType: "live" }), false);
    assert.equal(publicBidsVisible({ auctionType: "live" }), true);
  });

  it("treats any non-sealed type as open (only an exact 'sealed' redacts)", () => {
    // Defensive: an unknown/typo'd type must never silently turn a public
    // auction confidential, but more importantly must never expose a sealed one.
    for (const auctionType of ["", "Sealed", "english", "dutch"]) {
      assert.equal(isSealedAuction({ auctionType }), false);
      assert.equal(publicBidsVisible({ auctionType }), true);
    }
  });
});

describe("publicBidHistory", () => {
  it("returns the full ledger for a live auction", () => {
    const bids = [bid({ id: "a" }), bid({ id: "b" })];
    assert.deepEqual(publicBidHistory({ auctionType: "live" }, bids), bids);
  });

  it("redacts a sealed auction to an empty list", () => {
    const bids = [bid({ id: "a" }), bid({ id: "b" })];
    assert.deepEqual(publicBidHistory({ auctionType: "sealed" }, bids), []);
  });

  it("never leaks a sealed bid's amount or bidder alias", () => {
    // The whole point of the gate: confidential fields must not survive into the
    // public projection. Stringify so a future shape change can't sneak them
    // back in via a nested object.
    const serialized = JSON.stringify(
      publicBidHistory({ auctionType: "sealed" }, [bid()])
    );
    assert.equal(serialized.includes("81000000"), false);
    assert.equal(serialized.includes("Jane Confidential"), false);
    assert.equal(serialized.includes("bidder-7"), false);
  });

  it("handles an empty input for both auction types", () => {
    assert.deepEqual(publicBidHistory({ auctionType: "live" }, []), []);
    assert.deepEqual(publicBidHistory({ auctionType: "sealed" }, []), []);
  });

  it("does not mutate the input list", () => {
    const bids = [bid({ id: "a" }), bid({ id: "b" })];
    publicBidHistory({ auctionType: "sealed" }, bids);
    publicBidHistory({ auctionType: "live" }, bids);
    assert.equal(bids.length, 2);
  });
});

describe("publicBidAcceptedEvent", () => {
  const liveResult = { auction: { id: "auc-1", auctionType: "live" }, bid: bid() };
  const sealedResult = {
    auction: { id: "auc-9", auctionType: "sealed" },
    bid: bid({ bidType: "sealed" })
  };

  it("broadcasts the full result on a live auction's public stream", () => {
    const event = publicBidAcceptedEvent(liveResult.auction, liveResult);
    assert.equal(event.event, "bid.accepted");
    assert.equal(event.payload, liveResult);
  });

  it("emits only a contentless signal for a sealed auction", () => {
    const event = publicBidAcceptedEvent(sealedResult.auction, sealedResult);
    assert.equal(event.event, "sealed_bid.accepted");
    assert.deepEqual(event.payload, { auctionId: "auc-9" });
  });

  it("never leaks the sealed bid's amount, alias, or bidder id over SSE", () => {
    const event = publicBidAcceptedEvent(sealedResult.auction, sealedResult);
    const wire = JSON.stringify(event.payload);
    assert.equal(wire.includes("81000000"), false);
    assert.equal(wire.includes("Jane Confidential"), false);
    assert.equal(wire.includes("bidder-7"), false);
  });
});

describe("publicAuctionClosedAuction", () => {
  // A serialized auction whose high-bid fields are populated — as a future
  // sealed winner-selection step would leave them at close.
  const closed = (auctionType: string) => ({
    id: "auc-1",
    title: "Lipton half-section",
    status: "closed",
    auctionType,
    currentHighBidId: "bid-9",
    currentHighBidCents: 81_000_000,
    currentHighBidDollars: 810_000,
    currentHighBidderId: "bidder-7",
    reserveMet: true
  });

  it("passes a live auction through untouched (same reference)", () => {
    const auction = closed("live");
    assert.equal(publicAuctionClosedAuction(auction), auction);
  });

  it("blanks a sealed auction's high-bid fields but keeps the rest", () => {
    const redacted = publicAuctionClosedAuction(closed("sealed"));
    assert.equal(redacted.currentHighBidId, null);
    assert.equal(redacted.currentHighBidCents, 0);
    assert.equal(redacted.currentHighBidDollars, 0);
    assert.equal(redacted.currentHighBidderId, null);
    assert.equal(redacted.reserveMet, false);
    // Non-confidential fields survive.
    assert.equal(redacted.title, "Lipton half-section");
    assert.equal(redacted.status, "closed");
  });

  it("does not mutate the sealed input", () => {
    const auction = closed("sealed");
    publicAuctionClosedAuction(auction);
    assert.equal(auction.currentHighBidCents, 81_000_000);
    assert.equal(auction.currentHighBidderId, "bidder-7");
  });

  it("never leaks a sealed winner's amount or bidder id on the public close event", () => {
    const wire = JSON.stringify(publicAuctionClosedAuction(closed("sealed")));
    assert.equal(wire.includes("81000000"), false);
    assert.equal(wire.includes("810000"), false);
    assert.equal(wire.includes("bidder-7"), false);
    assert.equal(wire.includes("bid-9"), false);
  });
});
