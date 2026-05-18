import { pool, withTransaction } from "./pool.js";
import { dollarsToCents } from "../serializers.js";

type SeedListing = {
  slug: string;
  title: string;
  rm: string;
  region: string;
  acres: number;
  pricePerAcre: number;
  avgAssessment: number;
  soilRating: number;
  type: "Grain" | "Mixed" | "Pasture" | "Lease";
  status: "For Sale" | "Pending" | "Sold" | "Wanted" | "Lease";
  latitude: number;
  longitude: number;
  image: string;
  satellite: string;
  description: string;
  highlights: string[];
  publish: boolean;
};

const HERO = "/images/hero-fields.jpg";
const SAT = "/images/satellite-fields.jpg";
const PASTURE = "/images/pasture.jpg";
const HARVEST = "/images/harvest.jpg";

const listings: SeedListing[] = [
  {
    slug: "lipton-half-section",
    title: "Lipton half-section",
    rm: "RM Lipton No. 217",
    region: "South · Treaty 4",
    acres: 318.4,
    pricePerAcre: 4460,
    avgAssessment: 112_000,
    soilRating: 72,
    type: "Grain",
    status: "For Sale",
    latitude: 50.93,
    longitude: -103.83,
    image: HERO,
    satellite: SAT,
    description:
      "Two contiguous quarters of brown chernozem, cultivated and seeded continuously since 2014. Surface lease income.",
    highlights: [
      "318.4 title acres · two quarters",
      "Soil class 2 brown chernozem",
      "Active surface lease $4,800/yr",
      "Bin yard + 1,400 bu hopper bottoms"
    ],
    publish: true
  },
  {
    slug: "caron-north-quarter",
    title: "North Caron quarter",
    rm: "RM Caron No. 162",
    region: "South · Treaty 4",
    acres: 158.0,
    pricePerAcre: 3820,
    avgAssessment: 98_000,
    soilRating: 64,
    type: "Grain",
    status: "Pending",
    latitude: 50.4,
    longitude: -105.8,
    image: SAT,
    satellite: SAT,
    description:
      "Quarter section currently in pulse rotation. Offer accepted, conditions removing.",
    highlights: [
      "158 title acres",
      "Pulse rotation last three seasons",
      "Conditional sale · close 30 days"
    ],
    publish: true
  },
  {
    slug: "vanscoy-three-quarter",
    title: "Vanscoy three-quarter",
    rm: "RM Vanscoy No. 345",
    region: "Central · Treaty 6",
    acres: 478.6,
    pricePerAcre: 3140,
    avgAssessment: 81_000,
    soilRating: 58,
    type: "Mixed",
    status: "For Sale",
    latitude: 52.02,
    longitude: -107.07,
    image: PASTURE,
    satellite: SAT,
    description:
      "Mixed grain and pasture across three quarters. 320 cultivated, 160 native grass, fenced.",
    highlights: [
      "478 title acres · three quarters",
      "320 cultivated, 160 native pasture",
      "Perimeter fence in good repair",
      "Well + dugout on east quarter"
    ],
    publish: true
  },
  {
    slug: "coalfields-pasture",
    title: "Coalfields pasture",
    rm: "RM Coalfields No. 4",
    region: "South · Treaty 4",
    acres: 240,
    pricePerAcre: 58,
    avgAssessment: 44_000,
    soilRating: 42,
    type: "Pasture",
    status: "Lease",
    latitude: 49.2,
    longitude: -103.05,
    image: PASTURE,
    satellite: SAT,
    description:
      "Three-year grazing lease on native pasture. Stocking rate 0.6 AUM/ac.",
    highlights: [
      "240 ac native pasture",
      "3-year lease · $58/ac/yr",
      "Stock water from two dugouts",
      "Cross-fenced into three paddocks"
    ],
    publish: true
  },
  {
    slug: "buckland-section",
    title: "Buckland section",
    rm: "RM Buckland No. 491",
    region: "Northern grain belt",
    acres: 640,
    pricePerAcre: 3910,
    avgAssessment: 102_000,
    soilRating: 70,
    type: "Grain",
    status: "Sold",
    latitude: 53.3,
    longitude: -105.75,
    image: HARVEST,
    satellite: SAT,
    description:
      "Full section sold April 14 to a neighbouring operator. Closing record on file.",
    highlights: [
      "640 title acres · full section",
      "Heavy black soil",
      "Closed Apr 14, 2026"
    ],
    publish: true
  },
  {
    slug: "snipe-lake-wanted",
    title: "Snipe Lake — buyer wanted",
    rm: "RM Snipe Lake No. 259",
    region: "Central · Treaty 6",
    acres: 160,
    pricePerAcre: 2800,
    avgAssessment: 55_000,
    soilRating: 50,
    type: "Mixed",
    status: "Wanted",
    latitude: 51.92,
    longitude: -107.43,
    image: PASTURE,
    satellite: SAT,
    description:
      "Qualified buyer seeking 160+ acres in Twp 30–31. Cash, 30-day close.",
    highlights: [
      "Seeking 160+ ac",
      "Soil floor ≥ 50",
      "Cash · 30-day close"
    ],
    publish: true
  },
  {
    slug: "eyebrow-quarter",
    title: "Eyebrow quarter",
    rm: "RM Eyebrow No. 193",
    region: "South · Treaty 4",
    acres: 159.8,
    pricePerAcre: 4120,
    avgAssessment: 104_000,
    soilRating: 68,
    type: "Grain",
    status: "For Sale",
    latitude: 50.74,
    longitude: -105.83,
    image: HERO,
    satellite: SAT,
    description: "Quarter section, cultivated, in canola–wheat rotation. Highway frontage.",
    highlights: [
      "159.8 title acres",
      "Hwy 19 frontage",
      "Canola–wheat rotation"
    ],
    publish: true
  },
  {
    slug: "edenwold-half-section",
    title: "Edenwold half-section",
    rm: "RM Edenwold No. 158",
    region: "South · Treaty 4",
    acres: 320,
    pricePerAcre: 4690,
    avgAssessment: 118_000,
    soilRating: 75,
    type: "Grain",
    status: "For Sale",
    latitude: 50.61,
    longitude: -104.45,
    image: HARVEST,
    satellite: SAT,
    description: "Two quarters of class 1 chernozem inside 30 min of Regina. Rentable yard site.",
    highlights: [
      "320 title acres · two quarters",
      "Class 1 chernozem · soil 75",
      "Yard site with shop + 5,000 bu storage",
      "30 min east of Regina"
    ],
    publish: true
  },
  {
    slug: "hudson-bay-pasture-lease",
    title: "Hudson Bay grazing lease",
    rm: "RM Hudson Bay No. 394",
    region: "Northern grain belt",
    acres: 480,
    pricePerAcre: 62,
    avgAssessment: 38_000,
    soilRating: 38,
    type: "Pasture",
    status: "Lease",
    latitude: 52.85,
    longitude: -102.4,
    image: PASTURE,
    satellite: SAT,
    description: "Five-year community pasture lease on 480 ac aspen parkland.",
    highlights: [
      "480 ac aspen parkland",
      "5-year term · $62/ac/yr",
      "AUM 0.5 stocking rate"
    ],
    publish: true
  },
  {
    slug: "battle-river-quarter",
    title: "Battle River quarter",
    rm: "RM Battle River No. 438",
    region: "Northern grain belt",
    acres: 160,
    pricePerAcre: 3540,
    avgAssessment: 89_000,
    soilRating: 62,
    type: "Grain",
    status: "For Sale",
    latitude: 52.78,
    longitude: -109.41,
    image: HERO,
    satellite: SAT,
    description: "Quarter section, cultivated, soils trending to grey-wooded on north end.",
    highlights: [
      "160 title acres",
      "Soil 62 · class 3",
      "Adjoining 320 ac under same operator"
    ],
    publish: true
  }
];

