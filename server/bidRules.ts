/**
 * Pure bid-evaluation rules for live auctions.
 *
 * These mirror the checks `placeBid` performs while holding the per-auction
 * `FOR UPDATE` row lock, pulled out as standalone functions so the money-path
 * decision logic is named, documented, and unit-testable without a database.
 * `placeBid` remains the single writer and authority on side effects; this
 * module is side-effect-free and never touches the DB or the clock.
 */

/** High bid that an accepted live bid displaced, for outbid notifications. */
export type PreviousHighBid = {
  bidderId: string;
  amountCents: number;
} | null;

/**
 * Smallest acceptable next bid, in cents, for a live auction.
 *
 * With no standing bid (`currentHighBidCents <= 0`) the floor is a single
 * increment — the opening bid must be at least one increment. Once a high bid
 * stands, the floor is that bid plus one increment. The public auction page
 * computes the same value for its "minimum next bid" hint, so client and server
 * agree on exactly what will be accepted.
 */
export function minimumLiveBidCents(
  currentHighBidCents: number,
  bidIncrementCents: number
): number {
  return currentHighBidCents > 0
    ? currentHighBidCents + bidIncrementCents
    : bidIncrementCents;
}

/**
 * Whether a live auction is currently accepting bids: it must be `open` and the
 * clock must sit within `[opensAtMs, closesAtMs]`. Both boundaries are
 * inclusive so a bid placed at the exact open/close instant is not spuriously
 * rejected; soft-close extensions move `closesAtMs` outward before this is
 * re-evaluated on the next bid.
 */
export function isAuctionOpenForBids(args: {
  status: string;
  nowMs: number;
  opensAtMs: number;
  closesAtMs: number;
}): boolean {
  return (
    args.status === "open" &&
    args.nowMs >= args.opensAtMs &&
    args.nowMs <= args.closesAtMs
  );
}

/**
 * Whether `amountCents` exceeds a bidder's approved ceiling. A `null` ceiling
 * means "no limit" and never blocks. The ceiling is inclusive — a bid equal to
 * the cap is allowed; only a bid strictly above it is rejected.
 */
export function exceedsMaxBid(
  amountCents: number,
  maxBidCents: number | null
): boolean {
  return maxBidCents != null && amountCents > maxBidCents;
}

/**
 * Capture the standing high bid before it is overwritten, so an accepted bid
 * knows exactly whom it displaced. Read from the `FOR UPDATE`-locked auction
 * row, this is immune to self-raises and concurrent writes: when there is no
 * prior bidder it returns null (the opening bid displaces no one), which lets
 * the caller skip the outbid notice.
 */
export function capturePreviousHighBid(
  currentHighBidderId: string | null | undefined,
  currentHighBidCents: number
): PreviousHighBid {
  if (currentHighBidderId == null) return null;
  return { bidderId: currentHighBidderId, amountCents: currentHighBidCents };
}
