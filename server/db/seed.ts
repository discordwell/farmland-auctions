import { hashPassword } from "../auth.js";
import { pool, query, withTransaction } from "./pool.js";
import { dollarsToCents } from "../serializers.js";

type SeedUser = {
  email: string;
  password: string;
  role: "admin" | "user";
  displayName: string;
  intent: "buyer" | "seller" | "both" | null;
};

const demoUsers: SeedUser[] = [
  {
    email: "admin@farmauction.demo",
    password: "admin12345",
    role: "admin",
    displayName: "Demo Admin",
    intent: null
  },
  {
    email: "buyer@farmauction.demo",
    password: "buyer12345",
    role: "user",
    displayName: "Demo Buyer",
    intent: "buyer"
  },
  {
    email: "seller@farmauction.demo",
    password: "seller12345",
    role: "user",
    displayName: "Demo Seller",
    intent: "seller"
  }
];

const deprecatedDemoEmails = ["bidder@farmauction.demo"];

async function upsertDemoUser(user: SeedUser) {
  const hash = await hashPassword(user.password);
  await query(
    `
      INSERT INTO users (email, password_hash, role, display_name, intent)
      VALUES (lower($1), $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        intent = EXCLUDED.intent,
        updated_at = now()
    `,
    [user.email, hash, user.role, user.displayName, user.intent]
  );
}

async function removeDeprecatedDemoUser(email: string) {
  const result = await query<{ id: string }>(
    "DELETE FROM users WHERE lower(email) = lower($1) RETURNING id",
    [email]
  );
  return result.rowCount ?? 0;
}

type SeedListing = {
  slug: string;
  title: string;
  rm: string;
  region: string;
  legalDescription: string;
  acres: number;
  acresCultivated: number;
  acresPasture: number;
  acresHayland: number;
  acresBush: number;
  acresYard: number;
  pricePerAcre: number;
  avgAssessment: number;
  soilRating: number;
  status: "For Sale" | "Pending" | "Sold" | "Wanted" | "Lease";
  latitude: number;
  longitude: number;
  image: string;
  satellite: string;
  description: string;
  highlights: string[];
  publish: boolean;
};

const SAT = "/images/satellite-fields.jpg";

// Per-lot art (under public/images/lots/) generated for the demo.
// Lots that don't have bespoke art fall back to the stock hero/harvest images.
const lotArt = {
  lipton: "/images/lots/lipton-half-section.png",
  caron: "/images/lots/caron-north-quarter.png",
  vanscoy: "/images/lots/vanscoy-three-quarter.png",
  coalfields: "/images/lots/coalfields-pasture.png",
  buckland: "/images/lots/buckland-section.png",
  snipeLake: "/images/lots/snipe-lake-wanted.png",
  eyebrow: "/images/lots/eyebrow-quarter.png",
  edenwold: "/images/lots/edenwold-half-section.png",
  hudsonBay: "/images/lots/hudson-bay-pasture-lease.png",
  battleRiver: "/images/lots/battle-river-quarter.png"
};

