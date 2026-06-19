/**
 * Pure rules for how much of an auction's RESERVE state may be exposed to a
 * given audience.
 *
 * Every auction carries a `reserve_visibility` (the column is CHECK-constrained
 * to one of `RESERVE_VISIBILITIES`):
 *   - `public`   — the reserve price and whether it has been met are both public.
 *   - `met-only` — only the met/pending state is public; the price stays private.
 *   - `hidden`   — neither the price nor the met/pending state may be public; a
 *                  bidder must not be able to tell whether the floor has cleared.
 *
 * Two surfaces consume these rules:
 *
 * 1. PUBLIC (unauthenticated). `serializeAuction` never emits the reserve
 *    *price*, so the one publicly derived bit is `reserveMet` (high bid ≥
 *    reserve). For `hidden` that bit is itself confidential — leaking it tells
 *    the room the seller's floor was reached. `publicReserveView` is the single
 *    gate that decides whether `reserveMet` may survive onto a public surface,
 *    applied to every public read/broadcast that carries a serialized auction:
 *    `GET /api/auctions`, `GET /api/auctions/:id`, and the `bid.accepted` /
 *    `auction.closed` SSE payloads.
 *
 * 2. REGISTRANT (authenticated bidder, `GET /api/me/summary`). A registered
 *    bidder is the room — the very audience a concealed reserve exists to keep
 *    in the dark — so they are held to the *same* standard as the public, not a
 *    looser one: a `hidden` or `met-only` floor's PRICE is operator-only, and a
 *    `hidden` floor's met/pending state stays withheld. `registrantReserveView`
 *    is the gate for that surface. (The registrations query joins the auction's
 *    raw `reserve_price_cents`, which would otherwise reach the bidder verbatim.)
 *
 * Operator/admin surfaces are authenticated AND privileged: they read the
 * serialized auction / raw reserve directly (the admin console, the operator's
 * own close response) — these gates never touch them, exactly as `requireAdmin`
 * callers bypass `bidVisibility`.
 *
 * Kept side-effect-free (no DB, no I/O, no clock) so the confidentiality
 * decision is named, documented, and unit-testable without infrastructure — the
 * same pattern as ./bidVisibility and ./bidRules.
 */

/** The reserve-visibility levels the `auctions.reserve_visibility` column allows. */
export const RESERVE_VISIBILITIES = ["hidden", "met-only", "public"] as const;
export type ReserveVisibility = (typeof RESERVE_VISIBILITIES)[number];

/**
 * Whether the reserve met/pending indicator may appear on a public surface.
 *
 * `met-only` and `public` advertise that bit; `hidden` does not. Anything else —
 * an unknown or typo'd value — fails CLOSED (treated as hidden) so a
 * mis-configured auction can never accidentally leak its floor state. Only an
 * exact, recognized "show it" value opens the gate.
 */
export function reserveMetVisible(auction: { reserveVisibility: string }): boolean {
  return (
    auction.reserveVisibility === "met-only" || auction.reserveVisibility === "public"
  );
}

/**
 * Whether the reserve PRICE (the seller's actual floor in cents) may be exposed
 * at all.
 *
 * Only a `public` reserve advertises its price. `met-only` publishes the
 * met/pending bit but keeps the number private, and `hidden` keeps everything
 * private. Like `reserveMetVisible`, this fails CLOSED — any unknown or typo'd
 * visibility withholds the price — so a mis-configured auction can never
 * accidentally reveal the floor. This is a strict subset of `reserveMetVisible`:
 * a surface that may not show the met bit may certainly not show the price.
 */
export function reservePriceVisible(auction: { reserveVisibility: string }): boolean {
  return auction.reserveVisibility === "public";
}

/** The reserve-related fields a serialized auction carries onto public surfaces. */
export type ReserveView = {
  reserveVisibility: string;
  reserveMet: boolean;
};

/**
 * Project a serialized auction down to the reserve state a public client may
 * see. For `met-only`/`public` the auction passes through untouched (same
 * reference). For a `hidden` (or unknown) visibility, `reserveMet` is forced to
 * its unstarted default of `false` so the true state never reaches an
 * unauthenticated client; `reserveVisibility` itself is preserved so the UI can
 * tell "redacted" apart from a genuine "pending" and render neither. The input
 * is never mutated, and every non-reserve field passes through unchanged.
 */
export function publicReserveView<A extends ReserveView>(auction: A): A {
  if (reserveMetVisible(auction)) return auction;
  return { ...auction, reserveMet: false };
}

/** The reserve fields a serialized auction may expose to an authenticated registrant. */
export type RegistrantReserveView = {
  /**
   * The auction's reserve-visibility level, preserved so a client can tell a
   * withheld reserve (price `null`, met `null`) apart from a genuine pending.
   */
  reserveVisibility: string;
  /** The reserve price in cents — exposed ONLY for `public`; `null` otherwise. */
  reservePriceCents: number | null;
  /**
   * Whether the floor has been cleared — a real boolean for `met-only`/`public`,
   * `null` (withheld) for `hidden` and any unknown visibility.
   */
  reserveMet: boolean | null;
};

/**
 * Project an auction's raw reserve columns down to what a registered bidder may
 * see for one of their own registrations (`GET /api/me/summary`).
 *
 * The bidder is held to the same confidentiality posture as the public room
 * (see this module's header): the price survives only for a `public` reserve,
 * and the met/pending bit survives only when `reserveMetVisible` allows it —
 * `null` (withheld), not `false`, when it does not, so a withheld floor is
 * distinguishable from one that simply has not cleared. The met computation
 * mirrors `serializeAuction`: met requires a positive reserve that the current
 * high bid has reached. Both gates fail closed for an unknown visibility.
 *
 * `*Cents` inputs accept `bigint`-as-string (node-pg's representation of the
 * `bigint` columns) or numbers; the price is coerced to a number on the way out.
 */
export function registrantReserveView(input: {
  reserveVisibility: string;
  reservePriceCents: number | string | null;
  currentHighBidCents: number | string | null;
}): RegistrantReserveView {
  const reserveVisibility = input.reserveVisibility;
  const priceCents = input.reservePriceCents == null ? null : Number(input.reservePriceCents);
  const highCents = input.currentHighBidCents == null ? null : Number(input.currentHighBidCents);

  return {
    reserveVisibility,
    reservePriceCents: reservePriceVisible({ reserveVisibility }) ? priceCents : null,
    reserveMet: reserveMetVisible({ reserveVisibility })
      ? priceCents != null && priceCents > 0 && highCents != null && highCents >= priceCents
      : null
  };
}
