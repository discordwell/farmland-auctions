const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3510";
const adminKey = process.env.ADMIN_API_KEY;

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function main() {
  const health = await getJson<{ ok: boolean }>("/api/health");
  if (!health.ok) throw new Error("Health check did not return ok");

  const listings = await getJson<{ listings: unknown[] }>("/api/listings");
  if (!Array.isArray(listings.listings)) throw new Error("Listings payload is invalid");

  const auctions = await getJson<{ auctions: Array<{ id: string }> }>("/api/auctions");
  if (!Array.isArray(auctions.auctions)) throw new Error("Auctions payload is invalid");

  if (auctions.auctions[0]) {
    const detail = await getJson<{ auction: unknown; bidHistory: unknown[] }>(
      `/api/auctions/${auctions.auctions[0].id}`
    );
    if (!detail.auction || !Array.isArray(detail.bidHistory)) {
      throw new Error("Auction detail payload is invalid");
    }
  }

  if (adminKey) {
    const dashboard = await getJson<{ listing_count: number }>("/api/admin/dashboard", {
      headers: {
        "x-admin-key": adminKey
      }
    });
    if (typeof dashboard.listing_count !== "number") {
      throw new Error("Admin dashboard payload is invalid");
    }
  }

  console.log(`smoke ok: ${baseUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
