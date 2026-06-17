"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { type Listing, type ListingStatus } from "../data";
import { useAuth } from "../lib/useAuth";
import { anchorJump } from "../lib/anchorJump";
import { selectListings, type ListingSortKey } from "../lib/listingFilter";
import { AuctionCatalog, type ApiAuction } from "../auctions/AuctionCatalog";
import { SiteHeader } from "./SiteHeader";

const LeafletMap = dynamic(() => import("./LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="leaflet-host" aria-label="Loading map" />
});

// `value`s are pinned to ListingSortKey so this UI list can't drift from the
// sort logic in ../lib/listingFilter (adding a key the sorter doesn't handle is
// a compile error).
const SORT_OPTIONS: ReadonlyArray<{ value: ListingSortKey; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "ppa-asc", label: "$ / ac · low → high" },
  { value: "ppa-desc", label: "$ / ac · high → low" },
  { value: "acres-desc", label: "Acres · high → low" },
  { value: "soil-desc", label: "Soil · high → low" }
];
type SortKey = ListingSortKey;

const ALL_STATUSES: ListingStatus[] = ["For Sale", "Pending", "Sold", "Wanted", "Lease"];

const statuses: Array<ListingStatus | "All"> = [
  "All",
  "For Sale",
  "Pending",
  "Sold",
  "Wanted",
  "Lease"
];

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-CA");

function secondsUntil(value?: string) {
  if (!value) return 0;
  return Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000));
}

function cleanAuctionTitle(raw: string) {
  return raw.replace(/^DEMO\s*·\s*/i, "");
}

function clampPercent(value: number) {
  return Math.min(92, Math.max(8, value));
}

function listingPinPosition(listing: Listing) {
  if (listing.latitude == null || listing.longitude == null) return null;
  const minLat = 49;
  const maxLat = 60;
  const minLon = -110;
  const maxLon = -101.3;
  const left = clampPercent(((listing.longitude - minLon) / (maxLon - minLon)) * 100);
  const top = clampPercent(((maxLat - listing.latitude) / (maxLat - minLat)) * 100);
  return { left: `${left}%`, top: `${top}%` };
}

function statusSlug(status: ListingStatus) {
  return status.toLowerCase().replaceAll(" ", "-");
}

function formatLotNumber(index: number) {
  return String(index + 1).padStart(3, "0");
}

function CompassRose() {
  return (
    <svg className="compass" viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="30" cy="30" r="22" opacity="0.5" />
      <circle cx="30" cy="30" r="14" opacity="0.3" />
      <path d="M30 6 L33 30 L30 54 L27 30 Z" fill="currentColor" opacity="0.9" />
      <path d="M6 30 L30 27 L54 30 L30 33 Z" fill="currentColor" opacity="0.4" />
      <text x="30" y="4" textAnchor="middle" fill="currentColor" fontFamily="IBM Plex Mono" fontSize="6" fontWeight="600">
        N
      </text>
      <text x="30" y="60" textAnchor="middle" fill="currentColor" fontFamily="IBM Plex Mono" fontSize="6">
        S
      </text>
      <text x="58" y="32" textAnchor="end" fill="currentColor" fontFamily="IBM Plex Mono" fontSize="6">
        E
      </text>
      <text x="2" y="32" fill="currentColor" fontFamily="IBM Plex Mono" fontSize="6">
        W
      </text>
    </svg>
  );
}

