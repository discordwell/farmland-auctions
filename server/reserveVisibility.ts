/**
 * Pure rules for how much of an auction's RESERVE state may be exposed on PUBLIC
 * (unauthenticated) surfaces.
 *
 * Every auction carries a `reserve_visibility` (the column is CHECK-constrained
 * to one of `RESERVE_VISIBILITIES`):
 *   - `public`   — the reserve and whether it has been met are both public.
 *   - `met-only` — only the met/pending state is public; the price stays private.
 *   - `hidden`   — neither the price nor the met/pending state may be public; a
 *                  bidder must not be able to tell whether the floor has cleared.
 *
 * `serializeAuction` never emits the reserve *price*, so the one publicly
 * derived bit is `reserveMet` (high bid ≥ reserve). For `hidden` that bit is
 * itself confidential — leaking it tells the room the seller's floor was reached.
 * This module is the single place that decides whether `reserveMet` may survive
 * onto a public surface, applied to every public read/broadcast that carries a
 * serialized auction: `GET /api/auctions`, `GET /api/auctions/:id`, and the
 * `bid.accepted` / `auction.closed` SSE payloads.
 *
 * Operator/admin surfaces are authenticated and read the serialized auction
 * directly (the admin console, the operator's own close response) — this gate
 * never touches them, exactly as `requireAdmin` callers bypass `bidVisibility`.
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
