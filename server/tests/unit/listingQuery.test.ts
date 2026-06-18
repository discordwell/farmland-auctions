import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LISTING_ORDER_BY,
  LISTING_SORT_CLAUSES,
  LISTING_SORT_KEYS,
  LISTING_STATUSES,
  buildListingWhere,
  listingQuerySchema
} from "../../listingQuery.js";

const BASE_WHERE = "l.published_at IS NOT NULL";

/**
 * Canonical sort-key set, duplicated as a literal here and in
 * `app/lib/listingFilter.test.ts`. The two halves of the inventory browse (this
 * SQL builder and the client sorter) must offer the same modes; pinning each
 * side to this list makes a one-sided change (a new dropdown option without a SQL
 * clause, or vice versa) fail a test rather than silently diverge.
 */
const CANONICAL_SORT_KEYS = [
  "newest",
  "ppa-asc",
  "ppa-desc",
  "acres-desc",
  "soil-desc"
];

describe("buildListingWhere — base query", () => {
  it("filters to published listings with no params and default order", () => {
    const where = buildListingWhere({});
    assert.equal(where.sql, BASE_WHERE);
    assert.deepEqual(where.values, []);
    assert.equal(where.orderBy, DEFAULT_LISTING_ORDER_BY);
    assert.equal(where.orderBy, "l.updated_at DESC");
  });

  it("ignores unknown query keys (zod strips them)", () => {
    const where = buildListingWhere({ bogus: "x", anotherUnknown: 42 });
    assert.equal(where.sql, BASE_WHERE);
    assert.deepEqual(where.values, []);
  });
});

describe("buildListingWhere — filters", () => {
  it("adds an equality condition for a concrete status", () => {
    const where = buildListingWhere({ status: "For Sale" });
    assert.equal(where.sql, `${BASE_WHERE} AND l.status = $1`);
    assert.deepEqual(where.values, ["For Sale"]);
  });

  it("treats status 'All' as no filter", () => {
    const where = buildListingWhere({ status: "All" });
    assert.equal(where.sql, BASE_WHERE);
    assert.deepEqual(where.values, []);
  });

  it("treats region 'All' as no filter", () => {
    const where = buildListingWhere({ region: "All" });
    assert.equal(where.sql, BASE_WHERE);
    assert.deepEqual(where.values, []);
  });

  it("adds a region equality condition", () => {
    const where = buildListingWhere({ region: "South East" });
    assert.equal(where.sql, `${BASE_WHERE} AND l.region = $1`);
    assert.deepEqual(where.values, ["South East"]);
  });

  it("adds both acres bounds in order", () => {
    const where = buildListingWhere({ minAcres: 100, maxAcres: 640 });
    assert.equal(where.sql, `${BASE_WHERE} AND l.acres >= $1 AND l.acres <= $2`);
    assert.deepEqual(where.values, [100, 640]);
  });

  it("coerces numeric strings (query params arrive as strings)", () => {
    const where = buildListingWhere({ minAcres: "160" });
    assert.equal(where.sql, `${BASE_WHERE} AND l.acres >= $1`);
    assert.deepEqual(where.values, [160]);
  });

  it("adds a soil-rating floor", () => {
    const where = buildListingWhere({ minSoilRating: 60 });
    assert.equal(where.sql, `${BASE_WHERE} AND l.soil_final_rating >= $1`);
    assert.deepEqual(where.values, [60]);
  });

  it("treats minSoilRating=0 as no filter (matches client !value guard)", () => {
    // 0 is a valid rating (schema allows min 0) but `>= 0` matches everything, so
    // the `if (filters.minSoilRating)` guard skips it — the same no-op the client
    // sorter's `!criteria.minSoilRating` produces.
    const where = buildListingWhere({ minSoilRating: 0 });
    assert.equal(where.sql, BASE_WHERE);
    assert.deepEqual(where.values, []);
  });

  it("converts maxPricePerAcre dollars to cents", () => {
    const where = buildListingWhere({ maxPricePerAcre: 5000 });
    assert.equal(where.sql, `${BASE_WHERE} AND l.price_per_acre_cents <= $1`);
    assert.deepEqual(where.values, [500000]);
  });

  it("searches title/rm/region for q against one placeholder, trimmed and wildcarded", () => {
    const where = buildListingWhere({ q: "  lipton  " });
    assert.equal(
      where.sql,
      `${BASE_WHERE} AND (l.title ILIKE $1 OR l.rm ILIKE $1 OR l.region ILIKE $1)`
    );
    assert.deepEqual(where.values, ["%lipton%"]);
  });

  it("numbers placeholders sequentially across multiple filters", () => {
    const where = buildListingWhere({
      status: "Wanted",
      minAcres: 50,
      maxPricePerAcre: 3000,
      q: "caron"
    });
    assert.equal(
      where.sql,
      `${BASE_WHERE} AND l.status = $1 AND l.acres >= $2 AND l.price_per_acre_cents <= $3` +
        ` AND (l.title ILIKE $4 OR l.rm ILIKE $4 OR l.region ILIKE $4)`
    );
    assert.deepEqual(where.values, ["Wanted", 50, 300000, "%caron%"]);
  });
});

