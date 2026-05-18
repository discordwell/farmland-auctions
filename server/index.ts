import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import { ZodError, z } from "zod";
import { getAuction, getBidHistory, placeBid } from "./auctionService.js";
import { config } from "./config.js";
import { pool, query, withTransaction } from "./db/pool.js";
import { deliverNotification, enqueueNotification, enqueueNotificationInTransaction } from "./email.js";
import { ApiError } from "./errors.js";
import { auctionEvents } from "./realtime.js";
import { dollarsToCents, serializeAuction, serializeListing } from "./serializers.js";

const listingStatusSchema = z.enum(["For Sale", "Pending", "Sold", "Wanted", "Lease"]);
const propertyTypeSchema = z.enum(["Grain", "Mixed", "Pasture", "Lease"]);

const listingQuerySchema = z.object({
  status: listingStatusSchema.or(z.literal("All")).optional(),
  region: z.string().optional(),
  propertyType: propertyTypeSchema.optional(),
  minAcres: z.coerce.number().positive().optional(),
  maxAcres: z.coerce.number().positive().optional(),
  minSoilRating: z.coerce.number().int().min(0).max(100).optional(),
  maxPricePerAcre: z.coerce.number().positive().optional()
});

const bidBodySchema = z
  .object({
    bidderId: z.uuid().optional(),
    bidderEmail: z.email().optional(),
    amountCents: z.coerce.number().int().positive(),
    idempotencyKey: z.string().min(8).max(160).optional()
  })
  .refine((body) => body.bidderId || body.bidderEmail, {
    message: "bidderId or bidderEmail is required"
  });

const registrationBodySchema = z.object({
  bidderNotes: z.string().max(2000).default(""),
  depositReference: z.string().max(500).default(""),
  email: z.email(),
  entityType: z.enum(["individual", "corporation", "partnership", "trust"]).default("individual"),
  identityDocumentUrl: z.string().max(1000).default(""),
  legalName: z.string().min(2),
  mailingAddress: z.string().max(1000).default(""),
  phone: z.string().min(7).max(40).optional(),
  proofOfFundsUrl: z.string().max(1000).default(""),
  termsVersion: z.string().min(4).max(80).default("2026-05-18"),
  termsAccepted: z.coerce.boolean().default(false)
});

const contactBodySchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  phone: z.string().max(40).optional(),
  fileType: z.string().min(2),
  message: z.string().max(4000).default(""),
  consentNewsletter: z.coerce.boolean().default(false)
});

const newsletterBodySchema = z.object({
  email: z.email(),
  source: z.string().min(2).default("website")
});

const adminListingBodySchema = z.object({
  slug: z.string().min(3),
  title: z.string().min(3),
  rm: z.string().min(2),
  region: z.string().min(2),
  acres: z.coerce.number().positive(),
  pricePerAcre: z.coerce.number().nonnegative(),
  avgAssessment: z.coerce.number().nonnegative(),
  soilRating: z.coerce.number().int().min(0).max(100),
  type: propertyTypeSchema,
  status: listingStatusSchema,
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  image: z.string().min(1),
  satellite: z.string().min(1),
  description: z.string().default(""),
  highlights: z.array(z.string().min(1)).default([]),
  publish: z.coerce.boolean().default(false)
});

const adminListingUpdateSchema = adminListingBodySchema.partial().extend({
  publish: z.coerce.boolean().optional()
});

const adminAuctionBodySchema = z.object({
  listingId: z.uuid(),
  title: z.string().min(3),
  auctionType: z.enum(["live", "sealed"]).default("live"),
  status: z.enum(["draft", "registration", "open", "paused", "closed", "settled"]).default("registration"),
  opensAt: z.coerce.date(),
  closesAt: z.coerce.date(),
  softCloseSeconds: z.coerce.number().int().min(0).default(300),
  bidIncrement: z.coerce.number().positive().default(25_000),
  reservePrice: z.coerce.number().nonnegative().default(0),
  reserveVisibility: z.enum(["hidden", "met-only", "public"]).default("met-only")
});

