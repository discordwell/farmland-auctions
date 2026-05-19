import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import { ZodError, z } from "zod";
import {
  SESSION_COOKIE,
  attachSessionCookie,
  clearSessionCookie,
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  getSessionUser,
  parseCookies,
  requireAdmin as requireAdminAuth,
  requireUser,
  touchLogin,
  verifyPassword
} from "./auth.js";
import { getAuction, getBidHistory, placeBid } from "./auctionService.js";
import { config } from "./config.js";
import { pool, query, withTransaction } from "./db/pool.js";
import { deliverNotification, enqueueNotification, enqueueNotificationInTransaction } from "./email.js";
import {
  auctionClosedEmail,
  bidderDecisionEmail,
  bidderRegistrationConfirmation,
  outbidNotice
} from "./emailTemplates.js";
import { ensureDemoAuction, scheduleDemoLoop, stopDemoLoop } from "./demoAuction.js";
import { startNotificationWorker, stopNotificationWorker } from "./notificationWorker.js";
import { ApiError } from "./errors.js";
import { auctionEvents } from "./realtime.js";
import { dollarsToCents, serializeAuction, serializeListing } from "./serializers.js";

const listingStatusSchema = z.enum(["For Sale", "Pending", "Sold", "Wanted", "Lease"]);
// Property-type taxonomy was replaced by per-listing acres composition (acresCultivated, acresPasture, etc.)
// in migration 008. The old enum is intentionally removed.

const listingSortSchema = z.enum([
  "newest",
  "ppa-asc",
  "ppa-desc",
  "acres-desc",
  "soil-desc"
]);

const listingQuerySchema = z.object({
  status: listingStatusSchema.or(z.literal("All")).optional(),
  region: z.string().optional(),
  minAcres: z.coerce.number().positive().optional(),
  maxAcres: z.coerce.number().positive().optional(),
  minSoilRating: z.coerce.number().int().min(0).max(100).optional(),
  maxPricePerAcre: z.coerce.number().positive().optional(),
  q: z.string().trim().min(1).max(120).optional(),
  sort: listingSortSchema.optional()
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

const sellerListingBodySchema = z.object({
  title: z.string().min(3).max(160),
  rm: z.string().min(2).max(120),
  region: z.string().min(2).max(120),
  acres: z.coerce.number().positive().max(100000),
  intent: z.enum(["For Sale", "Lease", "Wanted"]).default("For Sale"),
  targetPricePerAcre: z.coerce.number().nonnegative().max(1_000_000).optional(),
  description: z.string().max(4000).default("")
});

const adminListingBodySchema = z.object({
  slug: z.string().min(3),
  title: z.string().min(3),
  rm: z.string().min(2),
  region: z.string().min(2),
  legalDescription: z.string().max(200).default(""),
  acres: z.coerce.number().positive(),
  acresCultivated: z.coerce.number().nonnegative().default(0),
  acresPasture: z.coerce.number().nonnegative().default(0),
  acresHayland: z.coerce.number().nonnegative().default(0),
  acresBush: z.coerce.number().nonnegative().default(0),
  acresYard: z.coerce.number().nonnegative().default(0),
  pricePerAcre: z.coerce.number().nonnegative(),
  avgAssessment: z.coerce.number().nonnegative(),
  soilRating: z.coerce.number().int().min(0).max(100),
  status: listingStatusSchema,
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  image: z.string().min(1),
  satellite: z.string().min(1),
  description: z.string().default(""),
  highlights: z.array(z.string().min(1)).default([]),
  photos: z
    .array(
      z.object({
        url: z.string().min(4).max(2000),
        caption: z.string().max(280).default("")
      })
    )
    .max(20)
    .default([]),
  waterSource: z.string().max(500).default(""),
  currentOperator: z.string().max(500).default(""),
  lastSalePrice: z.coerce.number().nonnegative().optional(),
  lastSaleDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  zoning: z.string().max(500).default(""),
  mineralRights: z.string().max(500).default(""),
  encumbrances: z.string().max(2000).default(""),
  seoDescription: z.string().max(320).default(""),
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

async function requireAdmin(request: FastifyRequest) {
  await requireAdminAuth(request);
}

function assertSameOriginIfBrowserPost(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (!origin) return;
  const value = Array.isArray(origin) ? origin[0] : origin;
  if (!value) return;
  if (!config.corsOrigin.includes(value)) {
    throw new ApiError(403, "Origin is not allowed for this action");
  }
}

const sortClauses: Record<z.infer<typeof listingSortSchema>, string> = {
  newest: "l.published_at DESC NULLS LAST, l.updated_at DESC",
  "ppa-asc": "l.price_per_acre_cents ASC NULLS LAST, l.updated_at DESC",
  "ppa-desc": "l.price_per_acre_cents DESC NULLS LAST, l.updated_at DESC",
  "acres-desc": "l.acres DESC NULLS LAST, l.updated_at DESC",
  "soil-desc": "l.soil_final_rating DESC NULLS LAST, l.updated_at DESC"
};

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

  const orderBy = filters.sort ? sortClauses[filters.sort] : "l.updated_at DESC";

  return {
    sql: conditions.join(" AND "),
    values,
    orderBy
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
        ) AS highlights,
        COALESCE(
          (
            SELECT json_agg(json_build_object('url', p.url, 'caption', p.caption) ORDER BY p.position, p.created_at)
            FROM listing_photos p
            WHERE p.listing_id = l.id
          ),
          '[]'::json
        ) AS photos
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
        ) AS highlights,
        COALESCE(
          (
            SELECT json_agg(json_build_object('url', p.url, 'caption', p.caption) ORDER BY p.position, p.created_at)
            FROM listing_photos p
            WHERE p.listing_id = l.id
          ),
          '[]'::json
        ) AS photos
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

const signupBodySchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(120),
  displayName: z.string().max(120).default(""),
  intent: z.enum(["buyer", "seller", "both"]).nullable().default(null)
});

const loginBodySchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(120)
});