describe("buildListingWhere — injection safety", () => {
  it("binds user values as parameters, never interpolating them into SQL", () => {
    const malicious = "x'; DROP TABLE listings; --";
    const where = buildListingWhere({ region: malicious, q: malicious });
    // The dangerous text only ever appears in the bound values, not the SQL.
    assert.ok(!where.sql.includes("DROP TABLE"));
    assert.ok(!where.sql.includes("'"));
    assert.equal(where.sql, `${BASE_WHERE} AND l.region = $1 AND (l.title ILIKE $2 OR l.rm ILIKE $2 OR l.region ILIKE $2)`);
    assert.deepEqual(where.values, [malicious, `%${malicious}%`]);
  });
});

describe("buildListingWhere — ordering", () => {
  it("selects the matching clause for every sort key", () => {
    for (const key of LISTING_SORT_KEYS) {
      const where = buildListingWhere({ sort: key });
      assert.equal(where.orderBy, LISTING_SORT_CLAUSES[key]);
    }
  });

  it("orders ascending price with unpriced lots last (NULLS LAST)", () => {
    // The documented client/server agreement point: an unpriced lot must sort
    // last under "price low → high", mirroring the client's +Infinity key.
    assert.equal(
      buildListingWhere({ sort: "ppa-asc" }).orderBy,
      "l.price_per_acre_cents ASC NULLS LAST, l.updated_at DESC"
    );
  });

  it("falls back to the default order when no sort is given", () => {
    assert.equal(buildListingWhere({ q: "x" }).orderBy, DEFAULT_LISTING_ORDER_BY);
  });
});

describe("buildListingWhere — validation", () => {
  it("rejects a non-positive acreage bound", () => {
    assert.throws(() => buildListingWhere({ minAcres: -5 }));
    assert.throws(() => buildListingWhere({ minAcres: 0 }));
  });

  it("rejects an unknown status", () => {
    assert.throws(() => buildListingWhere({ status: "Foreclosed" }));
  });

  it("rejects an unknown sort key", () => {
    assert.throws(() => buildListingWhere({ sort: "cheapest" }));
  });

  it("rejects a soil rating above 100", () => {
    assert.throws(() => buildListingWhere({ minSoilRating: 101 }));
  });

  it("rejects an over-long search query", () => {
    assert.throws(() => buildListingWhere({ q: "a".repeat(121) }));
  });
});

describe("listing taxonomy contracts", () => {
  it("exposes the five listing statuses the schema validates", () => {
    assert.deepEqual([...LISTING_STATUSES], ["For Sale", "Pending", "Sold", "Wanted", "Lease"]);
  });

  it("keeps the sort-key set in agreement with the canonical (client) list", () => {
    assert.deepEqual([...LISTING_SORT_KEYS], CANONICAL_SORT_KEYS);
  });

  it("defines an ORDER BY clause for exactly the sort keys, no more, no less", () => {
    assert.deepEqual(Object.keys(LISTING_SORT_CLAUSES).sort(), [...LISTING_SORT_KEYS].sort());
  });

  it("orders every sort mode NULLS LAST so missing columns never float to the top", () => {
    for (const key of LISTING_SORT_KEYS) {
      assert.ok(
        LISTING_SORT_CLAUSES[key].includes("NULLS LAST"),
        `${key} clause should pin nulls last`
      );
    }
  });

  it("accepts 'All' as a status sentinel in the query schema", () => {
    assert.equal(listingQuerySchema.parse({ status: "All" }).status, "All");
  });
});
