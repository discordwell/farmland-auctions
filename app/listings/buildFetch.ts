import { promises as fs } from "node:fs";
import path from "node:path";
import type { Listing } from "../data";

/**
 * Build-time API fetch used by app/listings/[slug] generateStaticParams + generateMetadata.
 *
 * Source order:
 *   1. `LISTINGS_API_BASE` (preferred) or `NEXT_PUBLIC_API_ORIGIN` — live API
 *   2. `app/listings.fixtures.json` — snapshot of the last successful build
 *
 * The fixtures fallback exists so a network blip during a redeploy doesn't wipe every detail page.
 * The build writes the snapshot on every successful live fetch, so the file stays fresh.
 */

const FIXTURES_PATH = path.resolve(process.cwd(), "app/listings.fixtures.json");

async function readFixtures(): Promise<Listing[]> {
  try {
    const raw = await fs.readFile(FIXTURES_PATH, "utf8");
    const parsed = JSON.parse(raw) as { listings: Listing[] };
    return Array.isArray(parsed.listings) ? parsed.listings : [];
  } catch {
    return [];
  }
}

async function writeFixtures(listings: Listing[]) {
  try {
    await fs.writeFile(FIXTURES_PATH, JSON.stringify({ listings }, null, 2), "utf8");
  } catch {
    // Best-effort — fixtures are a backup, never a hard requirement.
  }
}

export async function fetchAllListingsAtBuild(): Promise<Listing[]> {
  const base = process.env.LISTINGS_API_BASE || process.env.NEXT_PUBLIC_API_ORIGIN;
  if (!base) return readFixtures();
  try {
    const url = `${base.replace(/\/$/, "")}/api/listings`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { listings: Listing[] };
    if (!Array.isArray(payload.listings)) return readFixtures();
    if (payload.listings.length) await writeFixtures(payload.listings);
    return payload.listings;
  } catch (error) {
    console.warn(`[build] /api/listings unreachable, using fixtures fallback:`, error);
    return readFixtures();
  }
}

export async function fetchListingAtBuild(slug: string): Promise<Listing | null> {
  const base = process.env.LISTINGS_API_BASE || process.env.NEXT_PUBLIC_API_ORIGIN;
  if (base) {
    try {
      const url = `${base.replace(/\/$/, "")}/api/listings/${encodeURIComponent(slug)}`;
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { listing: Listing };
        return payload.listing ?? null;
      }
    } catch (error) {
      console.warn(`[build] /api/listings/${slug} unreachable:`, error);
    }
  }
  const listings = await readFixtures();
  return listings.find((listing) => listing.slug === slug) ?? null;
}