async function upsertListing(seed: SeedListing) {
  await withTransaction(async (client) => {
    const existing = await client.query("SELECT id FROM listings WHERE slug = $1", [seed.slug]);
    const params = [
      seed.slug,
      seed.title,
      seed.rm,
      seed.region,
      seed.acres,
      dollarsToCents(seed.pricePerAcre),
      dollarsToCents(seed.avgAssessment),
      seed.soilRating,
      seed.type,
      seed.status,
      seed.latitude,
      seed.longitude,
      seed.image,
      seed.satellite,
      seed.description,
      seed.publish
    ];

    let listingId: string;
    if (existing.rowCount && existing.rows[0]) {
      listingId = existing.rows[0].id as string;
      await client.query(
        `
          UPDATE listings SET
            title = $2, rm = $3, region = $4, acres = $5,
            price_per_acre_cents = $6, avg_assessment_per_quarter_cents = $7,
            soil_final_rating = $8, property_type = $9, status = $10,
            latitude = $11, longitude = $12,
            hero_image_url = $13, satellite_image_url = $14,
            description = $15,
            published_at = CASE WHEN $16 THEN COALESCE(published_at, now()) ELSE NULL END,
            updated_at = now()
          WHERE slug = $1
        `,
        params
      );
      await client.query("DELETE FROM listing_highlights WHERE listing_id = $1", [listingId]);
    } else {
      const inserted = await client.query(
        `
          INSERT INTO listings (
            slug, title, rm, region, acres, price_per_acre_cents,
            avg_assessment_per_quarter_cents, soil_final_rating, property_type,
            status, latitude, longitude, hero_image_url, satellite_image_url,
            description,
            published_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
            CASE WHEN $16 THEN now() ELSE NULL END)
          RETURNING id
        `,
        params
      );
      listingId = inserted.rows[0].id as string;
    }

    for (const [index, body] of seed.highlights.entries()) {
      await client.query(
        "INSERT INTO listing_highlights (listing_id, body, position) VALUES ($1, $2, $3)",
        [listingId, body, index + 1]
      );
    }
  });
}

async function main() {
  console.log(`Seeding ${listings.length} listings...`);
  for (const listing of listings) {
    await upsertListing(listing);
    process.stdout.write(`  · ${listing.slug}\n`);
  }
  console.log("Done.");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
