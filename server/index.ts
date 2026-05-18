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
  email: z.email(),
  legalName: z.string().min(2),
  phone: z.string().min(7).max(40).optional(),
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

const idParamSchema = z.object({ id: z.uuid() });
const auctionIdParamSchema = z.object({ auctionId: z.uuid() });
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

async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    await query("SELECT 1");
    return {
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
          INSERT INTO bidders (email, legal_name, phone)
          VALUES (lower($1), $2, $3)
          ON CONFLICT (email) DO UPDATE SET
            legal_name = EXCLUDED.legal_name,
            phone = EXCLUDED.phone,
            updated_at = now()
          RETURNING id
        `,
        [body.email, body.legalName, body.phone ?? null]
      );

      const authorization = await client.query(
        `
          INSERT INTO auction_bidder_authorizations (
            auction_id, bidder_id, status, deposit_status, terms_accepted_at
          )
          VALUES ($1, $2, 'pending', 'pending', CASE WHEN $3 THEN now() ELSE NULL END)
          ON CONFLICT (auction_id, bidder_id) DO UPDATE SET
            terms_accepted_at = COALESCE(
              auction_bidder_authorizations.terms_accepted_at,
              EXCLUDED.terms_accepted_at
            ),
            updated_at = now()
          RETURNING *
        `,
        [params.id, bidder.rows[0].id, body.termsAccepted]
      );

      await client.query(
        `
          INSERT INTO auction_events (auction_id, actor_type, actor_id, event_type, payload)
          VALUES ($1, 'bidder', $2, 'bidder.registered', jsonb_build_object('email', $3))
        `,
        [params.id, bidder.rows[0].id, body.email]
      );

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
      listing: await listingBySlug(result.slug)
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
