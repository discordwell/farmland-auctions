/**
 * Pure builder for the public inventory query (`GET /api/listings`).
 *
 * This is the SERVER half of a client/server pair: the public home page fetches
 * every published listing once and filters/sorts in the browser via the pure,
 * unit-tested `app/lib/listingFilter.ts`. This module is the SQL counterpart —
 * the filter `WHERE` clause + parameter list and the `ORDER BY` clause that a
 * direct API consumer (or the build-time fixtures fallback in
 * `app/listings/buildFetch.ts`) actually hits. Because the home page never sends
 * `?sort=`/filter params, these branches are otherwise unexercised by the UI, so
 * pulling them out as side-effect-free functions keeps their contract documented
 * and zero-infra testable (no DB, no Fastify) — the same approach as
 * `server/bidRules.ts` and `server/bidVisibility.ts`.
 *
 * The two halves MUST stay in agreement on sort order. `LISTING_SORT_KEYS` here
 * mirrors the client's, and `server/tests/unit/listingQuery.test.ts` +
 * `app/lib/listingFilter.test.ts` each pin their key set to the same canonical
 * list so adding a sort mode to one side without the other fails a test. The one
 * subtlety already reconciled: ascending price orders unpriced lots LAST —
 * `price_per_acre_cents ASC NULLS LAST` here, `priceAscKey` (+Infinity) there.
 */
import { z } from "zod";

import { dollarsToCents } from "./serializers.js";

// Listing status taxonomy. The old property-type enum was replaced by per-listing
// acres composition (acresCultivated, acresPasture, …) in migration 008 and is
// intentionally gone; status is the only remaining listing-level enum.
export const LISTING_STATUSES = ["For Sale", "Pending", "Sold", "Wanted", "Lease"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const listingStatusSchema = z.enum(LISTING_STATUSES);

// Sort modes offered to clients. Keep in lockstep with the client's
// `LISTING_SORT_KEYS` (app/lib/listingFilter.ts) — see the cross-pinned tests.
export const LISTING_SORT_KEYS = [
  "newest",
  "ppa-asc",
  "ppa-desc",
  "acres-desc",
  "soil-desc"
] as const;
export type ListingSortKey = (typeof LISTING_SORT_KEYS)[number];
export const listingSortSchema = z.enum(LISTING_SORT_KEYS);

export const listingQuerySchema = z.object({
  status: listingStatusSchema.or(z.literal("All")).optional(),
  region: z.string().optional(),
  minAcres: z.coerce.number().positive().optional(),
  maxAcres: z.coerce.number().positive().optional(),
  minSoilRating: z.coerce.number().int().min(0).max(100).optional(),
  maxPricePerAcre: z.coerce.number().positive().optional(),
  q: z.string().trim().min(1).max(120).optional(),
  sort: listingSortSchema.optional()
});

export type ListingQuery = z.infer<typeof listingQuerySchema>;

/**
 * Default ordering when no `?sort=` is supplied. Most updated first — the public
 * home page relies on this (it fetches without `?sort=` and only re-sorts client
 * side when the user picks a mode), as does the build-time fixtures fetch.
 */
export const DEFAULT_LISTING_ORDER_BY = "l.updated_at DESC";

/**
 * `ORDER BY` fragment per sort key. The `Record<ListingSortKey, string>` type
 * makes a missing clause a compile error, so the keys here can't drift from the
 * `listingSortSchema` enum. Unpriced/missing columns sort LAST in every mode
 * (`NULLS LAST` under both ASC and DESC), matching the client sorter.
 */
export const LISTING_SORT_CLAUSES: Record<ListingSortKey, string> = {
  newest: "l.published_at DESC NULLS LAST, l.updated_at DESC",
  "ppa-asc": "l.price_per_acre_cents ASC NULLS LAST, l.updated_at DESC",
  "ppa-desc": "l.price_per_acre_cents DESC NULLS LAST, l.updated_at DESC",
  "acres-desc": "l.acres DESC NULLS LAST, l.updated_at DESC",
  "soil-desc": "l.soil_final_rating DESC NULLS LAST, l.updated_at DESC"
};

export type ListingWhere = {
  /** The `WHERE` body (without the `WHERE` keyword), conditions AND-joined. */
  sql: string;
  /** Positional parameter values aligned to the `$1…$n` placeholders in `sql`. */
  values: unknown[];
  /** The `ORDER BY` body (without the `ORDER BY` keyword). */
  orderBy: string;
};

/**
 * Parse + validate the raw request query and build the parameterized `WHERE` +
 * `ORDER BY` for `/api/listings`. Every user value is bound as a `$n` parameter
 * (never interpolated into the SQL string), so the result is injection-safe. Only
 * published listings are returned. Throws `ZodError` on invalid input.
 */
export function buildListingWhere(rawQuery: unknown): ListingWhere {
  const filters = listingQuerySchema.parse(rawQuery);
  const conditions = ["l.published_at IS NOT NULL"];
  const values: unknown[] = [];

  function add(sql: string, value: unknown) {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  }

  if (filters.status && filters.status !== "All") add("l.status = ?", filters.status);
  if (filters.region && filters.region !== "All") add("l.region = ?", filters.region);
  if (filters.minAcres) add("l.acres >= ?", filters.minAcres);
  if (filters.maxAcres) add("l.acres <= ?", filters.maxAcres);
  if (filters.minSoilRating) add("l.soil_final_rating >= ?", filters.minSoilRating);
  if (filters.maxPricePerAcre) {
    add("l.price_per_acre_cents <= ?", dollarsToCents(filters.maxPricePerAcre));
  }

  if (filters.q) {
    values.push(`%${filters.q}%`);
    const idx = `$${values.length}`;
    conditions.push(`(l.title ILIKE ${idx} OR l.rm ILIKE ${idx} OR l.region ILIKE ${idx})`);
  }

  const orderBy = filters.sort ? LISTING_SORT_CLAUSES[filters.sort] : DEFAULT_LISTING_ORDER_BY;

  return {
    sql: conditions.join(" AND "),
    values,
    orderBy
  };
}
