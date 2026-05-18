import type { QueryResultRow } from "pg";

export function centsToDollars(value: string | number | null | undefined) {
  return Number(value ?? 0) / 100;
}

export function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

export function serializeListing(row: QueryResultRow) {
  const latitude = row.latitude == null ? null : Number(row.latitude);
  const longitude = row.longitude == null ? null : Number(row.longitude);

  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    rm: row.rm as string,
    region: row.region as string,
    acres: Number(row.acres),
    pricePerAcre: centsToDollars(row.price_per_acre_cents),
    pricePerAcreCents: Number(row.price_per_acre_cents),
    avgAssessment: centsToDollars(row.avg_assessment_per_quarter_cents),
    avgAssessmentCents: Number(row.avg_assessment_per_quarter_cents),
    soilRating: Number(row.soil_final_rating),
    legalDescription: (row.legal_description ?? "") as string,
    acresCultivated: Number(row.acres_cultivated ?? 0),
    acresPasture: Number(row.acres_pasture ?? 0),
    acresHayland: Number(row.acres_hayland ?? 0),
    acresBush: Number(row.acres_bush ?? 0),
    acresYard: Number(row.acres_yard ?? 0),
    status: row.status as string,
    image: row.hero_image_url as string,
    satellite: row.satellite_image_url as string,
    coordinates:
      latitude == null || longitude == null
        ? ""
        : `${latitude.toFixed(3)} N, ${Math.abs(longitude).toFixed(3)} W`,
    latitude,
    longitude,
    description: row.description as string,
    highlights: (row.highlights ?? []) as string[],
    photos: (row.photos ?? []) as Array<{ url: string; caption?: string }>,
    waterSource: (row.water_source ?? "") as string,
    currentOperator: (row.current_operator ?? "") as string,
    lastSalePrice:
      row.last_sale_price_cents == null ? null : centsToDollars(row.last_sale_price_cents),
    lastSaleDate: (row.last_sale_date as string | null) ?? null,
    zoning: (row.zoning ?? "") as string,
    mineralRights: (row.mineral_rights ?? "") as string,
    encumbrances: (row.encumbrances ?? "") as string,
    seoDescription: (row.seo_description ?? "") as string,
    publishedAt: row.published_at as string | null,
    updatedAt: row.updated_at as string
  };
}

export function serializeBid(row: QueryResultRow) {
  return {
    id: row.id as string,
    auctionId: row.auction_id as string,
    bidderId: row.bidder_id as string,
    bidderAlias: (row.legal_name as string | undefined) ?? "Bidder",
    amountCents: Number(row.amount_cents),
    amountDollars: centsToDollars(row.amount_cents),
    bidType: row.bid_type as string,
    accepted: Boolean(row.accepted),
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    auctionVersion: Number(row.auction_version),
    createdAt: row.created_at as string
  };
}

export function serializeAuction(row: QueryResultRow) {
  const currentHighBidCents = Number(row.current_high_bid_cents);
  const reservePriceCents = Number(row.reserve_price_cents);

  return {
    id: row.id as string,
    listingId: row.listing_id as string,
    title: row.title as string,
    status: row.status as string,
    auctionType: row.auction_type as string,
    opensAt: row.opens_at as string,
    closesAt: row.closes_at as string,
    softCloseSeconds: Number(row.soft_close_seconds),
    bidIncrementCents: Number(row.bid_increment_cents),
    reserveVisibility: row.reserve_visibility as string,
    reserveMet: reservePriceCents > 0 && currentHighBidCents >= reservePriceCents,
    currentHighBidId: (row.current_high_bid_id as string | null) ?? null,
    currentHighBidCents,
    currentHighBidDollars: centsToDollars(currentHighBidCents),
    currentHighBidderId: (row.current_high_bidder_id as string | null) ?? null,
    version: Number(row.version),
    listing:
      row.listing_slug == null
        ? null
        : {
            slug: row.listing_slug as string,
            rm: row.listing_rm as string,
            acres: Number(row.listing_acres),
            soilRating: Number(row.listing_soil_final_rating),
            image: row.listing_hero_image_url as string
          }
  };
}
