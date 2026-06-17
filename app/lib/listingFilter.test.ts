import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ListingFilterCriteria,
  type ListingLike,
  listingMatchesFilters,
  selectListings,
  sortListings
} from "./listingFilter";

function listing(overrides: Partial<ListingLike> = {}): ListingLike {
  return {
    status: "For Sale",
    region: "South East",
    acres: 160,
    soilRating: 62,
    pricePerAcre: 3000,
    title: "Lipton half-section",
    rm: "RM Lipton No. 217",
    ...overrides
  };
}

const NO_FILTERS: ListingFilterCriteria = {
  status: ["All"],
  region: "All",
  minAcres: "",
  minSoilRating: "",
  maxPricePerAcre: "",
  searchQuery: ""
};

describe("listingMatchesFilters", () => {
  it("matches everything when no filters are set", () => {
    assert.equal(listingMatchesFilters(listing(), NO_FILTERS), true);
  });

  it("honours a multi-select status filter and the 'All' bypass", () => {
    const wanted = listing({ status: "Wanted" });
    assert.equal(listingMatchesFilters(wanted, { ...NO_FILTERS, status: ["For Sale"] }), false);
    assert.equal(
      listingMatchesFilters(wanted, { ...NO_FILTERS, status: ["For Sale", "Wanted"] }),
      true
    );
    assert.equal(listingMatchesFilters(wanted, { ...NO_FILTERS, status: ["All"] }), true);
  });

  it("filters by exact region", () => {
    assert.equal(
      listingMatchesFilters(listing({ region: "West Central" }), {
        ...NO_FILTERS,
        region: "South East"
      }),
      false
    );
  });

  it("treats blank/zero numeric bounds as 'no filter'", () => {
    // "" and 0 must NOT exclude anything — they're the empty-form-field state.
    for (const empty of ["", 0] as const) {
      assert.equal(
        listingMatchesFilters(listing({ acres: 5 }), { ...NO_FILTERS, minAcres: empty }),
        true
      );
    }
  });

  it("applies minAcres / minSoilRating as inclusive lower bounds", () => {
    assert.equal(
      listingMatchesFilters(listing({ acres: 160 }), { ...NO_FILTERS, minAcres: "160" }),
      true
    );
    assert.equal(
      listingMatchesFilters(listing({ acres: 159 }), { ...NO_FILTERS, minAcres: "160" }),
      false
    );
    assert.equal(
      listingMatchesFilters(listing({ soilRating: 62 }), { ...NO_FILTERS, minSoilRating: 62 }),
      true
    );
  });

  it("applies maxPricePerAcre as an inclusive upper bound", () => {
    assert.equal(
      listingMatchesFilters(listing({ pricePerAcre: 3000 }), {
        ...NO_FILTERS,
        maxPricePerAcre: 3000
      }),
      true
    );
    assert.equal(
      listingMatchesFilters(listing({ pricePerAcre: 3001 }), {
        ...NO_FILTERS,
        maxPricePerAcre: 3000
      }),
      false
    );
  });

  it("searches title, rm, and region case-insensitively", () => {
    assert.equal(listingMatchesFilters(listing(), { ...NO_FILTERS, searchQuery: "LIPTON" }), true);
    assert.equal(listingMatchesFilters(listing(), { ...NO_FILTERS, searchQuery: "no. 217" }), true);
    assert.equal(
      listingMatchesFilters(listing(), { ...NO_FILTERS, searchQuery: "south east" }),
      true
    );
    assert.equal(listingMatchesFilters(listing(), { ...NO_FILTERS, searchQuery: "manitoba" }), false);
  });

  it("ignores surrounding whitespace in the search query", () => {
    assert.equal(listingMatchesFilters(listing(), { ...NO_FILTERS, searchQuery: "   " }), true);
    assert.equal(
      listingMatchesFilters(listing(), { ...NO_FILTERS, searchQuery: "  lipton  " }),
      true
    );
  });
});

describe("sortListings", () => {
  it("preserves input order for 'newest'", () => {
    const rows = [listing({ title: "a" }), listing({ title: "b" }), listing({ title: "c" })];
    assert.deepEqual(
      sortListings(rows, "newest").map((r) => r.title),
      ["a", "b", "c"]
    );
  });

  it("sorts by price ascending and descending", () => {
    const rows = [
      listing({ title: "mid", pricePerAcre: 3000 }),
      listing({ title: "low", pricePerAcre: 1000 }),
      listing({ title: "high", pricePerAcre: 5000 })
    ];
    assert.deepEqual(
      sortListings(rows, "ppa-asc").map((r) => r.title),
      ["low", "mid", "high"]
    );
    assert.deepEqual(
      sortListings(rows, "ppa-desc").map((r) => r.title),
      ["high", "mid", "low"]
    );
  });

  it("sorts unpriced lots LAST under ascending price (matches server NULLS LAST)", () => {
    // Regression guard: serializeListing coerces a null price to 0, so a naive
    // `a - b` would float every $0 lot to the top of "low → high". They belong
    // at the bottom, where `price_per_acre_cents ASC NULLS LAST` puts them.
    const rows = [
      listing({ title: "unpriced", pricePerAcre: 0 }),
      listing({ title: "cheap", pricePerAcre: 1500 }),
      listing({ title: "dear", pricePerAcre: 4800 })
    ];
    assert.deepEqual(
      sortListings(rows, "ppa-asc").map((r) => r.title),
      ["cheap", "dear", "unpriced"]
    );
  });

  it("keeps multiple unpriced lots after every priced lot, in input order", () => {
    const rows = [
      listing({ title: "free-a", pricePerAcre: 0 }),
      listing({ title: "priced", pricePerAcre: 2000 }),
      listing({ title: "free-b", pricePerAcre: 0 })
    ];
    assert.deepEqual(
      sortListings(rows, "ppa-asc").map((r) => r.title),
      ["priced", "free-a", "free-b"]
    );
  });

  it("sorts by acres and soil rating, descending", () => {
    const rows = [
      listing({ title: "small", acres: 160, soilRating: 40 }),
      listing({ title: "big", acres: 640, soilRating: 80 })
    ];
    assert.deepEqual(
      sortListings(rows, "acres-desc").map((r) => r.title),
      ["big", "small"]
    );
    assert.deepEqual(
      sortListings(rows, "soil-desc").map((r) => r.title),
      ["big", "small"]
    );
  });

  it("does not mutate the input array", () => {
    const rows = [
      listing({ title: "b", pricePerAcre: 2000 }),
      listing({ title: "a", pricePerAcre: 1000 })
    ];
    const before = rows.map((r) => r.title);
    sortListings(rows, "ppa-asc");
    assert.deepEqual(
      rows.map((r) => r.title),
      before
    );
  });
});

describe("selectListings", () => {
  it("filters then sorts in one pass", () => {
    const rows = [
      listing({ title: "se-dear", region: "South East", pricePerAcre: 4000 }),
      listing({ title: "wc-cheap", region: "West Central", pricePerAcre: 1000 }),
      listing({ title: "se-cheap", region: "South East", pricePerAcre: 2000 })
    ];
    const result = selectListings(rows, { ...NO_FILTERS, region: "South East" }, "ppa-asc");
    assert.deepEqual(
      result.map((r) => r.title),
      ["se-cheap", "se-dear"]
    );
  });

  it("returns an empty array when nothing matches", () => {
    const rows = [listing({ status: "Sold" })];
    assert.deepEqual(selectListings(rows, { ...NO_FILTERS, status: ["Wanted"] }, "newest"), []);
  });
});