const listings: SeedListing[] = [
  {
    slug: "lipton-half-section",
    title: "Lipton half-section",
    rm: "RM Lipton No. 217",
    region: "South · Treaty 4",
    legalDescription: "SE-14-22-19 W2 + SW-13-22-19 W2",
    acres: 318.4,
    acresCultivated: 280,
    acresPasture: 24,
    acresHayland: 0,
    acresBush: 6,
    acresYard: 8,
    pricePerAcre: 4460,
    avgAssessment: 112_000,
    soilRating: 72,
    status: "For Sale",
    latitude: 50.93,
    longitude: -103.83,
    image: lotArt.lipton,
    satellite: SAT,
    description:
      "Two contiguous quarters of brown chernozem, cultivated and seeded continuously since 2014. Surface lease income.",
    highlights: [
      "318.4 title acres · two quarters",
      "280 ac cultivated · 24 ac pasture · 8 ac yard",
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
    legalDescription: "NE-8-16-26 W2",
    acres: 158.0,
    acresCultivated: 152,
    acresPasture: 0,
    acresHayland: 0,
    acresBush: 6,
    acresYard: 0,
    pricePerAcre: 3820,
    avgAssessment: 98_000,
    soilRating: 64,
    status: "Pending",
    latitude: 50.4,
    longitude: -105.8,
    image: lotArt.caron,
    satellite: SAT,
    description:
      "Quarter section currently in pulse rotation. Offer accepted, conditions removing.",
    highlights: [
      "158 title acres · 152 cultivated",
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
    legalDescription: "NW-22-35-9 W3 + NE-21-35-9 W3 + SE-28-35-9 W3",
    acres: 478.6,
    acresCultivated: 320,
    acresPasture: 140,
    acresHayland: 0,
    acresBush: 18,
    acresYard: 0,
    pricePerAcre: 3140,
    avgAssessment: 81_000,
    soilRating: 58,
    status: "For Sale",
    latitude: 52.02,
    longitude: -107.07,
    image: lotArt.vanscoy,
    satellite: SAT,
    description:
      "Mixed grain and pasture across three quarters. 320 cultivated, 140 native pasture, fenced.",
    highlights: [
      "478.6 title acres · three quarters",
      "320 ac cultivated, 140 ac native pasture",
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
    legalDescription: "S 1/2 of 30-3-7 W2 (NW + SW)",
    acres: 240,
    acresCultivated: 0,
    acresPasture: 240,
    acresHayland: 0,
    acresBush: 0,
    acresYard: 0,
    pricePerAcre: 58,
    avgAssessment: 44_000,
    soilRating: 42,
    status: "Lease",
    latitude: 49.2,
    longitude: -103.05,
    image: lotArt.coalfields,
    satellite: SAT,
    description:
      "Three-year grazing lease on native pasture. Stocking rate 0.6 AUM/ac.",
    highlights: [
      "240 ac native pasture · all grazing",
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
    legalDescription: "Section 36-49-2 W3",
    acres: 640,
    acresCultivated: 600,
    acresPasture: 0,
    acresHayland: 30,
    acresBush: 10,
    acresYard: 0,
    pricePerAcre: 3910,
    avgAssessment: 102_000,
    soilRating: 70,
    status: "Sold",
    latitude: 53.3,
    longitude: -105.75,
    image: lotArt.buckland,
    satellite: SAT,
    description:
      "Full section sold April 14 to a neighbouring operator. Closing record on file.",
    highlights: [
      "640 title acres · full section",
      "600 ac cultivated · 30 ac hayland",
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
    legalDescription: "Any quarter, Twp 30–31 Rge 11–14 W3",
    acres: 160,
    acresCultivated: 100,
    acresPasture: 60,
    acresHayland: 0,
    acresBush: 0,
    acresYard: 0,
    pricePerAcre: 2800,
    avgAssessment: 55_000,
    soilRating: 50,
    status: "Wanted",
    latitude: 51.92,
    longitude: -107.43,
    image: lotArt.snipeLake,
    satellite: SAT,
    description:
      "Qualified buyer seeking 160+ acres in Twp 30–31 W3. Cash, 30-day close.",
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
    legalDescription: "SW-10-19-2 W3",
    acres: 159.8,
    acresCultivated: 156,
    acresPasture: 0,
    acresHayland: 0,
    acresBush: 4,
    acresYard: 0,
    pricePerAcre: 4120,
    avgAssessment: 104_000,
    soilRating: 68,
    status: "For Sale",
    latitude: 50.74,
    longitude: -105.83,
    image: lotArt.eyebrow,
    satellite: SAT,
    description: "Quarter section, cultivated, in canola–wheat rotation. Highway frontage.",
    highlights: [
      "159.8 title acres · 156 cultivated",
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
    legalDescription: "NE-32-18-17 W2 + NW-32-18-17 W2",
    acres: 320,
    acresCultivated: 296,
    acresPasture: 0,
    acresHayland: 18,
    acresBush: 0,
    acresYard: 6,
    pricePerAcre: 4690,
    avgAssessment: 118_000,
    soilRating: 75,
    status: "For Sale",
    latitude: 50.61,
    longitude: -104.45,
    image: lotArt.edenwold,
    satellite: SAT,
    description: "Two quarters of class 1 chernozem inside 30 min of Regina. Rentable yard site.",
    highlights: [
      "320 title acres · two quarters",
      "296 ac cultivated · 18 ac hayland",
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
    legalDescription: "E 1/2 of 12-46-3 W2 + SE-13-46-3 W2",
    acres: 480,
    acresCultivated: 0,
    acresPasture: 420,
    acresHayland: 0,
    acresBush: 60,
    acresYard: 0,
    pricePerAcre: 62,
    avgAssessment: 38_000,
    soilRating: 38,
    status: "Lease",
    latitude: 52.85,
    longitude: -102.4,
    image: lotArt.hudsonBay,
    satellite: SAT,
    description: "Five-year community pasture lease on 480 ac aspen parkland.",
    highlights: [
      "420 ac native pasture · 60 ac aspen bush",
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
    legalDescription: "NW-24-44-23 W3",
    acres: 160,
    acresCultivated: 142,
    acresPasture: 0,
    acresHayland: 0,
    acresBush: 18,
    acresYard: 0,
    pricePerAcre: 3540,
    avgAssessment: 89_000,
    soilRating: 62,
    status: "For Sale",
    latitude: 52.78,
    longitude: -109.41,
    image: lotArt.battleRiver,
    satellite: SAT,
    description: "Quarter section, cultivated, soils trending to grey-wooded on north end.",
    highlights: [
      "160 title acres · 142 cultivated · 18 bush",
      "Soil 62 · class 3 grey-wooded transition",
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
      seed.legalDescription,
      seed.acres,
      seed.acresCultivated,
      seed.acresPasture,
      seed.acresHayland,
      seed.acresBush,
      seed.acresYard,
      dollarsToCents(seed.pricePerAcre),
      dollarsToCents(seed.avgAssessment),
      seed.soilRating,
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
            title = $2, rm = $3, region = $4, legal_description = $5,
            acres = $6, acres_cultivated = $7, acres_pasture = $8,
            acres_hayland = $9, acres_bush = $10, acres_yard = $11,
            price_per_acre_cents = $12, avg_assessment_per_quarter_cents = $13,
            soil_final_rating = $14, status = $15,
            latitude = $16, longitude = $17,
            hero_image_url = $18, satellite_image_url = $19,
            description = $20,
            published_at = CASE WHEN $21 THEN COALESCE(published_at, now()) ELSE NULL END,
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
            slug, title, rm, region, legal_description,
            acres, acres_cultivated, acres_pasture, acres_hayland, acres_bush, acres_yard,
            price_per_acre_cents, avg_assessment_per_quarter_cents,
            soil_final_rating, status,
            latitude, longitude, hero_image_url, satellite_image_url,
            description, published_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13,
            $14, $15,
            $16, $17, $18, $19,
            $20,
            CASE WHEN $21 THEN now() ELSE NULL END
          )
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
  console.log(`Seeding ${demoUsers.length} demo accounts...`);
  for (const user of demoUsers) {
    await upsertDemoUser(user);
    process.stdout.write(`  · ${user.email} (${user.role})\n`);
  }
  for (const email of deprecatedDemoEmails) {
    const removed = await removeDeprecatedDemoUser(email);
    if (removed > 0) {
      process.stdout.write(`  · removed deprecated ${email}\n`);
    }
  }

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