async function registerRoutes(app: FastifyInstance) {
  app.post("/api/auth/signup", async (request, reply) => {
    const body = signupBodySchema.parse(request.body);
    const existing = await findUserByEmail(body.email);
    if (existing) {
      throw new ApiError(409, "An account with that email already exists");
    }
    const user = await createUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      role: "user",
      intent: body.intent
    });
    const userAgent =
      (Array.isArray(request.headers["user-agent"])
        ? request.headers["user-agent"][0]
        : request.headers["user-agent"]) ?? "";
    const session = await createSession(user.id, userAgent);
    attachSessionCookie(reply, session.token, session.expiresAt);
    await touchLogin(user.id);
    reply.status(201);
    return { user };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const row = await findUserByEmail(body.email);
    if (!row) {
      throw new ApiError(401, "Email or password is incorrect");
    }
    const ok = await verifyPassword(body.password, row.password_hash);
    if (!ok) {
      throw new ApiError(401, "Email or password is incorrect");
    }
    const userAgent =
      (Array.isArray(request.headers["user-agent"])
        ? request.headers["user-agent"][0]
        : request.headers["user-agent"]) ?? "";
    const session = await createSession(row.id, userAgent);
    attachSessionCookie(reply, session.token, session.expiresAt);
    await touchLogin(row.id);
    return {
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        displayName: row.display_name,
        intent: row.intent ?? null
      }
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (token) {
      await destroySession(token);
    }
    clearSessionCookie(reply);
    reply.status(204);
    return null;
  });

  app.get("/api/auth/me", async (request) => {
    const user = await getSessionUser(request);
    return { user };
  });

  app.get("/api/me/summary", async (request) => {
    const user = await requireUser(request);
    const bidderRow = await query(
      `
        SELECT *
        FROM bidders
        WHERE user_id = $1 OR (user_id IS NULL AND lower(email) = lower($2))
        ORDER BY user_id IS NULL ASC, updated_at DESC
        LIMIT 1
      `,
      [user.id, user.email]
    );
    const bidder = bidderRow.rows[0] ?? null;

    if (bidder && !bidder.user_id) {
      await query("UPDATE bidders SET user_id = $1 WHERE id = $2", [user.id, bidder.id]);
      bidder.user_id = user.id;
    }

    const registrations = bidder
      ? await query(
          `
            SELECT
              aba.*,
              a.id AS auction_id,
              a.title AS auction_title,
              a.status AS auction_status,
              a.auction_type,
              a.opens_at,
              a.closes_at,
              a.current_high_bid_cents,
              a.reserve_price_cents,
              a.reserve_visibility,
              l.slug AS listing_slug,
              l.rm AS listing_rm
            FROM auction_bidder_authorizations aba
            JOIN auctions a ON a.id = aba.auction_id
            JOIN listings l ON l.id = a.listing_id
            WHERE aba.bidder_id = $1
            ORDER BY a.opens_at DESC
          `,
          [bidder.id]
        )
      : { rows: [] };

    const bids = bidder
      ? await query(
          `
            SELECT
              b.id,
              b.auction_id,
              b.amount_cents,
              b.bid_type,
              b.accepted,
              b.rejection_reason,
              b.created_at,
              a.title AS auction_title,
              a.status AS auction_status,
              l.slug AS listing_slug
            FROM bid_events b
            JOIN auctions a ON a.id = b.auction_id
            JOIN listings l ON l.id = a.listing_id
            WHERE b.bidder_id = $1
            ORDER BY b.created_at DESC
            LIMIT 50
          `,
          [bidder.id]
        )
      : { rows: [] };

    const watchlist = await query(
      `
        SELECT
          l.id, l.slug, l.title, l.rm, l.region, l.acres,
          l.price_per_acre_cents, l.status, l.hero_image_url,
          w.created_at AS watched_at
        FROM bidder_watchlist w
        JOIN listings l ON l.id = w.listing_id
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC
      `,
      [user.id]
    );

    return {
      user,
      bidder,
      registrations: registrations.rows,
      bids: bids.rows,
      watchlist: watchlist.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        rm: row.rm,
        region: row.region,
        acres: Number(row.acres),
        pricePerAcre: Number(row.price_per_acre_cents) / 100,
        status: row.status,
        image: row.hero_image_url,
        watchedAt: row.watched_at
      }))
    };
  });

  app.post("/api/me/watchlist/:listingId", async (request, reply) => {
    const user = await requireUser(request);
    const { listingId } = z
      .object({ listingId: z.uuid() })
      .parse(request.params);

    const exists = await query("SELECT 1 FROM listings WHERE id = $1", [listingId]);
    if (!exists.rowCount) {
      reply.status(404);
      return { message: "Listing not found" };
    }

    await query(
      `
        INSERT INTO bidder_watchlist (user_id, listing_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, listing_id) DO NOTHING
      `,
      [user.id, listingId]
    );
    reply.status(201);
    return { ok: true };
  });

  app.delete("/api/me/watchlist/:listingId", async (request) => {
    const user = await requireUser(request);
    const { listingId } = z
      .object({ listingId: z.uuid() })
      .parse(request.params);

    await query("DELETE FROM bidder_watchlist WHERE user_id = $1 AND listing_id = $2", [
      user.id,
      listingId
    ]);
    return { ok: true };
  });

  app.post("/api/me/watchlist/sync", async (request) => {
    const user = await requireUser(request);
    const { slugs } = z
      .object({ slugs: z.array(z.string().min(1).max(120)).max(200).default([]) })
      .parse(request.body);

    if (!slugs.length) return { added: 0 };

    const ids = await query(
      "SELECT id FROM listings WHERE slug = ANY($1::text[])",
      [slugs]
    );
    if (!ids.rowCount) return { added: 0 };

    const values: string[] = [];
    const params: string[] = [user.id];
    ids.rows.forEach((row, idx) => {
      params.push(row.id as string);
      values.push(`($1, $${idx + 2})`);
    });

    await query(
      `
        INSERT INTO bidder_watchlist (user_id, listing_id)
        VALUES ${values.join(", ")}
        ON CONFLICT DO NOTHING
      `,
      params
    );
    return { added: ids.rowCount };
  });

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
          ) AS highlights,
          COALESCE(
            (
              SELECT json_agg(json_build_object('url', p.url, 'caption', p.caption) ORDER BY p.position, p.created_at)
              FROM listing_photos p
              WHERE p.listing_id = l.id
            ),
            '[]'::json
          ) AS photos
        FROM listings l
        LEFT JOIN listing_highlights lh ON lh.listing_id = l.id
        WHERE ${where.sql}
        GROUP BY l.id
        ORDER BY ${where.orderBy}
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
    assertSameOriginIfBrowserPost(request);
    const params = idParamSchema.parse(request.params);
    const body = registrationBodySchema.parse(request.body);
    const sessionUser = await getSessionUser(request);

    return withTransaction(async (client) => {
      const auction = await client.query("SELECT id, title FROM auctions WHERE id = $1", [
        params.id
      ]);
      if (!auction.rowCount) throw new ApiError(404, "Auction not found");

      const bidder = await client.query<{ id: string }>(
        `
          INSERT INTO bidders (
            email, legal_name, phone, entity_type, mailing_address,
            identity_document_url, proof_of_funds_url, user_id
          )
          VALUES (lower($1), $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (email) DO UPDATE SET
            legal_name = EXCLUDED.legal_name,
            phone = EXCLUDED.phone,
            entity_type = EXCLUDED.entity_type,
            mailing_address = EXCLUDED.mailing_address,
            identity_document_url = EXCLUDED.identity_document_url,
            proof_of_funds_url = EXCLUDED.proof_of_funds_url,
            user_id = COALESCE(EXCLUDED.user_id, bidders.user_id),
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
          body.proofOfFundsUrl,
          sessionUser?.id ?? null
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
          eventType: "bidder.registered.ops",
          metadata: { auctionId: params.id, bidderId: bidder.rows[0].id },
          recipientEmail: config.opsNotifyEmail,
          subject: "New bidder registration"
        });
      }

      // Confirmation email to the bidder
      const auctionTitle = (auction.rows[0]?.title as string) ?? "Wyatt Farmland Auctions";
      const confirmation = bidderRegistrationConfirmation({
        bidderEmail: body.email,
        bidderName: body.legalName,
        auctionTitle,
        auctionId: params.id
      });
      await enqueueNotificationInTransaction(client, {
        eventType: "bidder.registered",
        metadata: { auctionId: params.id, bidderId: bidder.rows[0].id },
        recipientEmail: body.email,
        subject: confirmation.subject,
        body: confirmation.body,
        htmlBody: confirmation.htmlBody
      });

      return {
        bidderId: bidder.rows[0].id,
        authorization: authorization.rows[0]
      };
    });
  });

  app.post("/api/auctions/:id/bids", async (request, reply) => {
    assertSameOriginIfBrowserPost(request);
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
        eventType: "bid.accepted.ops",
        metadata: { auctionId: params.id, bidId: result.bid.id },
        recipientEmail: config.opsNotifyEmail,
        subject: "Accepted auction bid"
      });
    }

    // Outbid notice to the previous high bidder (different bidder than the new one).
    // Throttle: skip if we sent one in the last 60s for this auction+bidder.
    if (result.bid && result.bid.bidderId) {
      const prior = await query<{
        prior_amount_cents: string;
        prior_email: string;
        prior_name: string;
        auction_title: string;
      }>(
        `
          SELECT b.amount_cents AS prior_amount_cents,
                 bd.email       AS prior_email,
                 bd.legal_name  AS prior_name,
                 a.title        AS auction_title
          FROM bid_events b
          JOIN bidders bd ON bd.id = b.bidder_id
          JOIN auctions a ON a.id = b.auction_id
          WHERE b.auction_id = $1
            AND b.accepted = true
            AND b.bidder_id <> $2
          ORDER BY b.amount_cents DESC, b.created_at DESC
          LIMIT 1
        `,
        [params.id, result.bid.bidderId]
      );
      if (prior.rowCount && prior.rows[0]) {
        const previous = prior.rows[0];
        const recentSent = await query(
          `
            SELECT 1 FROM notification_outbox
            WHERE event_type = 'bid.outbid'
              AND lower(recipient_email) = lower($1)
              AND metadata->>'auctionId' = $2
              AND created_at > now() - interval '60 seconds'
            LIMIT 1
          `,
          [previous.prior_email, params.id]
        );
        if (!recentSent.rowCount) {
          const tpl = outbidNotice({
            bidderEmail: previous.prior_email,
            bidderName: previous.prior_name,
            auctionTitle: previous.auction_title,
            previousAmountCents: Number(previous.prior_amount_cents),
            newHighAmountCents: result.bid.amountCents
          });
          await enqueueNotification({
            eventType: "bid.outbid",
            metadata: { auctionId: params.id, bidId: result.bid.id },
            recipientEmail: previous.prior_email,
            subject: tpl.subject,
            body: tpl.body,
            htmlBody: tpl.htmlBody
          });
        }
      }
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

  app.get("/api/seller/summary", async (request) => {
    const user = await requireUser(request);

    const listingsResult = await query(
      `
        SELECT
          l.id, l.slug, l.title, l.rm, l.region, l.acres,
          l.price_per_acre_cents, l.status, l.published_at, l.created_at,
          l.description
        FROM listings l
        WHERE l.seller_user_id = $1
        ORDER BY l.created_at DESC
      `,
      [user.id]
    );

    const inquiriesResult = await query(
      `
        SELECT id, name, email, phone, file_type, message, created_at
        FROM contact_inquiries
        WHERE lower(email) = lower($1)
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [user.email]
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        intent: user.intent
      },
      listings: listingsResult.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        rm: row.rm,
        region: row.region,
        acres: Number(row.acres),
        pricePerAcre: row.price_per_acre_cents
          ? Number(row.price_per_acre_cents) / 100
          : 0,
        status: row.status,
        description: row.description ?? "",
        publishedAt: row.published_at,
        createdAt: row.created_at
      })),
      inquiries: inquiriesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        fileType: row.file_type,
        message: row.message,
        createdAt: row.created_at
      }))
    };
  });

  app.post("/api/seller/listings", async (request, reply) => {
    const user = await requireUser(request);
    const body = sellerListingBodySchema.parse(request.body);

    const slugBase = body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "listing";
    const slug = `${slugBase}-${randomUUID().slice(0, 8)}`;

    const result = await query<{ id: string; slug: string }>(
      `
        INSERT INTO listings (
          slug, title, rm, region, acres,
          price_per_acre_cents, avg_assessment_per_quarter_cents, soil_final_rating,
          status, hero_image_url, satellite_image_url, description,
          seller_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, 0, 0,
          $7, '', '', $8,
          $9
        )
        RETURNING id, slug
      `,
      [
        slug,
        body.title,
        body.rm,
        body.region,
        body.acres,
        body.targetPricePerAcre ? dollarsToCents(body.targetPricePerAcre) : 0,
        body.intent,
        body.description,
        user.id
      ]
    );

    if (config.opsNotifyEmail) {
      await enqueueNotification({
        body: [
          `Seller: ${user.displayName || user.email} (${user.email})`,
          `Title: ${body.title}`,
          `RM: ${body.rm} · Region: ${body.region}`,
          `Acres: ${body.acres}`,
          `Intent: ${body.intent}`,
          body.targetPricePerAcre
            ? `Target $/ac: ${body.targetPricePerAcre}`
            : "Target $/ac: not specified",
          "",
          body.description || "No description provided."
        ].join("\n"),
        eventType: "seller.listing.created",
        metadata: { listingId: result.rows[0].id },
        recipientEmail: config.opsNotifyEmail,
        subject: `New seller draft: ${body.title}`
      });
    }

    reply.status(201);
    return { listing: result.rows[0] };
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
    await requireAdmin(request);
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
    await requireAdmin(request);
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
    await requireAdmin(request);
    const body = adminListingBodySchema.parse(request.body);
    const result = await withTransaction(async (client) => {
      const listing = await client.query(
        `
          INSERT INTO listings (
            slug, title, rm, region, legal_description,
            acres, acres_cultivated, acres_pasture, acres_hayland, acres_bush, acres_yard,
            price_per_acre_cents, avg_assessment_per_quarter_cents, soil_final_rating,
            status, latitude, longitude, hero_image_url, satellite_image_url,
            description, water_source, current_operator, last_sale_price_cents,
            last_sale_date, zoning, mineral_rights, encumbrances, seo_description,
            published_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13, $14,
            $15, $16, $17, $18, $19,
            $20, $21, $22, $23,
            $24, $25, $26, $27, $28,
            CASE WHEN $29 THEN now() ELSE NULL END
          )
          RETURNING *
        `,
        [
          body.slug,
          body.title,
          body.rm,
          body.region,
          body.legalDescription,
          body.acres,
          body.acresCultivated,
          body.acresPasture,
          body.acresHayland,
          body.acresBush,
          body.acresYard,
          dollarsToCents(body.pricePerAcre),
          dollarsToCents(body.avgAssessment),
          body.soilRating,
          body.status,
          body.latitude ?? null,
          body.longitude ?? null,
          body.image,
          body.satellite,
          body.description,
          body.waterSource,
          body.currentOperator,
          body.lastSalePrice == null ? null : dollarsToCents(body.lastSalePrice),
          body.lastSaleDate ? body.lastSaleDate : null,
          body.zoning,
          body.mineralRights,
          body.encumbrances,
          body.seoDescription,
          body.publish
        ]
      );

      for (const [index, highlight] of body.highlights.entries()) {
        await client.query(
          "INSERT INTO listing_highlights (listing_id, body, position) VALUES ($1, $2, $3)",
          [listing.rows[0].id, highlight, index + 1]
        );
      }

      for (const [index, photo] of body.photos.entries()) {
        await client.query(
          "INSERT INTO listing_photos (listing_id, url, caption, position) VALUES ($1, $2, $3, $4)",
          [listing.rows[0].id, photo.url, photo.caption ?? "", index + 1]
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
    await requireAdmin(request);
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
        legalDescription: body.legalDescription ?? existing.rows[0].legal_description ?? "",
        acres: body.acres ?? Number(existing.rows[0].acres),
        acresCultivated:
          body.acresCultivated ?? Number(existing.rows[0].acres_cultivated ?? 0),
        acresPasture: body.acresPasture ?? Number(existing.rows[0].acres_pasture ?? 0),
        acresHayland: body.acresHayland ?? Number(existing.rows[0].acres_hayland ?? 0),
        acresBush: body.acresBush ?? Number(existing.rows[0].acres_bush ?? 0),
        acresYard: body.acresYard ?? Number(existing.rows[0].acres_yard ?? 0),
        pricePerAcreCents:
          body.pricePerAcre == null
            ? Number(existing.rows[0].price_per_acre_cents)
            : dollarsToCents(body.pricePerAcre),
        avgAssessmentCents:
          body.avgAssessment == null
            ? Number(existing.rows[0].avg_assessment_per_quarter_cents)
            : dollarsToCents(body.avgAssessment),
        soilRating: body.soilRating ?? Number(existing.rows[0].soil_final_rating),
        status: body.status ?? existing.rows[0].status,
        latitude: body.latitude ?? existing.rows[0].latitude,
        longitude: body.longitude ?? existing.rows[0].longitude,
        image: body.image ?? existing.rows[0].hero_image_url,
        satellite: body.satellite ?? existing.rows[0].satellite_image_url,
        description: body.description ?? existing.rows[0].description,
        waterSource: body.waterSource ?? existing.rows[0].water_source ?? "",
        currentOperator: body.currentOperator ?? existing.rows[0].current_operator ?? "",
        lastSalePriceCents:
          body.lastSalePrice == null
            ? existing.rows[0].last_sale_price_cents
            : dollarsToCents(body.lastSalePrice),
        lastSaleDate:
          body.lastSaleDate === undefined
            ? existing.rows[0].last_sale_date
            : body.lastSaleDate
              ? body.lastSaleDate
              : null,
        zoning: body.zoning ?? existing.rows[0].zoning ?? "",
        mineralRights: body.mineralRights ?? existing.rows[0].mineral_rights ?? "",
        encumbrances: body.encumbrances ?? existing.rows[0].encumbrances ?? "",
        seoDescription: body.seoDescription ?? existing.rows[0].seo_description ?? "",
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
            legal_description = $5,
            acres = $6,
            acres_cultivated = $7,
            acres_pasture = $8,
            acres_hayland = $9,
            acres_bush = $10,
            acres_yard = $11,
            price_per_acre_cents = $12,
            avg_assessment_per_quarter_cents = $13,
            soil_final_rating = $14,
            status = $15,
            latitude = $16,
            longitude = $17,
            hero_image_url = $18,
            satellite_image_url = $19,
            description = $20,
            water_source = $21,
            current_operator = $22,
            last_sale_price_cents = $23,
            last_sale_date = $24,
            zoning = $25,
            mineral_rights = $26,
            encumbrances = $27,
            seo_description = $28,
            published_at = $29,
            updated_at = now()
          WHERE id = $30
        `,
        [
          next.slug,
          next.title,
          next.rm,
          next.region,
          next.legalDescription,
          next.acres,
          next.acresCultivated,
          next.acresPasture,
          next.acresHayland,
          next.acresBush,
          next.acresYard,
          next.pricePerAcreCents,
          next.avgAssessmentCents,
          next.soilRating,
          next.status,
          next.latitude,
          next.longitude,
          next.image,
          next.satellite,
          next.description,
          next.waterSource,
          next.currentOperator,
          next.lastSalePriceCents,
          next.lastSaleDate,
          next.zoning,
          next.mineralRights,
          next.encumbrances,
          next.seoDescription,
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

      if (body.photos) {
        await client.query("DELETE FROM listing_photos WHERE listing_id = $1", [params.id]);
        for (const [index, photo] of body.photos.entries()) {
          await client.query(
            "INSERT INTO listing_photos (listing_id, url, caption, position) VALUES ($1, $2, $3, $4)",
            [params.id, photo.url, photo.caption ?? "", index + 1]
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
    await requireAdmin(request);
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
    await requireAdmin(request);
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
    await requireAdmin(request);
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
    await requireAdmin(request);
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
    await requireAdmin(request);
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

    // Email the bidder about the decision
    const bidderLookup = await query<{
      email: string;
      legal_name: string;
      title: string;
    }>(
      `
        SELECT b.email, b.legal_name, a.title
        FROM bidders b
        JOIN auctions a ON a.id = $1
        WHERE b.id = $2
      `,
      [params.auctionId, params.bidderId]
    );
    if (bidderLookup.rowCount && bidderLookup.rows[0]) {
      const bidder = bidderLookup.rows[0];
      const tpl = bidderDecisionEmail({
        bidderEmail: bidder.email,
        bidderName: bidder.legal_name,
        auctionTitle: bidder.title,
        auctionId: params.auctionId,
        decision: body.status,
        operatorNotes: body.operatorNotes || undefined
      });
      await enqueueNotification({
        eventType: `bidder.${body.status}`,
        metadata: { auctionId: params.auctionId, bidderId: params.bidderId },
        recipientEmail: bidder.email,
        subject: tpl.subject,
        body: tpl.body,
        htmlBody: tpl.htmlBody
      });
    }

    return {
      authorization: result.rows[0]
    };
  });

  app.post("/api/admin/auctions/:auctionId/status", async (request) => {
    await requireAdmin(request);
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
    await requireAdmin(request);
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
        eventType: "auction.closed.ops",
        metadata: { auctionId: params.auctionId },
        recipientEmail: config.opsNotifyEmail,
        subject: "Auction closed"
      });
    }

    // Won/lost emails to each approved bidder. The high bidder gets a "won" email.
    const winnerId = payload.auction.currentHighBidderId ?? null;
    const winningCents = payload.auction.currentHighBidCents ?? 0;
    const participants = await query<{ email: string; legal_name: string; bidder_id: string }>(
      `
        SELECT DISTINCT bd.id AS bidder_id, bd.email, bd.legal_name
        FROM auction_bidder_authorizations aba
        JOIN bidders bd ON bd.id = aba.bidder_id
        WHERE aba.auction_id = $1 AND aba.status = 'approved'
      `,
      [params.auctionId]
    );
    if (winningCents > 0) {
      for (const participant of participants.rows) {
        const tpl = auctionClosedEmail({
          bidderEmail: participant.email,
          bidderName: participant.legal_name,
          auctionTitle: payload.auction.title,
          winningAmountCents: winningCents,
          isWinner: participant.bidder_id === winnerId
        });
        await enqueueNotification({
          eventType: participant.bidder_id === winnerId ? "auction.won" : "auction.lost",
          metadata: { auctionId: params.auctionId, bidderId: participant.bidder_id },
          recipientEmail: participant.email,
          subject: tpl.subject,
          body: tpl.body,
          htmlBody: tpl.htmlBody
        });
      }
    }

    return payload;
  });

  app.get("/api/admin/auctions/:auctionId/tasks", async (request) => {
    await requireAdmin(request);
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
    await requireAdmin(request);
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
    await requireAdmin(request);
    const result = await query(
      "SELECT * FROM notification_outbox ORDER BY created_at DESC LIMIT 100"
    );
    return {
      notifications: result.rows
    };
  });

  app.post("/api/admin/notifications/:id/send", async (request) => {
    await requireAdmin(request);
    const params = notificationIdParamSchema.parse(request.params);
    return deliverNotification(params.id);
  });

  app.get("/api/admin/inquiries", async (request) => {
    await requireAdmin(request);
    const result = await query(
      "SELECT * FROM contact_inquiries ORDER BY created_at DESC LIMIT 100"
    );
    return {
      inquiries: result.rows
    };
  });

  app.get("/api/admin/newsletter-signups", async (request) => {
    await requireAdmin(request);
    const result = await query(
      "SELECT * FROM newsletter_signups ORDER BY consent_at DESC LIMIT 100"
    );
    return {
      signups: result.rows
    };
  });

  app.get("/api/admin/events", async (request) => {
    await requireAdmin(request);
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
    credentials: true,
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
  stopDemoLoop();
  stopNotificationWorker();
  await app.close();
  await pool.end();
};

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({
  host: config.host,
  port: config.port
});

startNotificationWorker();

ensureDemoAuction()
  .then(() => scheduleDemoLoop())
  .catch((error) => {
    console.error("[demo] initial setup failed", error);
  });