function LotCard({
  listing,
  lotIndex,
  watched,
  onToggleWatch
}: {
  listing: Listing;
  lotIndex: number;
  watched: boolean;
  onToggleWatch: (listing: Listing) => void;
}) {
  const lotNo = formatLotNumber(lotIndex);
  const statusKey = statusSlug(listing.status);
  const isWanted = listing.status === "Wanted";
  const soilGap = Math.max(0, Math.min(100, 100 - listing.soilRating));

  return (
    <article className="lot">
      <div className="lot-media">
        <img src={listing.image} alt={`Lot ${lotNo} — ${listing.title}`} />
        <span className="lot-no">
          Lot <span className="num">{lotNo}</span>
        </span>
        <span className={`lot-status s-${statusKey}`}>
          <span className="swatch"></span>
          {listing.status}
        </span>
        {!isWanted && listing.slug ? (
          <button
            type="button"
            className={`lot-watch${watched ? " on" : ""}`}
            onClick={() => onToggleWatch(listing)}
            aria-label={watched ? "Remove from saved" : "Save"}
            title={watched ? "Saved · click to remove" : "Save"}
          >
            {watched ? "★" : "☆"}
          </button>
        ) : null}
      </div>
      <div className="lot-head">
        <div>
          <div className="rm">{listing.rm}</div>
          <h3>{listing.title}</h3>
        </div>
        <div className="legal">{listing.coordinates || "—"}</div>
      </div>
      <dl className="lot-stats">
        <div>
          <dt>{isWanted ? "Seeking" : "Title acres"}</dt>
          <dd>{number.format(listing.acres)}</dd>
        </div>
        <div>
          <dt>{isWanted ? "To pay" : "$ / acre"}</dt>
          <dd>{cad.format(listing.pricePerAcre)}</dd>
        </div>
        <div>
          <dt>Avg AV / Qtr</dt>
          <dd>{cad.format(listing.avgAssessment)}</dd>
        </div>
        <div>
          <dt>SAMA rating</dt>
          <dd>{listing.soilRating}</dd>
        </div>
      </dl>
      {isWanted ? null : (
        <div
          className="lot-soil"
          title={`SAMA Final Rating ${listing.soilRating}/100 — Saskatchewan Assessment Management Agency arable-land productivity index`}
        >
          <span className="lbl">SAMA soil</span>
          <div className="bar" aria-hidden="true">
            <div className="fill" style={{ right: `${soilGap}%` }}></div>
          </div>
          <span className="val">{listing.soilRating}</span>
        </div>
      )}
      <div className="lot-foot">
        <span className="type">{listing.region}</span>
        {isWanted ? (
          <a className="view" href="#procurement">
            Submit details →
          </a>
        ) : listing.slug ? (
          <a className="view" href={`/listings/${encodeURIComponent(listing.slug)}/`}>
            {listing.status === "Sold" ? "Closing record →" : "View lot →"}
          </a>
        ) : (
          <a className="view" href="#procurement">
            Inquire →
          </a>
        )}
      </div>
    </article>
  );
}

function RmMap({
  listings,
  lotNumberFor
}: {
  listings: Listing[];
  lotNumberFor: (id: string) => number;
}) {
  const pins = listings.filter((l) => l.latitude != null && l.longitude != null);

  const counts = useMemo(() => {
    const all = { "For Sale": 0, Pending: 0, Sold: 0, Wanted: 0, Lease: 0 } as Record<ListingStatus, number>;
    listings.forEach((listing) => {
      all[listing.status] = (all[listing.status] ?? 0) + 1;
    });
    return all;
  }, [listings]);

  return (
    <aside className="map-card" aria-labelledby="map-title">
      <div className="map-head">
        <div>
          <h2 id="map-title">RM map</h2>
        </div>
        <div className="scale">
          <strong>Saskatchewan</strong>
          {pins.length} located
        </div>
      </div>
      <div className="map-surface">
        {listings.length ? (
          <LeafletMap listings={listings} lotNumberFor={lotNumberFor} />
        ) : (
          <div className="map-empty">
            <strong>No mapped lots</strong>
            Lots with coordinates appear here.
          </div>
        )}
      </div>
      <div className="legend">
        <a
          className="item"
          href="#inventory"
          onClick={(e) => anchorJump(e, "#inventory", { status: "For Sale" })}
        >
          <span className="swatch"></span>
          <span>For sale</span>
          <span className="count">{counts["For Sale"]}</span>
        </a>
        <a
          className="item s-pending"
          href="#inventory"
          onClick={(e) => anchorJump(e, "#inventory", { status: "Pending" })}
        >
          <span className="swatch"></span>
          <span>Pending</span>
          <span className="count">{counts.Pending}</span>
        </a>
        <a
          className="item s-sold"
          href="#inventory"
          onClick={(e) => anchorJump(e, "#inventory", { status: "Sold" })}
        >
          <span className="swatch"></span>
          <span>Sold</span>
          <span className="count">{counts.Sold}</span>
        </a>
        <a
          className="item s-wanted"
          href="#inventory"
          onClick={(e) => anchorJump(e, "#inventory", { status: "Wanted" })}
        >
          <span className="swatch"></span>
          <span>Wanted</span>
          <span className="count">{counts.Wanted}</span>
        </a>
        <a
          className="item s-lease"
          href="#inventory"
          onClick={(e) => anchorJump(e, "#inventory", { status: "Lease" })}
        >
          <span className="swatch"></span>
          <span>Lease</span>
          <span className="count">{counts.Lease}</span>
        </a>
        <a className="item s-live" href="#floor" onClick={(e) => anchorJump(e, "#floor")}>
          <span className="swatch"></span>
          <span>Live now</span>
          <span className="count">{counts.Pending > 0 ? 1 : 0}</span>
        </a>
      </div>
    </aside>
  );
}