const idParamSchema = z.object({ id: z.uuid() });
const auctionIdParamSchema = z.object({ auctionId: z.uuid() });
const taskIdParamSchema = z.object({ id: z.uuid() });
const notificationIdParamSchema = z.object({ id: z.uuid() });
const bidderApprovalParamSchema = z.object({
  auctionId: z.uuid(),
  bidderId: z.uuid()
});

function requireAdmin(request: FastifyRequest) {
  if (!config.adminApiKey) return;
  const header = request.headers["x-admin-key"];
  const key = Array.isArray(header) ? header[0] : header;
  if (key !== config.adminApiKey) {
    throw new ApiError(401, "Admin API key is required");
  }
}

function buildListingWhere(rawQuery: unknown) {
  const filters = listingQuerySchema.parse(rawQuery);
  const conditions = ["l.published_at IS NOT NULL"];
  const values: unknown[] = [];

  function add(sql: string, value: unknown) {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  }

  if (filters.status && filters.status !== "All") add("l.status = ?", filters.status);
  if (filters.region && filters.region !== "All") add("l.region = ?", filters.region);
  if (filters.propertyType) add("l.property_type = ?", filters.propertyType);
  if (filters.minAcres) add("l.acres >= ?", filters.minAcres);
  if (filters.maxAcres) add("l.acres <= ?", filters.maxAcres);
  if (filters.minSoilRating) add("l.soil_final_rating >= ?", filters.minSoilRating);
  if (filters.maxPricePerAcre) {
    add("l.price_per_acre_cents <= ?", dollarsToCents(filters.maxPricePerAcre));
  }

  return {
    sql: conditions.join(" AND "),
    values
  };
}

async function listingBySlug(slug: string) {
  const result = await query(
    `
      SELECT
        l.*,
        COALESCE(
          array_agg(lh.body ORDER BY lh.position) FILTER (WHERE lh.body IS NOT NULL),
          ARRAY[]::text[]
        ) AS highlights
      FROM listings l
      LEFT JOIN listing_highlights lh ON lh.listing_id = l.id
      WHERE l.slug = $1 AND l.published_at IS NOT NULL
      GROUP BY l.id
    `,
    [slug]
  );

  if (!result.rowCount) throw new ApiError(404, "Listing not found");
  return serializeListing(result.rows[0]);
}

async function adminListingById(id: string) {
  const result = await query(
    `
      SELECT
        l.*,
        COALESCE(
          array_agg(lh.body ORDER BY lh.position) FILTER (WHERE lh.body IS NOT NULL),
          ARRAY[]::text[]
        ) AS highlights
      FROM listings l
      LEFT JOIN listing_highlights lh ON lh.listing_id = l.id
      WHERE l.id = $1
      GROUP BY l.id
    `,
    [id]
  );

  if (!result.rowCount) throw new ApiError(404, "Listing not found");
  return serializeListing(result.rows[0]);
}

async function loadAuctionForAdmin(id: string) {
  const result = await query(
    `
      SELECT
        a.*,
        l.slug AS listing_slug,
        l.rm AS listing_rm,
        l.acres AS listing_acres,
        l.soil_final_rating AS listing_soil_final_rating,
        l.hero_image_url AS listing_hero_image_url
      FROM auctions a
      JOIN listings l ON l.id = a.listing_id
      WHERE a.id = $1
    `,
    [id]
  );

  if (!result.rowCount) throw new ApiError(404, "Auction not found");
  return serializeAuction(result.rows[0]);
}

