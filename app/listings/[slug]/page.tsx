import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingDetail } from "../ListingDetail";
import { fetchAllListingsAtBuild, fetchListingAtBuild } from "../buildFetch";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://farmauction.discordwell.com").replace(/\/$/, "");

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-CA");

// Static export — only slugs known at build time become routes.
export const dynamicParams = false;

export async function generateStaticParams() {
  const listings = await fetchAllListingsAtBuild();
  return listings
    .filter((listing) => Boolean(listing.slug))
    .map((listing) => ({ slug: listing.slug as string }));
}

function buildDescription(listing: Awaited<ReturnType<typeof fetchListingAtBuild>>) {
  if (!listing) return "Saskatchewan farmland — listings, leases, and live auctions managed by Wyatt Realty Group.";
  if (listing.seoDescription) return listing.seoDescription;
  const parts = [
    `${number.format(listing.acres)} acres in ${listing.rm}.`,
    listing.status === "Wanted"
      ? `Buyer to pay up to ${cad.format(listing.pricePerAcre)}/ac.`
      : `${cad.format(listing.pricePerAcre)}/ac.`,
    `Soil ${listing.soilRating}/100.`
  ];
  if (listing.description) parts.push(listing.description);
  return parts.join(" ").slice(0, 300);
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await fetchListingAtBuild(slug);
  if (!listing) {
    return {
      title: "Lot not found | Wyatt Farmland Auctions",
      robots: { index: false }
    };
  }

  const title = `${listing.title} · ${listing.rm} | Wyatt Farmland Auctions`;
  const description = buildDescription(listing);
  const url = `${SITE_URL}/listings/${slug}/`;
  const image = listing.image?.startsWith("http") ? listing.image : `${SITE_URL}${listing.image || "/images/hero-fields.jpg"}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "Wyatt Farmland Auctions",
      images: [{ url: image, alt: listing.title }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    }
  };
}

export default async function ListingSlugPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await fetchListingAtBuild(slug);
  if (!listing) notFound();
  return <ListingDetail initial={listing} slug={slug} />;
}
