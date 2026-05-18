import { pool, withTransaction } from "./pool.js";

const agentId = "10000000-0000-4000-8000-000000000001";
const listingId = "20000000-0000-4000-8000-000000000001";
const auctionId = "30000000-0000-4000-8000-000000000001";
const bidderIds = [
  "40000000-0000-4000-8000-000000000118",
  "40000000-0000-4000-8000-000000000042",
  "40000000-0000-4000-8000-000000000077",
  "40000000-0000-4000-8000-000000000204"
];

async function seed() {
  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO agents (id, name, title, email, phone, brokerage)
        VALUES ($1, 'Cameron Wyatt', 'Saskatchewan REALTOR', 'cameron@wyattrealty.ca', '+1-306-000-0000', 'Wyatt Realty Group')
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          title = EXCLUDED.title,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          brokerage = EXCLUDED.brokerage
      `,
      [agentId]
    );

    await client.query(
      `
        INSERT INTO listings (
          id, slug, title, rm, region, acres, price_per_acre_cents,
          avg_assessment_per_quarter_cents, soil_final_rating, property_type,
          status, latitude, longitude, hero_image_url, satellite_image_url,
          description, agent_id, published_at
        )
        VALUES
          ($1, 'rm-271-grain-quarter-package', 'RM 271 Grain Quarter Package', 'RM of Coteau No. 255',
           'West Central', 641, 382500, 30800000, 61, 'Grain', 'For Sale',
           51.056, -107.161, '/images/hero-fields.jpg', '/images/satellite-fields.jpg',
           'Four-quarter Saskatchewan grain package with broker-reviewed listing data, media, soils, and auction readiness.',
           $2, now()),
          ('20000000-0000-4000-8000-000000000002', 'moose-range-mixed-land', 'Moose Range Mixed Land', 'RM of Moose Range No. 486',
           'North East', 318, 214000, 17650000, 47, 'Mixed', 'Pending',
           52.841, -103.988, '/images/harvest.jpg', '/images/satellite-fields.jpg',
           'Mixed hay and pasture land with water and road exposure.',
           $2, now()),
          ('20000000-0000-4000-8000-000000000003', 'assiniboia-pasture-block', 'Assiniboia Pasture Block', 'RM of Lake of the Rivers No. 72',
           'South East', 962, 137500, 12125000, 39, 'Pasture', 'Lease',
           49.617, -105.994, '/images/pasture.jpg', '/images/satellite-fields.jpg',
           'Fenced pasture block with seasonal water and leaseback potential.',
           $2, now())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          rm = EXCLUDED.rm,
          region = EXCLUDED.region,
          acres = EXCLUDED.acres,
          price_per_acre_cents = EXCLUDED.price_per_acre_cents,
          avg_assessment_per_quarter_cents = EXCLUDED.avg_assessment_per_quarter_cents,
          soil_final_rating = EXCLUDED.soil_final_rating,
          property_type = EXCLUDED.property_type,
          status = EXCLUDED.status,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          hero_image_url = EXCLUDED.hero_image_url,
          satellite_image_url = EXCLUDED.satellite_image_url,
          description = EXCLUDED.description,
          updated_at = now()
      `,
      [listingId, agentId]
    );

    await client.query(
      `
        DELETE FROM listing_highlights
        WHERE listing_id IN (
          $1,
          '20000000-0000-4000-8000-000000000002',
          '20000000-0000-4000-8000-000000000003'
        )
      `,
      [listingId]
    );

    await client.query(
      `
        INSERT INTO listing_highlights (listing_id, body, position)
        VALUES
          ($1, '4 contiguous quarters', 1),
          ($1, 'Class H/J soils', 2),
          ($1, 'Yard access', 3),
          ('20000000-0000-4000-8000-000000000002', 'Hay and pasture', 1),
          ('20000000-0000-4000-8000-000000000002', 'Dugout water', 2),
          ('20000000-0000-4000-8000-000000000002', 'Road on two sides', 3),
          ('20000000-0000-4000-8000-000000000003', 'Fenced block', 1),
          ('20000000-0000-4000-8000-000000000003', 'Seasonal creek', 2),
          ('20000000-0000-4000-8000-000000000003', 'Leaseback available', 3)
      `,
      [listingId]
    );

    const bidders = [
      [bidderIds[0], "bidder118@example.com", "Prairie Grain Ltd.", "approved"],
      [bidderIds[1], "bidder042@example.com", "North Ridge Farms", "approved"],
      [bidderIds[2], "bidder077@example.com", "Bidder 077", "approved"],
      [bidderIds[3], "bidder204@example.com", "Bidder 204", "approved"]
    ];

    for (const bidder of bidders) {
      await client.query(
        `
          INSERT INTO bidders (id, email, legal_name, verification_status)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            legal_name = EXCLUDED.legal_name,
            verification_status = EXCLUDED.verification_status,
            updated_at = now()
        `,
        bidder
      );
    }

    await client.query(
      `
        INSERT INTO auctions (
          id, listing_id, title, status, auction_type, opens_at, closes_at,
          soft_close_seconds, bid_increment_cents, reserve_price_cents,
          reserve_visibility, current_high_bid_cents, current_high_bidder_id, version
        )
        VALUES (
          $1, $2, 'RM 271 Grain Quarter Package', 'open', 'live',
          now() - interval '1 hour', now() + interval '90 minutes',
          300, 2500000, 220000000, 'met-only', 228500000, $3, 4
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          opens_at = EXCLUDED.opens_at,
          closes_at = EXCLUDED.closes_at,
          current_high_bid_cents = GREATEST(auctions.current_high_bid_cents, EXCLUDED.current_high_bid_cents),
          current_high_bidder_id = COALESCE(auctions.current_high_bidder_id, EXCLUDED.current_high_bidder_id),
          updated_at = now()
      `,
      [auctionId, listingId, bidderIds[0]]
    );

    for (const bidderId of bidderIds) {
      await client.query(
        `
          INSERT INTO auction_bidder_authorizations (
            auction_id, bidder_id, status, deposit_status, terms_accepted_at
          )
          VALUES ($1, $2, 'approved', 'verified', now())
          ON CONFLICT (auction_id, bidder_id) DO UPDATE SET
            status = EXCLUDED.status,
            deposit_status = EXCLUDED.deposit_status,
            terms_accepted_at = EXCLUDED.terms_accepted_at,
            updated_at = now()
        `,
        [auctionId, bidderId]
      );
    }

    const existingBids = await client.query(
      "SELECT 1 FROM bid_events WHERE auction_id = $1 LIMIT 1",
      [auctionId]
    );

    if (!existingBids.rowCount) {
      const bids = [
        [bidderIds[2], 221000000, "seed-077-2210000", 1],
        [bidderIds[0], 223500000, "seed-118-2235000", 2],
        [bidderIds[1], 226000000, "seed-042-2260000", 3],
        [bidderIds[0], 228500000, "seed-118-2285000", 4]
      ] as const;

      for (const [bidderId, amount, key, version] of bids) {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO bid_events (
              auction_id, bidder_id, amount_cents, bid_type, idempotency_key,
              accepted, auction_version, created_at
            )
            VALUES ($1, $2, $3, 'live', $4, true, $5, now() - (($6::int) * interval '4 minutes'))
            RETURNING id
          `,
          [auctionId, bidderId, amount, key, version, 5 - version]
        );

        if (amount === 228500000) {
          await client.query(
            "UPDATE auctions SET current_high_bid_id = $1 WHERE id = $2",
            [inserted.rows[0].id, auctionId]
          );
        }
      }
    }
  });

  await pool.end();
}

seed()
  .then(() => console.log("seeded farmauction data"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