async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    await query("SELECT 1");
    return {
      ok: true,
      service: "farmauction-api",
      time: new Date().toISOString()
    };
  });

  app.get("/api/health/deep", async () => {
    const result = await query(
      `
        SELECT
          (SELECT count(*)::int FROM listings) AS listings,
          (SELECT count(*)::int FROM auctions) AS auctions,
          (SELECT count(*)::int FROM notification_outbox WHERE status IN ('pending', 'failed')) AS notifications_attention
      `
    );

    return {
      checks: {
        database: "ok",
        smtpConfigured: Boolean(config.smtp.host && config.smtp.from)
      },
      counts: result.rows[0],
      ok: true,
      service: "farmauction-api",
      time: new Date().toISOString()
    };
  });

  app.get("/api/listings", async (request) => {
    const where = buildListingWhere(request.query);
    const result = await query(
      `
        SELECT
          l.*,
          COALESCE(
            array_agg(lh.body ORDER BY lh.position) FILTER (WHERE lh.body IS NOT NULL),
            ARRAY[]::text[]
          ) AS highlights
        FROM listings l
        LEFT JOIN listing_highlights lh ON lh.listing_id = l.id
        WHERE ${where.sql}
        GROUP BY l.id
        ORDER BY l.updated_at DESC
      `,
      where.values
    );

    return {
      listings: result.rows.map(serializeListing)
    };
  });

  app.get("/api/listings/:slug", async (request) => {
    const params = z.object({ slug: z.string().min(1) }).parse(request.params);
    return {
      listing: await listingBySlug(params.slug)
    };
  });

  app.get("/api/auctions", async () => {
    const result = await query(
      `
        SELECT
          a.*,
          l.slug AS listing_slug,
          l.rm AS listing_rm,
          l.acres AS listing_acres,
          l.soil_final_rating AS listing_soil_final_rating,
          l.hero_image_url AS listing_hero_image_url
        FROM auctions a
        JOIN listings l ON l.id = a.listing_id
        WHERE a.status IN ('registration', 'open', 'paused')
        ORDER BY a.opens_at ASC
      `
    );

    return {
      auctions: result.rows.map(serializeAuction)
    };
  });

  app.get("/api/auctions/:id", async (request) => {
    const params = idParamSchema.parse(request.params);
    return getAuction(params.id);
  });

  app.get("/api/auctions/:id/bids", async (request) => {
    const params = idParamSchema.parse(request.params);
    return {
      bids: await getBidHistory(params.id)
    };
  });

  app.get("/api/auctions/:id/events", async (request, reply) => {
    const params = idParamSchema.parse(request.params);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no"
    });
    reply.raw.write(`event: ready\n`);
    reply.raw.write(`data: ${JSON.stringify({ auctionId: params.id })}\n\n`);

    const unsubscribe = auctionEvents.subscribe(params.id, reply.raw);
    const interval = setInterval(() => {
      reply.raw.write(`event: ping\n`);
      reply.raw.write(`data: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
    }, 25_000);

    request.raw.on("close", () => {
      clearInterval(interval);
      unsubscribe();
    });
  });

  app.post("/api/auctions/:id/register", async (request) => {
    const params = idParamSchema.parse(request.params);
    const body = registrationBodySchema.parse(request.body);

    return withTransaction(async (client) => {
      const auction = await client.query("SELECT id FROM auctions WHERE id = $1", [
        params.id
      ]);
      if (!auction.rowCount) throw new ApiError(404, "Auction not found");

      const bidder = await client.query<{ id: string }>(
        `
          INSERT INTO bidders (
            email, legal_name, phone, entity_type, mailing_address,
            identity_document_url, proof_of_funds_url
          )
          VALUES (lower($1), $2, $3, $4, $5, $6, $7)
          ON CONFLICT (email) DO UPDATE SET
            legal_name = EXCLUDED.legal_name,
            phone = EXCLUDED.phone,
            entity_type = EXCLUDED.entity_type,
            mailing_address = EXCLUDED.mailing_address,
            identity_document_url = EXCLUDED.identity_document_url,
            proof_of_funds_url = EXCLUDED.proof_of_funds_url,
            updated_at = now()
          RETURNING id
        `,
        [
          body.email,
          body.legalName,
          body.phone ?? null,
          body.entityType,
          body.mailingAddress,
          body.identityDocumentUrl,
          body.proofOfFundsUrl
        ]
      );

      const authorization = await client.query(
        `
          INSERT INTO auction_bidder_authorizations (
            auction_id, bidder_id, status, deposit_status, terms_accepted_at,
            proof_of_funds_url, deposit_reference, terms_version, bidder_notes
          )
          VALUES (
            $1, $2, 'pending', 'pending', CASE WHEN $3 THEN now() ELSE NULL END,
            $4, $5, $6, $7
          )
          ON CONFLICT (auction_id, bidder_id) DO UPDATE SET
            terms_accepted_at = COALESCE(
              auction_bidder_authorizations.terms_accepted_at,
              EXCLUDED.terms_accepted_at
            ),
            proof_of_funds_url = EXCLUDED.proof_of_funds_url,
            deposit_reference = EXCLUDED.deposit_reference,
            terms_version = EXCLUDED.terms_version,
            bidder_notes = EXCLUDED.bidder_notes,
            updated_at = now()
          RETURNING *
        `,
        [
          params.id,
          bidder.rows[0].id,
          body.termsAccepted,
          body.proofOfFundsUrl,
          body.depositReference,
          body.termsVersion,
          body.bidderNotes
        ]
      );

      await client.query(
        `
          INSERT INTO auction_events (auction_id, actor_type, actor_id, event_type, payload)
          VALUES ($1, 'bidder', $2, 'bidder.registered', jsonb_build_object('email', $3::text))
        `,
        [params.id, bidder.rows[0].id, body.email]
      );

      if (config.opsNotifyEmail) {
        await enqueueNotificationInTransaction(client, {
          body: [
            `Auction: ${params.id}`,
            `Bidder: ${body.legalName}`,
            `Email: ${body.email}`,
            `Deposit reference: ${body.depositReference || "not provided"}`
          ].join("\n"),
          eventType: "bidder.registered",
          metadata: { auctionId: params.id, bidderId: bidder.rows[0].id },
          recipientEmail: config.opsNotifyEmail,
          subject: "New bidder registration"
        });
      }

      return {
        bidderId: bidder.rows[0].id,
        authorization: authorization.rows[0]
      };
    });
  });

  app.post("/api/auctions/:id/bids", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const body = bidBodySchema.parse(request.body);
    const result = await placeBid({
      auctionId: params.id,
      bidderEmail: body.bidderEmail,
      bidderId: body.bidderId,
      amountCents: body.amountCents,
      idempotencyKey: body.idempotencyKey ?? randomUUID()
    });

    if (!result.accepted) {
      reply.status(409);
      return result;
    }

    auctionEvents.publish(params.id, "bid.accepted", result);
    if (config.opsNotifyEmail && result.bid) {
      await enqueueNotification({
        body: [
          `Auction: ${params.id}`,
          `Bidder: ${result.bid.bidderAlias}`,
          `Amount: ${result.bid.amountDollars}`
        ].join("\n"),
        eventType: "bid.accepted",
        metadata: { auctionId: params.id, bidId: result.bid.id },
        recipientEmail: config.opsNotifyEmail,
        subject: "Accepted auction bid"
      });
    }
    return result;
  });

  app.post("/api/contact-inquiries", async (request, reply) => {
    const body = contactBodySchema.parse(request.body);
    const result = await withTransaction(async (client) => {
      const inquiry = await client.query<{ id: string }>(
        `
          INSERT INTO contact_inquiries (
            name, email, phone, file_type, message, consent_newsletter
          )
          VALUES ($1, lower($2), $3, $4, $5, $6)
          RETURNING id
        `,
        [
          body.name,
          body.email,
          body.phone ?? null,
          body.fileType,
          body.message,
          body.consentNewsletter
        ]
      );

      if (body.consentNewsletter) {
        await client.query(
          `
            INSERT INTO newsletter_signups (email, consent_source)
            VALUES (lower($1), 'contact-inquiry')
            ON CONFLICT (email) DO UPDATE SET
              consent_source = EXCLUDED.consent_source,
              consent_at = now()
          `,
          [body.email]
        );
      }

      return inquiry.rows[0];
    });

    if (config.opsNotifyEmail) {
      await enqueueNotification({
        body: [
          `Name: ${body.name}`,
          `Email: ${body.email}`,
          `Phone: ${body.phone ?? "not provided"}`,
          `File type: ${body.fileType}`,
          "",
          body.message || "No message provided."
        ].join("\n"),
        eventType: "contact.created",
        metadata: { inquiryId: result.id },
        recipientEmail: config.opsNotifyEmail,
        subject: "New farmland inquiry"
      });
    }

    reply.status(201);
    return result;
  });

  app.post("/api/newsletter-signups", async (request, reply) => {
    const body = newsletterBodySchema.parse(request.body);
    const result = await query<{ id: string }>(
      `
        INSERT INTO newsletter_signups (email, consent_source)
        VALUES (lower($1), $2)
        ON CONFLICT (email) DO UPDATE SET
          consent_source = EXCLUDED.consent_source,
          consent_at = now()
        RETURNING id
      `,
      [body.email, body.source]
    );

    reply.status(201);
    return result.rows[0];
  });

  app.get("/api/admin/dashboard", async (request) => {
    requireAdmin(request);
    const result = await query(
      `
        SELECT
          (SELECT count(*)::int FROM listings) AS listing_count,
          (SELECT count(*)::int FROM auctions WHERE status = 'open') AS open_auction_count,
          (SELECT count(*)::int FROM bidders) AS bidder_count,
          (SELECT count(*)::int FROM bid_events WHERE accepted) AS accepted_bid_count,
          (SELECT count(*)::int FROM contact_inquiries) AS inquiry_count
      `
    );
    return result.rows[0];
  });

  app.get("/api/admin/listings", async (request) => {
    requireAdmin(request);
    const result = await query(
      `
        SELECT
          l.*,
          COALESCE(
            array_agg(lh.body ORDER BY lh.position) FILTER (WHERE lh.body IS NOT NULL),
            ARRAY[]::text[]
          ) AS highlights
        FROM listings l
        LEFT JOIN listing_highlights lh ON lh.listing_id = l.id
        GROUP BY l.id
        ORDER BY l.updated_at DESC
      `
    );

    return {
      listings: result.rows.map(serializeListing)
    };
  });

  app.post("/api/admin/listings", async (request, reply) => {
    requireAdmin(request);
    const body = adminListingBodySchema.parse(request.body);
    const result = await withTransaction(async (client) => {
      const listing = await client.query(
        `
          INSERT INTO listings (
            slug, title, rm, region, acres, price_per_acre_cents,
            avg_assessment_per_quarter_cents, soil_final_rating, property_type,
            status, latitude, longitude, hero_image_url, satellite_image_url,
            description, published_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15,
            CASE WHEN $16 THEN now() ELSE NULL END
          )
          RETURNING *
        `,
        [
          body.slug,
          body.title,
          body.rm,
          body.region,
          body.acres,
          dollarsToCents(body.pricePerAcre),
          dollarsToCents(body.avgAssessment),
          body.soilRating,
          body.type,
          body.status,
          body.latitude ?? null,
          body.longitude ?? null,
          body.image,
          body.satellite,
          body.description,
          body.publish
        ]
      );

      for (const [index, highlight] of body.highlights.entries()) {
        await client.query(
          "INSERT INTO listing_highlights (listing_id, body, position) VALUES ($1, $2, $3)",
          [listing.rows[0].id, highlight, index + 1]
        );
      }

      return listing.rows[0];
    });

    reply.status(201);
    return {
      listing: await adminListingById(result.id)
    };
  });

  app.put("/api/admin/listings/:id", async (request) => {
    requireAdmin(request);
    const params = idParamSchema.parse(request.params);
    const body = adminListingUpdateSchema.parse(request.body);

    const listing = await withTransaction(async (client) => {
      const existing = await client.query("SELECT * FROM listings WHERE id = $1 FOR UPDATE", [
        params.id
      ]);
      if (!existing.rowCount) throw new ApiError(404, "Listing not found");

      const next = {
        slug: body.slug ?? existing.rows[0].slug,
        title: body.title ?? existing.rows[0].title,
        rm: body.rm ?? existing.rows[0].rm,
        region: body.region ?? existing.rows[0].region,
        acres: body.acres ?? Number(existing.rows[0].acres),
        pricePerAcreCents:
          body.pricePerAcre == null
            ? Number(existing.rows[0].price_per_acre_cents)
            : dollarsToCents(body.pricePerAcre),
        avgAssessmentCents:
          body.avgAssessment == null
            ? Number(existing.rows[0].avg_assessment_per_quarter_cents)
            : dollarsToCents(body.avgAssessment),
        soilRating: body.soilRating ?? Number(existing.rows[0].soil_final_rating),
        type: body.type ?? existing.rows[0].property_type,
        status: body.status ?? existing.rows[0].status,
        latitude: body.latitude ?? existing.rows[0].latitude,
        longitude: body.longitude ?? existing.rows[0].longitude,
        image: body.image ?? existing.rows[0].hero_image_url,
        satellite: body.satellite ?? existing.rows[0].satellite_image_url,
        description: body.description ?? existing.rows[0].description,
        publishedAt:
          body.publish == null
            ? existing.rows[0].published_at
            : body.publish
              ? new Date()
              : null
      };

      await client.query(
        `
          UPDATE listings
          SET
            slug = $1,
            title = $2,
            rm = $3,
            region = $4,
            acres = $5,
            price_per_acre_cents = $6,
            avg_assessment_per_quarter_cents = $7,
            soil_final_rating = $8,
            property_type = $9,
            status = $10,
            latitude = $11,
            longitude = $12,
            hero_image_url = $13,
            satellite_image_url = $14,
            description = $15,
            published_at = $16,
            updated_at = now()
          WHERE id = $17
        `,
        [
          next.slug,
          next.title,
          next.rm,
          next.region,
          next.acres,
          next.pricePerAcreCents,
          next.avgAssessmentCents,
          next.soilRating,
          next.type,
          next.status,
          next.latitude,
          next.longitude,
          next.image,
          next.satellite,
          next.description,
          next.publishedAt,
          params.id
        ]
      );

      if (body.highlights) {
        await client.query("DELETE FROM listing_highlights WHERE listing_id = $1", [
          params.id
        ]);
        for (const [index, highlight] of body.highlights.entries()) {
          await client.query(
            "INSERT INTO listing_highlights (listing_id, body, position) VALUES ($1, $2, $3)",
            [params.id, highlight, index + 1]
          );
        }
      }

      await client.query(
        `
          INSERT INTO auction_events (actor_type, event_type, payload)
          VALUES ('admin', 'listing.updated', jsonb_build_object('listingId', $1::uuid))
        `,
        [params.id]
      );

      return params.id;
    });

    return {
      listing: await adminListingById(listing)
    };
  });

  app.get("/api/admin/auctions", async (request) => {
    requireAdmin(request);
    const result = await query(
      `
        SELECT
          a.*,
          l.slug AS listing_slug,
          l.rm AS listing_rm,
          l.acres AS listing_acres,
          l.soil_final_rating AS listing_soil_final_rating,
          l.hero_image_url AS listing_hero_image_url
        FROM auctions a
        JOIN listings l ON l.id = a.listing_id
        ORDER BY a.updated_at DESC
      `
    );

    return {
      auctions: result.rows.map(serializeAuction)
    };
  });

  app.post("/api/admin/auctions", async (request, reply) => {
    requireAdmin(request);
    const body = adminAuctionBodySchema.parse(request.body);
    if (body.closesAt <= body.opensAt) {
      throw new ApiError(400, "Auction close time must be after open time");
    }

    const result = await withTransaction(async (client) => {
      const listing = await client.query("SELECT id FROM listings WHERE id = $1", [
        body.listingId
      ]);
      if (!listing.rowCount) throw new ApiError(404, "Listing not found");

      const auction = await client.query<{ id: string }>(
        `
          INSERT INTO auctions (
            listing_id, title, status, auction_type, opens_at, closes_at,
            soft_close_seconds, bid_increment_cents, reserve_price_cents,
            reserve_visibility
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `,
        [
          body.listingId,
          body.title,
          body.status,
          body.auctionType,
          body.opensAt,
          body.closesAt,
          body.softCloseSeconds,
          dollarsToCents(body.bidIncrement),
          dollarsToCents(body.reservePrice),
          body.reserveVisibility
        ]
      );

      await client.query(
        `
          INSERT INTO auction_events (auction_id, actor_type, event_type, payload)
          VALUES ($1, 'admin', 'auction.created', jsonb_build_object('status', $2::text))
        `,
        [auction.rows[0].id, body.status]
      );

      return auction.rows[0].id;
    });

    reply.status(201);
    return {
      auction: await loadAuctionForAdmin(result)
    };
  });

  app.get("/api/admin/auctions/:auctionId/bidders", async (request) => {
    requireAdmin(request);
    const params = auctionIdParamSchema.parse(request.params);
    const result = await query(
      `
        SELECT
          aba.*,
          b.email,
          b.legal_name,
          b.phone,
          b.entity_type,
          b.mailing_address,
          b.identity_document_url,
          b.proof_of_funds_url AS bidder_proof_of_funds_url,
          b.verification_status
        FROM auction_bidder_authorizations aba
        JOIN bidders b ON b.id = aba.bidder_id
        WHERE aba.auction_id = $1
        ORDER BY aba.updated_at DESC
      `,
      [params.auctionId]
    );

    return {
      authorizations: result.rows
    };
  });

  app.post("/api/admin/auctions/:auctionId/bidders/:bidderId/approve", async (request) => {
    requireAdmin(request);
    const params = bidderApprovalParamSchema.parse(request.params);
    const result = await query(
      `
        UPDATE auction_bidder_authorizations
        SET status = 'approved', deposit_status = 'verified', updated_at = now()
        WHERE auction_id = $1 AND bidder_id = $2
        RETURNING *
      `,
      [params.auctionId, params.bidderId]
    );

    if (!result.rowCount) throw new ApiError(404, "Bidder authorization not found");
    return {
      authorization: result.rows[0]
    };
  });

  app.post("/api/admin/auctions/:auctionId/bidders/:bidderId/decision", async (request) => {
    requireAdmin(request);
    const params = bidderApprovalParamSchema.parse(request.params);
    const body = z
      .object({
        maxBid: z.coerce.number().nonnegative().optional(),
        operatorNotes: z.string().max(2000).default(""),
        status: z.enum(["approved", "rejected", "suspended"]),
        depositStatus: z
          .enum(["not_required", "pending", "verified", "waived"])
          .default("verified"),
        verificationStatus: z.enum(["pending", "approved", "rejected"]).default("approved")
      })
      .parse(request.body);

    const result = await withTransaction(async (client) => {
      await client.query(
        `
          UPDATE bidders
          SET verification_status = $1, updated_at = now()
          WHERE id = $2
        `,
        [body.verificationStatus, params.bidderId]
      );

      return client.query(
        `
          UPDATE auction_bidder_authorizations
          SET
            status = $1,
            deposit_status = $2,
            max_bid_cents = $3,
            operator_notes = $4,
            reviewed_at = now(),
            reviewed_by = 'admin',
            updated_at = now()
          WHERE auction_id = $5 AND bidder_id = $6
          RETURNING *
        `,
        [
          body.status,
          body.depositStatus,
          body.maxBid == null ? null : dollarsToCents(body.maxBid),
          body.operatorNotes,
          params.auctionId,
          params.bidderId
        ]
      );
    });

    if (!result.rowCount) throw new ApiError(404, "Bidder authorization not found");
    auctionEvents.publish(params.auctionId, "bidder.authorization", result.rows[0]);
    return {
      authorization: result.rows[0]
    };
  });

  app.post("/api/admin/auctions/:auctionId/status", async (request) => {
    requireAdmin(request);
    const params = auctionIdParamSchema.parse(request.params);
    const body = z
      .object({
        status: z.enum(["draft", "registration", "open", "paused", "closed", "settled"])
      })
      .parse(request.body);
    const result = await query(
      "UPDATE auctions SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [body.status, params.auctionId]
    );

    if (!result.rowCount) throw new ApiError(404, "Auction not found");
    return {
      auction: serializeAuction(result.rows[0])
    };
  });

  app.post("/api/admin/auctions/:auctionId/close", async (request) => {
    requireAdmin(request);
    const params = auctionIdParamSchema.parse(request.params);

    const auctionId = await withTransaction(async (client) => {
      const auction = await client.query("SELECT * FROM auctions WHERE id = $1 FOR UPDATE", [
        params.auctionId
      ]);
      if (!auction.rowCount) throw new ApiError(404, "Auction not found");

      await client.query(
        "UPDATE auctions SET status = 'closed', closes_at = LEAST(closes_at, now()), updated_at = now() WHERE id = $1",
        [params.auctionId]
      );

      await client.query(
        `
          INSERT INTO post_auction_tasks (auction_id, title, assignee_role, due_at)
          VALUES
            ($1, 'Confirm high bidder identity and final authority', 'broker', now() + interval '1 day'),
            ($1, 'Prepare seller/buyer summary package', 'admin', now() + interval '1 day'),
            ($1, 'Issue next-step closing instructions', 'broker', now() + interval '2 days')
          ON CONFLICT DO NOTHING
        `,
        [params.auctionId]
      );

      await client.query(
        `
          INSERT INTO auction_events (auction_id, actor_type, event_type, payload)
          VALUES ($1, 'admin', 'auction.closed', '{}'::jsonb)
        `,
        [params.auctionId]
      );

      return params.auctionId;
    });

    const payload = {
      auction: await loadAuctionForAdmin(auctionId)
    };
    auctionEvents.publish(params.auctionId, "auction.closed", payload);
    if (config.opsNotifyEmail) {
      await enqueueNotification({
        body: [
          `Auction closed: ${payload.auction.title}`,
          `Auction ID: ${params.auctionId}`,
          "Post-close tasks were created in the admin console."
        ].join("\n"),
        eventType: "auction.closed",
        metadata: { auctionId: params.auctionId },
        recipientEmail: config.opsNotifyEmail,
        subject: "Auction closed"
      });
    }
    return payload;
  });

  app.get("/api/admin/auctions/:auctionId/tasks", async (request) => {
    requireAdmin(request);
    const params = auctionIdParamSchema.parse(request.params);
    const result = await query(
      "SELECT * FROM post_auction_tasks WHERE auction_id = $1 ORDER BY created_at ASC",
      [params.auctionId]
    );
    return {
      tasks: result.rows
    };
  });

  app.post("/api/admin/tasks/:id/status", async (request) => {
    requireAdmin(request);
    const params = taskIdParamSchema.parse(request.params);
    const body = z
      .object({
        status: z.enum(["open", "done", "blocked"])
      })
      .parse(request.body);
    const result = await query(
      "UPDATE post_auction_tasks SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [body.status, params.id]
    );
    if (!result.rowCount) throw new ApiError(404, "Task not found");
    return {
      task: result.rows[0]
    };
  });

  app.get("/api/admin/notifications", async (request) => {
    requireAdmin(request);
    const result = await query(
      "SELECT * FROM notification_outbox ORDER BY created_at DESC LIMIT 100"
    );
    return {
      notifications: result.rows
    };
  });

  app.post("/api/admin/notifications/:id/send", async (request) => {
    requireAdmin(request);
    const params = notificationIdParamSchema.parse(request.params);
    return deliverNotification(params.id);
  });

  app.get("/api/admin/inquiries", async (request) => {
    requireAdmin(request);
    const result = await query(
      "SELECT * FROM contact_inquiries ORDER BY created_at DESC LIMIT 100"
    );
    return {
      inquiries: result.rows
    };
  });

  app.get("/api/admin/newsletter-signups", async (request) => {
    requireAdmin(request);
    const result = await query(
      "SELECT * FROM newsletter_signups ORDER BY consent_at DESC LIMIT 100"
    );
    return {
      signups: result.rows
    };
  });

  app.get("/api/admin/events", async (request) => {
    requireAdmin(request);
    const result = await query(
      "SELECT * FROM auction_events ORDER BY created_at DESC LIMIT 100"
    );
    return {
      events: result.rows
    };
  });
}

export async function buildServer() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || config.corsOrigin.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new ApiError(403, "Origin is not allowed"), false);
    }
  });

  app.setErrorHandler((error, _request, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "Bad Request",
        message: "Request validation failed",
        details: error.issues
      });
      return;
    }

    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        error: error.statusCode >= 500 ? "Server Error" : "Request Error",
        message: error.message,
        details: error.details
      });
      return;
    }

    app.log.error(error);
    reply.status(500).send({
      error: "Server Error",
      message: "Unexpected backend error"
    });
  });

  await registerRoutes(app);
  return app;
}

const app = await buildServer();

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({
  host: config.host,
  port: config.port
});