function HeroCaption({
  featuredAuction,
  featuredListing,
  highBidCurrent,
  minsRemaining
}: {
  featuredAuction: ApiAuction | null;
  featuredListing: Listing | null;
  highBidCurrent: number;
  minsRemaining: number;
}) {
  const lotTitle = featuredAuction
    ? cleanAuctionTitle(featuredAuction.title)
    : featuredListing!.title;
  const lotRm = featuredAuction
    ? featuredAuction.listing?.rm ?? ""
    : featuredListing!.rm;
  const lotAcres = featuredAuction
    ? featuredAuction.listing?.acres ?? null
    : featuredListing!.acres;
  const titleParts = lotTitle.split(" ");
  const titleHead = titleParts.slice(0, -1).join(" ");
  const titleTail = titleParts.slice(-1)[0] ?? lotTitle;
  const closesLabel =
    featuredAuction && featuredAuction.status === "open"
      ? minsRemaining < 60
        ? `In ${Math.max(0, minsRemaining)} min`
        : `${new Date(featuredAuction.closesAt).toLocaleTimeString("en-CA", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          })} CST`
      : null;

  return (
    <div className="caption">
      <div className="kicker">
        {featuredAuction
          ? `Auction · ${lotRm || "live on the floor"}`
          : `Featured · ${lotRm}`}
      </div>
      <div className="title">
        {titleHead ? `${titleHead} ` : ""}
        <em>{titleTail}.</em>
      </div>
      <div className="rule"></div>
      <div className="row">
        <div>
          <div className="lbl">Acres</div>
          <div className="val">
            {lotAcres != null ? number.format(Math.round(lotAcres)) : "—"}
          </div>
        </div>
        {featuredAuction ? (
          <>
            <div>
              <div className="lbl">Current bid</div>
              <div className="val">
                {highBidCurrent > 0 ? cad.format(highBidCurrent) : "—"}
              </div>
            </div>
            <div>
              <div className="lbl">{closesLabel ? "Closes" : "Status"}</div>
              <div className="val">
                {closesLabel ??
                  featuredAuction.status.charAt(0).toUpperCase() + featuredAuction.status.slice(1)}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="lbl">$/ac</div>
              <div className="val">{cad.format(featuredListing!.pricePerAcre)}</div>
            </div>
            <div>
              <div className="lbl">Status</div>
              <div className="val">{featuredListing!.status}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function FarmAuctionApp() {
  const { user, status: authStatus, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    window.location.assign("/");
  }
  const [status, setStatus] = useState<Array<ListingStatus | "All">>(["All"]);
  const [region, setRegion] = useState("All");
  const [minAcres, setMinAcres] = useState("");
  const [minSoilRating, setMinSoilRating] = useState("");
  const [maxPricePerAcre, setMaxPricePerAcre] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [backendListings, setBackendListings] = useState<Listing[]>([]);
  const [isListingsLoading, setIsListingsLoading] = useState(true);
  const [listingError, setListingError] = useState("");
  const [liveAuctions, setLiveAuctions] = useState<ApiAuction[]>([]);
  const [isAuctionsLoading, setIsAuctionsLoading] = useState(true);
  const [contactStatus, setContactStatus] = useState("");
  const [contactError, setContactError] = useState("");
  const [watchedSlugs, setWatchedSlugs] = useState<Set<string>>(new Set());

  function readLocalWatchlist(): string[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("farmauction-watchlist");
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
    } catch {
      return [];
    }
  }

  function writeLocalWatchlist(slugs: Iterable<string>) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("farmauction-watchlist", JSON.stringify(Array.from(slugs)));
    } catch {
      /* localStorage full or blocked — silently ignore */
    }
  }

  useEffect(() => {
    if (authStatus !== "ready") return;
    if (!user) {
      setWatchedSlugs(new Set(readLocalWatchlist()));
      return;
    }
    let cancelled = false;
    const localSlugs = readLocalWatchlist();
    const sync = async () => {
      if (localSlugs.length) {
        try {
          await fetch("/api/me/watchlist/sync", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slugs: localSlugs })
          });
          window.localStorage.removeItem("farmauction-watchlist");
        } catch {
          /* leave local state in place; we'll retry next login */
        }
      }
      try {
        const response = await fetch("/api/me/summary", { credentials: "include" });
        if (!response.ok) return;
        const payload = (await response.json()) as { watchlist?: Array<{ slug: string }> };
        if (cancelled) return;
        setWatchedSlugs(new Set(payload.watchlist?.map((row) => row.slug) ?? []));
      } catch {
        /* ignore */
      }
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, [authStatus, user?.id]);

  async function toggleWatch(listing: Listing) {
    if (!listing.slug) return;
    const slug = listing.slug;
    const next = new Set(watchedSlugs);
    const wasWatched = next.has(slug);
    if (wasWatched) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    setWatchedSlugs(next);

    if (!user) {
      writeLocalWatchlist(next);
      return;
    }
    try {
      await fetch(`/api/me/watchlist/${listing.id}`, {
        method: wasWatched ? "DELETE" : "POST",
        credentials: "include"
      });
    } catch {
      // Roll back on failure
      setWatchedSlugs((current) => {
        const rolled = new Set(current);
        if (wasWatched) rolled.add(slug);
        else rolled.delete(slug);
        return rolled;
      });
    }
  }

  useEffect(() => {
    setIsListingsLoading(true);
    fetch("/api/listings")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: { listings: Listing[] }) => {
        setBackendListings(payload.listings);
        setListingError("");
      })
      .catch(() => {
        setBackendListings([]);
        setListingError("Listings are unavailable");
      })
      .finally(() => setIsListingsLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsAuctionsLoading(true);
    fetch("/api/auctions")
      .then((response) => {
        if (!response.ok) throw new Error("Auctions service is offline");
        return response.json() as Promise<{ auctions: ApiAuction[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        // Sort soonest-closing first so the home catalog leads with urgency.
        const sorted = [...payload.auctions].sort(
          (a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()
        );
        setLiveAuctions(sorted);
      })
      .catch(() => {
        if (!cancelled) setLiveAuctions([]);
      })
      .finally(() => {
        if (!cancelled) setIsAuctionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // URL-state sync — read from URL on mount + on popstate/hashchange, and write back on every filter change.
  const skipNextUrlWrite = useRef(true);
  useEffect(() => {
    function readFromUrl() {
      // Prefer query string; fall back to fragment query (legacy footer links use `#inventory?status=Sold`)
      const queryParams = new URLSearchParams(window.location.search);
      let fragParams: URLSearchParams | null = null;
      const hash = window.location.hash;
      const fragMatch = /\?(.+)$/.exec(hash);
      if (fragMatch) fragParams = new URLSearchParams(fragMatch[1]);

      const get = (key: string) =>
        queryParams.get(key) ?? fragParams?.get(key) ?? "";

      const rawStatus = get("status");
      if (rawStatus) {
        const parsed = rawStatus
          .split(",")
          .map((s) => decodeURIComponent(s.trim()))
          .filter((s): s is ListingStatus => ALL_STATUSES.includes(s as ListingStatus));
        setStatus(parsed.length ? parsed : ["All"]);
      } else {
        setStatus(["All"]);
      }
      setRegion(get("region") || "All");
      setMinAcres(get("minAcres") || "");
      setMinSoilRating(get("minSoil") || "");
      setMaxPricePerAcre(get("maxPpa") || "");
      setSearchQuery(get("q") || "");
      const rawSort = get("sort") as SortKey;
      setSortKey(SORT_OPTIONS.some((opt) => opt.value === rawSort) ? rawSort : "newest");
      // The state setters above will trigger the write-back effect — suppress one round trip.
      skipNextUrlWrite.current = true;
    }
    readFromUrl();
    window.addEventListener("popstate", readFromUrl);
    window.addEventListener("hashchange", readFromUrl);
    return () => {
      window.removeEventListener("popstate", readFromUrl);
      window.removeEventListener("hashchange", readFromUrl);
    };
  }, []);

  // Write filter state back to the URL — replaceState so each keystroke doesn't pollute history.
  useEffect(() => {
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (status.length && !status.includes("All")) params.set("status", status.join(","));
    if (region !== "All") params.set("region", region);
    if (minAcres) params.set("minAcres", minAcres);
    if (minSoilRating) params.set("minSoil", minSoilRating);
    if (maxPricePerAcre) params.set("maxPpa", maxPricePerAcre);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (sortKey !== "newest") params.set("sort", sortKey);
    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
    if (newUrl !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [status, region, minAcres, minSoilRating, maxPricePerAcre, searchQuery, sortKey]);

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setContactStatus("");
    setContactError("");

    const rawMessage = String(data.get("message") ?? "").trim();
    const rmHint = String(data.get("rmHint") ?? "").trim();
    const message = rmHint ? `RM hint: ${rmHint}\n\n${rawMessage}` : rawMessage;

    try {
      const response = await fetch("/api/contact-inquiries", {
        body: JSON.stringify({
          email: data.get("email"),
          fileType: data.get("fileType"),
          message,
          name: data.get("name"),
          phone: data.get("phone"),
          consentNewsletter: data.get("consentNewsletter") === "on"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      if (!response.ok) throw new Error("Contact inquiry failed");
      form.reset();
      setContactStatus("Brief sent. Cameron will be in touch.");
    } catch {
      setContactError("Inquiry service offline — email cameron@wyattrealty.ca.");
    }
  }

  const filteredListings = useMemo(
    () =>
      selectListings(
        backendListings,
        { status, region, minAcres, minSoilRating, maxPricePerAcre, searchQuery },
        sortKey
      ),
    [
      backendListings,
      status,
      region,
      minAcres,
      minSoilRating,
      maxPricePerAcre,
      searchQuery,
      sortKey
    ]
  );

  const hasActiveFilters =
    !status.includes("All") ||
    region !== "All" ||
    Boolean(minAcres) ||
    Boolean(minSoilRating) ||
    Boolean(maxPricePerAcre) ||
    Boolean(searchQuery.trim()) ||
    sortKey !== "newest";

  function resetFilters() {
    setStatus(["All"]);
    setRegion("All");
    setMinAcres("");
    setMinSoilRating("");
    setMaxPricePerAcre("");
    setSearchQuery("");
    setSortKey("newest");
  }

  const regionOptions = useMemo(
    () => ["All", ...Array.from(new Set(backendListings.map((listing) => listing.region))).sort()],
    [backendListings]
  );

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = { All: backendListings.length };
    backendListings.forEach((listing) => {
      map[listing.status] = (map[listing.status] ?? 0) + 1;
    });
    return map;
  }, [backendListings]);

  const lotNumberById = useMemo(() => {
    const map = new Map<string, number>();
    backendListings.forEach((listing, idx) => map.set(listing.id, idx));
    return map;
  }, [backendListings]);
  const lotNumberFor = (id: string) => lotNumberById.get(id) ?? 0;

  const totalAcres = useMemo(
    () => backendListings.reduce((sum, listing) => sum + listing.acres, 0),
    [backendListings]
  );
  const rmCount = useMemo(
    () => new Set(backendListings.map((listing) => listing.rm)).size,
    [backendListings]
  );
  const spotPricePerAcre = useMemo(() => {
    const priced = backendListings.filter((listing) => listing.pricePerAcre > 0);
    if (!priced.length) return 0;
    return Math.round(priced.reduce((sum, listing) => sum + listing.pricePerAcre, 0) / priced.length);
  }, [backendListings]);

  // Sorted soonest-closing first by the loader; the home page features that one.
  const featuredAuction = liveAuctions[0] ?? null;
  const openAuctions = useMemo(
    () => liveAuctions.filter((auction) => auction.status === "open"),
    [liveAuctions]
  );
  const openAuctionCount = openAuctions.length;
  const highBidCurrent = featuredAuction?.currentHighBidDollars ?? 0;
  const secsRemaining = secondsUntil(featuredAuction?.closesAt);
  const minsRemaining = Math.floor(secsRemaining / 60);

  const featuredListing = useMemo(() => {
    const forSale = backendListings.find((l) => l.status === "For Sale");
    return forSale ?? backendListings[0] ?? null;
  }, [backendListings]);

  function toggleStatus(nextStatus: ListingStatus | "All") {
    if (nextStatus === "All") {
      setStatus(["All"]);
      return;
    }
    const active = status.filter((item) => item !== "All");
    const next = active.includes(nextStatus)
      ? active.filter((item) => item !== nextStatus)
      : [...active, nextStatus];
    setStatus(next.length ? next : ["All"]);
  }

  return (
    <main>
      <div className="edition">
        <div className="left">
          <span>Regina, SK · Treaty 4</span>
        </div>
        <div className="center">
          {featuredAuction && featuredAuction.status === "open" ? (
            <a href="#floor" onClick={(e) => anchorJump(e, "#floor")}>
              {cleanAuctionTitle(featuredAuction.title)} · closes in {minsRemaining} min
            </a>
          ) : (
            <span>Saskatchewan farmland · Wyatt Realty Group</span>
          )}
        </div>
        <div className="right">
          {spotPricePerAcre > 0 ? (
            <a href="#inventory" onClick={(e) => anchorJump(e, "#inventory", { sort: "ppa-asc" })}>
              Avg $/ac <strong>{number.format(spotPricePerAcre)}</strong>
            </a>
          ) : null}
          {totalAcres > 0 ? (
            <a href="#inventory" onClick={(e) => anchorJump(e, "#inventory")}>
              Acres listed <strong>{number.format(Math.round(totalAcres))}</strong>
            </a>
          ) : null}
        </div>
      </div>

      <SiteHeader
        user={user}
        authStatus={authStatus}
        onSignOut={handleSignOut}
        onHome
        highlightAuction={!!featuredAuction && featuredAuction.status === "open"}
      />

      <section className="hero" id="top">
        <div className="hero-text">
          <div className="hero-meta">
            <a className="byline" href="#procurement" onClick={(e) => anchorJump(e, "#procurement")}>
              <strong>Cameron Wyatt</strong>
              <span className="trail">Saskatchewan REALTOR®</span>
            </a>
          </div>
          <div>
            <h1 className="display">
              Land,
              <br />
              <em>lot by lot.</em>
              <br />
              <span style={{ fontStyle: "italic", fontWeight: 500 }}>Bid by bid.</span>
            </h1>
            <p className="hero-lede">
              Saskatchewan farmland — listings, leases, and live auctions.
            </p>
          </div>
          <div className="hero-actions">
            <a className="btn btn-ember" href="#floor">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--paper)" }}></span>
              Open the floor <span className="arrow">→</span>
            </a>
            <a className="btn btn-ghost" href="#inventory">
              Browse the inventory
            </a>
            {featuredAuction && featuredAuction.status === "open" ? (
              <span className="meta">
                Bell · {new Date(featuredAuction.closesAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })} CST
              </span>
            ) : null}
          </div>
        </div>
        <div className="hero-photo">
          <img
            src={
              featuredAuction?.listing?.image ||
              featuredListing?.image ||
              "/images/lots/hero.png"
            }
            alt={
              featuredAuction
                ? cleanAuctionTitle(featuredAuction.title)
                : featuredListing
                  ? featuredListing.title
                  : "Saskatchewan farmland at sunset"
            }
          />
          {featuredAuction || featuredListing ? (
            <HeroCaption
              featuredAuction={featuredAuction}
              featuredListing={featuredListing}
              highBidCurrent={highBidCurrent}
              minsRemaining={minsRemaining}
            />
          ) : null}
        </div>
      </section>

      <div className="stat-rail" aria-label="Inventory at a glance">
        <a className="cell" href="#inventory" onClick={(e) => anchorJump(e, "#inventory")}>
          <div className="lbl">
            Listings <span className="pip">§</span>
          </div>
          <div className="val figure">
            {number.format(backendListings.length)}
            <span className="unit">on book</span>
          </div>
          <div className="foot">{statusCounts["For Sale"] ?? 0} for sale</div>
        </a>
        <a className="cell" href="#inventory" onClick={(e) => anchorJump(e, "#inventory")}>
          <div className="lbl">
            Acres <span className="pip">§</span>
          </div>
          <div className="val figure">
            {number.format(Math.round(totalAcres))}
            <span className="unit">ac.</span>
          </div>
          <div className="foot">{rmCount} rural municipalities</div>
        </a>
        <a className="cell" href="#floor" onClick={(e) => anchorJump(e, "#floor")}>
          <div className="lbl">
            Auctions <span className="pip">§</span>
          </div>
          <div className="val figure">
            {number.format(openAuctionCount)}
            <span className="unit">{openAuctionCount === 1 ? "live" : "live"}</span>
          </div>
          <div className={openAuctionCount > 0 ? "foot live" : "foot"}>
            {openAuctionCount === 0
              ? "No auction open"
              : featuredAuction
                ? `● Soonest closes in ${minsRemaining} min`
                : ""}
          </div>
        </a>
        <a className="cell" href="#floor" onClick={(e) => anchorJump(e, "#floor")}>
          <div className="lbl">
            High bid <span className="pip">§</span>
          </div>
          <div className="val figure">
            {highBidCurrent > 0 ? cad.format(highBidCurrent) : "—"}
          </div>
          <div className={featuredAuction?.reserveMet ? "foot up" : "foot"}>
            {featuredAuction?.reserveMet ? "▲ Reserve met" : "Reserve pending"}
          </div>
        </a>
      </div>

      <section className="band" id="inventory">
        <div className="sec-head">
          <span className="sign">§01 &nbsp; Lots</span>
          <h2 className="title">
            Open <em>lots.</em>
          </h2>
          <p className="lede">
            Saskatchewan farmland — sale, lease, wanted, pending.
          </p>
        </div>

        <div className="docket">
          <div className="docket-title">
            <strong>Docket</strong> · status
          </div>
          <div className="filter-row">
            <div className="chips" role="tablist" aria-label="Status">
              {statuses.map((item) => (
                <button
                  className={status.includes(item) ? "chip active" : "chip"}
                  key={item}
                  onClick={() => toggleStatus(item)}
                  type="button"
                >
                  {item} <span className="count">{statusCounts[item] ?? 0}</span>
                </button>
              ))}
            </div>
            <label className="search-pill">
              <span>Search</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Title, RM, region…"
                aria-label="Search listings"
              />
            </label>
            <label className="select-pill">
              <span>Region</span>
              <select value={region} onChange={(event) => setRegion(event.target.value)}>
                {regionOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="num-in">
              <span>Min ac.</span>
              <input
                inputMode="numeric"
                value={minAcres}
                onChange={(event) => setMinAcres(event.target.value)}
              />
            </label>
            <label className="num-in">
              <span>Soil ≥</span>
              <input
                inputMode="numeric"
                value={minSoilRating}
                onChange={(event) => setMinSoilRating(event.target.value)}
              />
            </label>
            <label className="num-in">
              <span>Max $/ac.</span>
              <input
                inputMode="numeric"
                value={maxPricePerAcre}
                onChange={(event) => setMaxPricePerAcre(event.target.value)}
              />
            </label>
            <label className="select-pill">
              <span>Sort</span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="right">
            Showing&nbsp;
            <strong>
              {filteredListings.length} of {backendListings.length}
            </strong>
            {hasActiveFilters ? (
              <button type="button" className="reset-link" onClick={resetFilters}>
                Reset
              </button>
            ) : null}
          </div>
        </div>

        <div className="inventory">
          <div className="lot-grid">
            {filteredListings.length ? (
              filteredListings.map((listing) => (
                <LotCard
                  listing={listing}
                  lotIndex={lotNumberFor(listing.id)}
                  watched={listing.slug ? watchedSlugs.has(listing.slug) : false}
                  onToggleWatch={toggleWatch}
                  key={listing.id}
                />
              ))
            ) : (
              <div className="lot-empty">
                <strong>{isListingsLoading ? "Loading" : "No matching lots"}</strong>
                {listingError || "Adjust the filters to see lots."}
              </div>
            )}
          </div>
          <RmMap listings={filteredListings} lotNumberFor={lotNumberFor} />
        </div>
      </section>

      <section className="band" id="floor">
        <div className="sec-head">
          <span className="sign">§02 &nbsp; Auctions</span>
          <h2 className="title">
            Open <em>auctions.</em>
          </h2>
          <p className="lede">
            Reserves published. Bell drops on schedule. Click through to bid.
          </p>
        </div>
        {isAuctionsLoading ? (
          <div className="auction-catalog-empty">Loading auctions…</div>
        ) : (
          <AuctionCatalog auctions={liveAuctions} variant="compact" />
        )}
      </section>

      <section className="band" id="procurement">
        <div className="sec-head">
          <span className="sign">§03 &nbsp; Contact</span>
          <h2 className="title">
            Reach <em>Cameron.</em>
          </h2>
        </div>
        <div className="procurement">
          <aside className="agent-card">
            <div className="agent-portrait" aria-hidden="true">
              {/* Drop a real headshot at /public/images/cameron.png to replace the monogram. */}
              <span className="agent-monogram">CW</span>
            </div>
            <div className="agent-meta">
              <span className="name">Cameron Wyatt</span>
              <span className="role">Saskatchewan REALTOR® · Wyatt Realty Group</span>
              <div className="creds">
                <div>
                  <span className="lbl">Email</span>
                  <a href="mailto:cameron@wyattrealty.ca">cameron@wyattrealty.ca</a>
                </div>
                <div>
                  <span className="lbl">Based</span>
                  <span>Regina · province-wide</span>
                </div>
              </div>
            </div>
          </aside>

          <div className="contact-block">
            <form className="contact-form" onSubmit={submitContact}>
              <div className="field">
                <label htmlFor="ct-name">Name</label>
                <input id="ct-name" name="name" autoComplete="name" placeholder="Your full name" required />
              </div>
              <div className="field">
                <label htmlFor="ct-email">Email</label>
                <input id="ct-email" name="email" type="email" autoComplete="email" placeholder="you@operations.ca" required />
              </div>
              <div className="field">
                <label htmlFor="ct-phone">Phone</label>
                <input id="ct-phone" name="phone" autoComplete="tel" placeholder="306 555 0119" />
              </div>
              <div className="field">
                <label htmlFor="ct-type">Type</label>
                <select id="ct-type" name="fileType" defaultValue="Auction">
                  <option>Auction</option>
                  <option>For Sale</option>
                  <option>Lease</option>
                  <option>Wanted</option>
                </select>
              </div>
              <div className="field full">
                <label htmlFor="ct-msg">Details</label>
                <textarea
                  id="ct-msg"
                  name="message"
                  rows={3}
                  placeholder="Acres, RM, soil rating, timing — whatever you've got."
                />
              </div>
              <label className="check full">
                <input name="consentNewsletter" type="checkbox" />
                <span>Notify me when new lots open or an auction is called.</span>
              </label>
              <button className="submit full" type="submit">
                Send <span className="arrow">→</span>
              </button>
              {contactStatus ? <p className="form-status success full">{contactStatus}</p> : null}
              {contactError ? <p className="form-status full">{contactError}</p> : null}
            </form>
          </div>
        </div>
      </section>

      <footer className="colophon" id="almanac">
        <div className="colo-grid">
          <div>
            <div className="colo-statement">
              <strong>Wyatt Farmland Auctions</strong>
              Saskatchewan farmland — <em>operator-led, built to last.</em> Listings, leases, and live auctions managed by Wyatt Realty Group out of Regina.
            </div>
          </div>
          <div>
            <h4>Browse</h4>
            <ul>
              <li>
                <a href="#inventory">All lots</a>
              </li>
              <li>
                <a href="#floor">Live auction</a>
              </li>
              <li>
                <a
                  href="#inventory"
                  onClick={(e) => anchorJump(e, "#inventory", { status: "Sold" })}
                >
                  Sold
                </a>
              </li>
              <li>
                <a
                  href="#inventory"
                  onClick={(e) => anchorJump(e, "#inventory", { status: "Wanted" })}
                >
                  Wanted
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Bidders</h4>
            <ul>
              <li>
                <a href="#floor">Register</a>
              </li>
              <li>
                <a href="/bidder-terms/">Bidder terms</a>
              </li>
              <li>
                <a href="#procurement">Get in touch</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Office</h4>
            <ul>
              <li>
                <a href="mailto:cameron@wyattrealty.ca">cameron@wyattrealty.ca</a>
              </li>
              <li>
                <a href="#procurement">Send a brief</a>
              </li>
              <li>
                <span style={{ color: "var(--mute)" }}>Regina · Treaty 4</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="colo-bottom">
          <div>© {new Date().getFullYear()} Wyatt Realty Group · Regina, SK</div>
          <div className="right">
            <a href="mailto:cameron@wyattrealty.ca">cameron@wyattrealty.ca</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

