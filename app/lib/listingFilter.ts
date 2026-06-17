/**
 * Pure filter + sort for the public inventory browse (§01 on the home page).
 *
 * `FarmAuctionApp` fetches every published listing once and does all filtering
 * and sorting in the browser — these functions are that logic, pulled out as
 * side-effect-free helpers over a structural `ListingLike` so the inventory
 * grid's behaviour is documented and unit-testable without React, a DOM, or a
 * network round-trip (the same zero-infra approach as `server/bidRules.ts`).
 *
 * Sort order is kept in agreement with the server's SQL (`/api/listings`,
 * `sortClauses` in `server/index.ts`). The one place they used to diverge was
 * ascending price: the server orders `price_per_acre_cents ASC NULLS LAST`, but
 * on the client an unpriced lot arrives as `pricePerAcre === 0` (serializeListing
 * coerces null → 0), so a naive `a - b` floated every $0 lot (unpriced "Wanted"
 * lots, seller drafts with no target price) to the TOP of "low → high".
 * `priceAscKey` maps a non-positive price to +Infinity so those lots sort last,
 * where the server already puts them.
 */

export const LISTING_SORT_KEYS = [
  "newest",
  "ppa-asc",
  "ppa-desc",
  "acres-desc",
  "soil-desc"
] as const;

export type ListingSortKey = (typeof LISTING_SORT_KEYS)[number];

/** The minimal listing shape the inventory filter/sort reads. */
export type ListingLike = {
  status: string;
  region: string;
  acres: number;
  soilRating: number;
  pricePerAcre: number;
  title: string;
  rm: string;
};

/**
 * The §01 filter-row state. Numeric bounds arrive as the raw form-field values
 * (a string while typed, `""` when blank); an empty/blank/zero bound means "no
 * filter", matching the `!value` guards the inventory grid has always used.
 */
export type ListingFilterCriteria = {
  status: string[];
  region: string;
  minAcres: string | number;
  minSoilRating: string | number;
  maxPricePerAcre: string | number;
  searchQuery: string;
};

/** Whether one listing passes the current filter row. */
export function listingMatchesFilters(
  listing: ListingLike,
  criteria: ListingFilterCriteria
): boolean {
  const lc = criteria.searchQuery.trim().toLowerCase();
  const statusMatch =
    criteria.status.includes("All") || criteria.status.includes(listing.status);
  const regionMatch = criteria.region === "All" || criteria.region === listing.region;
  const acresMatch = !criteria.minAcres || listing.acres >= Number(criteria.minAcres);
  const soilMatch =
    !criteria.minSoilRating || listing.soilRating >= Number(criteria.minSoilRating);
  const priceMatch =
    !criteria.maxPricePerAcre ||
    listing.pricePerAcre <= Number(criteria.maxPricePerAcre);
  const queryMatch =
    !lc ||
    listing.title.toLowerCase().includes(lc) ||
    listing.rm.toLowerCase().includes(lc) ||
    listing.region.toLowerCase().includes(lc);
  return statusMatch && regionMatch && acresMatch && soilMatch && priceMatch && queryMatch;
}

/** Ascending price sort key: unpriced (<= 0) lots sort last (server NULLS LAST). */
function priceAscKey(pricePerAcre: number): number {
  return pricePerAcre > 0 ? pricePerAcre : Number.POSITIVE_INFINITY;
}

/**
 * Sort a copy of `listings` by `sortKey`. "newest" preserves the incoming order
 * (the server already returns published_at/updated_at DESC). `Array.sort` is
 * stable, so lots that tie keep their incoming order.
 */
export function sortListings<T extends ListingLike>(
  listings: readonly T[],
  sortKey: ListingSortKey
): T[] {
  const copy = [...listings];
  switch (sortKey) {
    case "ppa-asc":
      return copy.sort((a, b) => priceAscKey(a.pricePerAcre) - priceAscKey(b.pricePerAcre));
    case "ppa-desc":
      return copy.sort((a, b) => b.pricePerAcre - a.pricePerAcre);
    case "acres-desc":
      return copy.sort((a, b) => b.acres - a.acres);
    case "soil-desc":
      return copy.sort((a, b) => b.soilRating - a.soilRating);
    default:
      return copy;
  }
}

/** Filter then sort — the exact pipeline the §01 inventory grid renders. */
export function selectListings<T extends ListingLike>(
  listings: readonly T[],
  criteria: ListingFilterCriteria,
  sortKey: ListingSortKey
): T[] {
  return sortListings(
    listings.filter((listing) => listingMatchesFilters(listing, criteria)),
    sortKey
  );
}
