import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RESERVE_VISIBILITIES,
  publicReserveView,
  registrantReserveView,
  reserveMetVisible,
  reservePriceVisible
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

  it("exposes the reserve price only for public", () => {
    for (const level of RESERVE_VISIBILITIES) {
      assert.equal(reservePriceVisible({ reserveVisibility: level }), level === "public");
    }
  });
});

describe("reservePriceVisible", () => {
  it("shows the price only for a public reserve", () => {
    assert.equal(reservePriceVisible({ reserveVisibility: "public" }), true);
    assert.equal(reservePriceVisible({ reserveVisibility: "met-only" }), false);
    assert.equal(reservePriceVisible({ reserveVisibility: "hidden" }), false);
  });

  it("fails closed for any unknown/typo'd visibility", () => {
    for (const reserveVisibility of ["", "Public", "PUBLIC", "all", "met", "none"]) {
      assert.equal(reservePriceVisible({ reserveVisibility }), false);
    }
  });

  it("is a strict subset of reserveMetVisible (no price where the met bit is hidden)", () => {
    // If the met/pending bit may not be shown, the price certainly may not.
    for (const level of [...RESERVE_VISIBILITIES, "weird", ""]) {
      if (reservePriceVisible({ reserveVisibility: level })) {
        assert.equal(reserveMetVisible({ reserveVisibility: level }), true);
      }
    }
  });
});

describe("registrantReserveView", () => {
  // The auction's raw reserve columns as the /api/me/summary join returns them.
  // Cents arrive as bigint-strings (node-pg's representation of the bigint cols).
  const row = (overrides: Record<string, unknown> = {}) => ({
    reserveVisibility: "met-only",
    reservePriceCents: "80000000", // $800k floor — the secret
    currentHighBidCents: "81000000", // $810k high — clears the floor
    ...overrides
  });

  it("exposes price + met for a public reserve", () => {
    const view = registrantReserveView(row({ reserveVisibility: "public" }));
    assert.equal(view.reservePriceCents, 80_000_000);
    assert.equal(view.reserveMet, true);
    assert.equal(view.reserveVisibility, "public");
  });

  it("withholds the price but reports met/pending for met-only", () => {
    assert.equal(registrantReserveView(row({ reserveVisibility: "met-only" })).reserveMet, true);
    assert.equal(
      registrantReserveView(row({ reserveVisibility: "met-only" })).reservePriceCents,
      null
    );
    // Pending when the high bid has not reached the (withheld) floor.
    const pending = registrantReserveView(
      row({ reserveVisibility: "met-only", currentHighBidCents: "5000000" })
    );
    assert.equal(pending.reserveMet, false);
    assert.equal(pending.reservePriceCents, null);
  });

  it("withholds both price and met state for a hidden reserve", () => {
    const view = registrantReserveView(row({ reserveVisibility: "hidden" }));
    assert.equal(view.reservePriceCents, null);
    assert.equal(view.reserveMet, null); // null = withheld, not false (= not met)
    assert.equal(view.reserveVisibility, "hidden"); // preserved to disambiguate
  });

  it("fails closed for an unknown visibility (withholds everything)", () => {
    const view = registrantReserveView(row({ reserveVisibility: "weird" }));
    assert.equal(view.reservePriceCents, null);
    assert.equal(view.reserveMet, null);
  });

  it("mirrors serializeAuction's met math at the boundary", () => {
    // met requires a POSITIVE reserve the high bid has reached (>=).
    const exactly = registrantReserveView(
      row({ reserveVisibility: "public", reservePriceCents: "100", currentHighBidCents: "100" })
    );
    assert.equal(exactly.reserveMet, true);
    const justUnder = registrantReserveView(
      row({ reserveVisibility: "public", reservePriceCents: "100", currentHighBidCents: "99" })
    );
    assert.equal(justUnder.reserveMet, false);
    // A zero reserve is never "met", even though high >= 0 trivially holds.
    const zeroReserve = registrantReserveView(
      row({ reserveVisibility: "public", reservePriceCents: "0", currentHighBidCents: "0" })
    );
    assert.equal(zeroReserve.reserveMet, false);
  });

  it("accepts numeric cents and a null/zero high bid", () => {
    const view = registrantReserveView({
      reserveVisibility: "met-only",
      reservePriceCents: 80_000_000,
      currentHighBidCents: null
    });
    assert.equal(view.reserveMet, false); // no bids yet → floor not cleared
    assert.equal(view.reservePriceCents, null);
  });

  it("never leaks the secret floor for a hidden or met-only reserve", () => {
    // Stringify the whole projection so a future shape change can't sneak the
    // price back in — the same regression guard as bidVisibility.
    for (const reserveVisibility of ["hidden", "met-only"]) {
      const wire = JSON.stringify(registrantReserveView(row({ reserveVisibility })));
      assert.equal(wire.includes("80000000"), false);
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
