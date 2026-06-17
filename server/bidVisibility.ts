/**
 * Pure rules for how much auction bid data may be exposed on PUBLIC
 * (unauthenticated) surfaces.
 *
 * Live auctions are an open outcry: the running ledger is the product, so every
 * accepted bid (amount + bidder alias) is public in real time. Sealed-bid
 * auctions are the opposite — each bid is confidential, and revealing amounts or
 * bidder identities before a deliberate reveal would defeat the format. This
 * module is the single place that decides what a public client may see, applied
 * to the public read paths (`GET /api/auctions/:id`, `GET /api/auctions/:id/bids`)
 * and the public SSE stream.
 *
 * Operator/admin surfaces are authenticated and read the raw accessors
 * (`getBidHistory`, the admin bidder/close routes) directly — this gate never
 * touches them. The decision is purely on `auctionType`: sealed bids stay
 * confidential on public surfaces regardless of status. Revealing sealed bids
 * after close is a separate, deliberate feature with its own semantics (winner
 * selection, when/whether losing bids are published); until that exists, the
 * safe default is "never public".
 *
 * Kept side-effect-free (no DB, no I/O, no clock) so the confidentiality
 * decision is named, documented, and unit-testable without infrastructure —
 * the same pattern as ./bidRules.
 */

export const SEALED_AUCTION_TYPE = "sealed";

/** A sealed-bid auction keeps every bid confidential on public surfaces. */
export function isSealedAuction(auction: { auctionType: string }): boolean {
  return auction.auctionType === SEALED_AUCTION_TYPE;
}

/**
 * Whether individual bids (amounts + bidder aliases) may appear on a public,
 * unauthenticated surface for this auction. Live (and any non-sealed) auctions
 * expose their ledger; sealed auctions never do.
 */
export function publicBidsVisible(auction: { auctionType: string }): boolean {
  return !isSealedAuction(auction);
}

/**
 * Project a raw bid list down to what a public client may see: the full list for
 * a live auction, an empty list for a sealed one. The input is never mutated.
 */
export function publicBidHistory<Bid>(
  auction: { auctionType: string },
  bids: Bid[]
): Bid[] {
  return publicBidsVisible(auction) ? bids : [];
}

/** A server-sent event destined for the public auction stream. */
export type PublicBidEvent = { event: string; payload: unknown };

/**
 * The SSE a public listener receives when a bid is accepted.
 *
 * Live: the full `bid.accepted` result — amount, bidder alias, and the new
 * standing high bid — which is exactly the open-outcry ledger the page renders.
 *
 * Sealed: a contentless `sealed_bid.accepted` signal carrying only the auction
 * id (no amount, alias, or bidder id), mirroring the `sealed_bid.accepted`
 * record `placeBid` already writes to `auction_events`. A future sealed-auction
 * UI can use it to show that activity happened without leaking who bid or how
 * much.
 */
export function publicBidAcceptedEvent(
  auction: { id: string; auctionType: string },
  liveResult: unknown
): PublicBidEvent {
  if (isSealedAuction(auction)) {
    return { event: "sealed_bid.accepted", payload: { auctionId: auction.id } };
  }
  return { event: "bid.accepted", payload: liveResult };
}

/** The high-bid fields a serialized auction carries, redacted for sealed broadcast. */
export type AuctionClosedBroadcast = {
  auctionType: string;
  currentHighBidId: string | null;
  currentHighBidCents: number;
  currentHighBidDollars: number;
  currentHighBidderId: string | null;
  reserveMet: boolean;
};

/**
 * The auction object safe to broadcast on the PUBLIC `auction.closed` SSE event.
 *
 * Live auctions publish the full serialized auction — their standing high bid
 * was public throughout the sale. For a sealed auction those high-bid fields are
 * confidential, so they are blanked to their unstarted defaults before the
 * broadcast reaches the unauthenticated event stream; every other field (title,
 * status, …) passes through unchanged. The live path returns the input
 * untouched.
 *
 * Today sealed `current_high_*` are always 0/null (`placeBid`'s sealed branch
 * never writes them), so this is a no-op on current data — it is defense in
 * depth for the deferred sealed-reveal feature, which would populate a winner.
 * The operator's authenticated close response and the won/lost email logic keep
 * the raw values; only this public projection is redacted.
 */
export function publicAuctionClosedAuction<A extends AuctionClosedBroadcast>(
  auction: A
): A {
  if (!isSealedAuction(auction)) return auction;
  return {
    ...auction,
    currentHighBidId: null,
    currentHighBidCents: 0,
    currentHighBidDollars: 0,
    currentHighBidderId: null,
    reserveMet: false
  };
}
