"use client";

import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Filter,
  Gavel,
  Image as ImageIcon,
  Landmark,
  Mail,
  Map,
  MapPinned,
  Menu,
  MessageSquare,
  Search,
  Sprout,
  Timer,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { type Listing, type ListingStatus } from "../data";

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

type DisplayBid = {
  id?: string;
  bidder: string;
  amount: number;
  time: string;
};

type ApiBid = {
  id: string;
  bidderAlias: string;
  amountDollars: number;
  accepted: boolean;
  createdAt: string;
};

type ApiAuction = {
  id: string;
  title: string;
  status: string;
  closesAt: string;
  bidIncrementCents: number;
  reserveMet: boolean;
  currentHighBidCents: number;
  currentHighBidDollars: number;
};

type BidAcceptedPayload = {
  accepted: boolean;
  bid: ApiBid;
  auction: ApiAuction;
};

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function mapApiBid(bid: ApiBid): DisplayBid {
  return {
    id: bid.id,
    bidder: bid.bidderAlias,
    amount: bid.amountDollars,
    time: formatTime(bid.createdAt)
  };
}

function secondsUntil(value?: string) {
  if (!value) return 0;
  return Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000));
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

function statusClass(status: ListingStatus) {
  return `status status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

function ListingCard({ listing }: { listing: Listing }) {
  const [mediaMode, setMediaMode] = useState<"photo" | "satellite">("photo");
  const imageSrc = mediaMode === "photo" ? listing.image : listing.satellite;

  return (
    <article className="listing-card">
      <div className="listing-media">
        <img src={imageSrc} alt={`${listing.title} ${mediaMode} view`} />
        <div className="media-tabs" aria-label="Listing media">
          <button
            className={mediaMode === "photo" ? "active" : ""}
            type="button"
            title="Photos"
            aria-label="Photos"
            onClick={() => setMediaMode("photo")}
          >
            <ImageIcon size={16} />
          </button>
          <button
            className={mediaMode === "satellite" ? "active" : ""}
            type="button"
            title="Satellite"
            aria-label="Satellite"
            onClick={() => setMediaMode("satellite")}
          >
            <Map size={16} />
          </button>
        </div>
        <span className={statusClass(listing.status)}>{listing.status}</span>
      </div>
      <div className="listing-body">
        <div>
          <p className="eyebrow">{listing.rm}</p>
          <h3>{listing.title}</h3>
        </div>
        <dl className="listing-stats">
          <div>
            <dt>Title Acres</dt>
            <dd>{number.format(listing.acres)}</dd>
          </div>
          <div>
            <dt>$/Acre</dt>
            <dd>{cad.format(listing.pricePerAcre)}</dd>
          </div>
          <div>
            <dt>Avg. AV/Qtr</dt>
            <dd>{cad.format(listing.avgAssessment)}</dd>
          </div>
          <div>
            <dt>Soil Final</dt>
            <dd>{listing.soilRating}</dd>
          </div>
        </dl>
        <div className="listing-footer">
          <span>{listing.type}</span>
          <span>{listing.coordinates}</span>
        </div>
      </div>
    </article>
  );
}

function Countdown({ closesAt }: { closesAt?: string }) {
  const [seconds, setSeconds] = useState(() => secondsUntil(closesAt));

  useEffect(() => {
    setSeconds(secondsUntil(closesAt));
    const id = window.setInterval(() => {
      setSeconds(secondsUntil(closesAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [closesAt]);

  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

  return (
    <div className="countdown" aria-label="Auction countdown">
      <Timer size={18} />
      <span>{mins}</span>
      <span>:</span>
      <span>{secs}</span>
    </div>
  );
}

function AuctionPanel({
  auction,
  bids,
  bidderEmail,
  isLoading,
  onBidderEmailChange,
  onBidAccepted
}: {
  auction: ApiAuction | null;
  bids: DisplayBid[];
  bidderEmail: string;
  isLoading: boolean;
  onBidderEmailChange: (email: string) => void;
  onBidAccepted: (payload: BidAcceptedPayload) => void;
}) {
  const [bidAmount, setBidAmount] = useState(0);
  const [bidError, setBidError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const increment = (auction?.bidIncrementCents ?? 0) / 100;
    const currentHigh = Math.max(auction?.currentHighBidDollars ?? 0, bids[0]?.amount ?? 0);
    setBidAmount(currentHigh + increment);
  }, [auction?.bidIncrementCents, auction?.currentHighBidDollars, bids]);

  async function submitBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBidError("");

    if (!auction) {
      setBidError("No active auction");
      return;
    }

    if (auction.status !== "open") {
      setBidError("Auction is not open");
      return;
    }

    if (!bidderEmail.trim()) {
      setBidError("Enter the approved bidder email");
      return;
    }

    const increment = auction.bidIncrementCents / 100;
    const currentHigh = Math.max(auction.currentHighBidDollars, bids[0]?.amount ?? 0);
    const safeBid = Math.max(bidAmount, currentHigh + increment);

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auctions/${auction.id}/bids`, {
        body: JSON.stringify({
          amountCents: Math.round(safeBid * 100),
          bidderEmail: bidderEmail.trim(),
          idempotencyKey: crypto.randomUUID()
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json()) as BidAcceptedPayload & {
        minimumBidCents?: number;
        reason?: string;
      };

      if (!response.ok || !payload.accepted) {
        setBidError(payload.reason ?? "Bid was not accepted");
        if (payload.minimumBidCents) setBidAmount(payload.minimumBidCents / 100);
        return;
      }

      onBidAccepted(payload);
      setBidAmount(payload.auction.currentHighBidDollars + payload.auction.bidIncrementCents / 100);
    } catch {
      setBidError("Bid service is offline");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!auction) {
    return (
      <section className="auction-panel" aria-labelledby="auction-title">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Auction</p>
            <h2 id="auction-title">{isLoading ? "Loading auction" : "No active auction"}</h2>
          </div>
        </div>
        <div className="empty-state panel-empty">
          <strong>{isLoading ? "Checking availability" : "Registration is closed"}</strong>
          <span>
            {isLoading
              ? "Auction data is loading."
              : "New farmland auction files will appear here when opened by Wyatt Realty Group."}
          </span>
        </div>
      </section>
    );
  }

  const currentHigh = Math.max(auction.currentHighBidDollars, bids[0]?.amount ?? 0);
  const isOpen = auction.status === "open";

  return (
    <section className="auction-panel" aria-labelledby="auction-title">
      <div className="panel-head">
        <div>
          <p className={isOpen ? "eyebrow live-dot" : "eyebrow"}>{isOpen ? "Live auction" : "Auction"}</p>
          <h2 id="auction-title">{auction.title}</h2>
        </div>
        <Countdown closesAt={auction.closesAt} />
      </div>
      <div className="auction-grid">
        <div className="bid-now">
          <span className="label">Current high bid</span>
          <strong>{currentHigh > 0 ? cad.format(currentHigh) : cad.format(0)}</strong>
          <div className="reserve-row">
            <Check size={16} />
            <span>{auction.reserveMet ? "Reserve met" : "Reserve pending"}</span>
          </div>
          <form onSubmit={submitBid}>
            <label htmlFor="bidderEmail">Approved bidder email</label>
            <input
              className="bid-email"
              id="bidderEmail"
              type="email"
              autoComplete="email"
              value={bidderEmail}
              onChange={(event) => onBidderEmailChange(event.target.value)}
            />
            <label htmlFor="bidAmount">Bid command</label>
            <div className="bid-command">
              <input
                id="bidAmount"
                inputMode="numeric"
                value={bidAmount}
                onChange={(event) => setBidAmount(Number(event.target.value))}
              />
              <button type="submit" disabled={isSubmitting || !isOpen}>
                <Gavel size={17} />
                {isSubmitting ? "Sending" : isOpen ? "Submit" : "Closed"}
              </button>
            </div>
            {bidError ? <p className="form-status">{bidError}</p> : null}
          </form>
        </div>
        <div className="bid-ledger">
          <div className="ledger-title">
            <Clock3 size={16} />
            <span>Bid history</span>
          </div>
          {bids.length ? (
            bids.map((bid, index) => (
              <div className="ledger-row" key={`${bid.bidder}-${bid.time}-${index}`}>
                <span>{bid.bidder}</span>
                <strong>{cad.format(bid.amount)}</strong>
                <time>{bid.time}</time>
              </div>
            ))
          ) : (
            <div className="empty-state compact-empty">
              <strong>No accepted bids</strong>
              <span>Accepted bids will appear as they are recorded.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RmMap({ listings }: { listings: Listing[] }) {
  const pins = listings
    .map((listing) => {
      const position = listingPinPosition(listing);
      if (!position) return null;
      return {
        label: listing.rm,
        status: listing.status,
        ...position
      };
    })
    .filter((pin): pin is { label: string; left: string; top: string; status: ListingStatus } =>
      Boolean(pin)
    );

  return (
    <section className="map-panel" aria-labelledby="map-title">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">RM map</p>
          <h2 id="map-title">Published listing locations</h2>
        </div>
      </div>
      <div className="map-surface">
        {pins.length ? (
          pins.map((pin) => (
            <span
              className={`map-pin pin-${pin.status.toLowerCase().replaceAll(" ", "-")}`}
              key={`${pin.label}-${pin.left}-${pin.top}`}
              style={{ top: pin.top, left: pin.left }}
              title={`${pin.label}: ${pin.status}`}
              aria-label={`${pin.label}: ${pin.status}`}
            >
              <MapPinned size={15} />
              <span>{pin.label}</span>
            </span>
          ))
        ) : (
          <div className="empty-state map-empty">
            <strong>No mapped listings</strong>
            <span>Mapped listings will appear here.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function BidderRegistration({
  auction,
  bidderEmail,
  onBidderEmailChange
}: {
  auction: ApiAuction | null;
  bidderEmail: string;
  onBidderEmailChange: (email: string) => void;
}) {
  const [legalName, setLegalName] = useState("");
  const [entityType, setEntityType] = useState("individual");
  const [phone, setPhone] = useState("");
  const [mailingAddress, setMailingAddress] = useState("");
  const [identityDocumentUrl, setIdentityDocumentUrl] = useState("");
  const [proofOfFundsUrl, setProofOfFundsUrl] = useState("");
  const [depositReference, setDepositReference] = useState("");
  const [bidderNotes, setBidderNotes] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auction) return;
    setStatus("");
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/auctions/${auction.id}/register`, {
        body: JSON.stringify({
          email: bidderEmail.trim(),
          bidderNotes: bidderNotes.trim(),
          depositReference: depositReference.trim(),
          entityType,
          identityDocumentUrl: identityDocumentUrl.trim(),
          legalName: legalName.trim(),
          mailingAddress: mailingAddress.trim(),
          phone: phone.trim() || undefined,
          proofOfFundsUrl: proofOfFundsUrl.trim(),
          termsVersion: "2026-05-18",
          termsAccepted
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        setError(payload.message ?? "Registration was not accepted");
        return;
      }

      setStatus("Registration submitted. Approval is required before bidding.");
    } catch {
      setError("Registration service is offline");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <aside className="bidder-panel">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">Bidder portal</p>
          <h2>Register for auction</h2>
        </div>
      </div>
      {auction ? (
        <form className="registration-form" onSubmit={submitRegistration}>
          <label>
            Legal name
            <input
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
              autoComplete="organization"
              required
            />
          </label>
          <label>
            Entity type
            <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="individual">Individual</option>
              <option value="corporation">Corporation</option>
              <option value="partnership">Partnership</option>
              <option value="trust">Trust</option>
            </select>
          </label>
          <label>
            Email
            <input
              type="email"
              value={bidderEmail}
              onChange={(event) => onBidderEmailChange(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Phone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
            />
          </label>
          <label>
            Mailing address
            <textarea
              value={mailingAddress}
              onChange={(event) => setMailingAddress(event.target.value)}
              required
            />
          </label>
          <label>
            ID document link
            <input
              value={identityDocumentUrl}
              onChange={(event) => setIdentityDocumentUrl(event.target.value)}
            />
          </label>
          <label>
            Proof of funds link
            <input
              value={proofOfFundsUrl}
              onChange={(event) => setProofOfFundsUrl(event.target.value)}
            />
          </label>
          <label>
            Deposit reference
            <input
              value={depositReference}
              onChange={(event) => setDepositReference(event.target.value)}
            />
          </label>
          <label>
            Notes
            <textarea value={bidderNotes} onChange={(event) => setBidderNotes(event.target.value)} />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              required
            />
            <span>
              I accept the <a href="/bidder-terms/">bidder terms</a> for this auction.
            </span>
          </label>
          <button type="submit" disabled={isSubmitting}>
            <Check size={17} />
            {isSubmitting ? "Submitting" : "Submit registration"}
          </button>
          {status ? <p className="form-status success">{status}</p> : null}
          {error ? <p className="form-status">{error}</p> : null}
        </form>
      ) : (
        <div className="empty-state panel-empty">
          <strong>No auction registration</strong>
          <span>Registration opens when an auction is active.</span>
        </div>
      )}
    </aside>
  );
}

export function FarmAuctionApp() {
  const [status, setStatus] = useState<Array<ListingStatus | "All">>(["All"]);
  const [region, setRegion] = useState("All");
  const [propertyType, setPropertyType] = useState("All");
  const [minAcres, setMinAcres] = useState("");
  const [minSoilRating, setMinSoilRating] = useState("");
  const [maxPricePerAcre, setMaxPricePerAcre] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [backendListings, setBackendListings] = useState<Listing[]>([]);
  const [isListingsLoading, setIsListingsLoading] = useState(true);
  const [listingError, setListingError] = useState("");
  const [liveAuction, setLiveAuction] = useState<ApiAuction | null>(null);
  const [isAuctionLoading, setIsAuctionLoading] = useState(true);
  const [liveBids, setLiveBids] = useState<DisplayBid[]>([]);
  const [bidderEmail, setBidderEmail] = useState("");
  const [contactStatus, setContactStatus] = useState("");
  const [contactError, setContactError] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState("");
  const [newsletterError, setNewsletterError] = useState("");

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
    let source: EventSource | undefined;
    let cancelled = false;

    async function loadAuction() {
      setIsAuctionLoading(true);
      try {
        const auctionsResponse = await fetch("/api/auctions");
        if (!auctionsResponse.ok) throw new Error("No auctions");
        const auctionsPayload = (await auctionsResponse.json()) as { auctions: ApiAuction[] };
        const auction = auctionsPayload.auctions[0];
        if (!auction || cancelled) {
          setLiveAuction(null);
          setLiveBids([]);
          return;
        }

        const detailResponse = await fetch(`/api/auctions/${auction.id}`);
        if (!detailResponse.ok) throw new Error("Auction detail failed");
        const detail = (await detailResponse.json()) as {
          auction: ApiAuction;
          bidHistory: ApiBid[];
        };

        if (cancelled) return;
        setLiveAuction(detail.auction);
        setLiveBids(detail.bidHistory.filter((bid) => bid.accepted).map(mapApiBid));

        source = new EventSource(`/api/auctions/${auction.id}/events`);
        source.addEventListener("bid.accepted", (event) => {
          const payload = JSON.parse(event.data) as BidAcceptedPayload;
          handleBidAccepted(payload);
        });
      } catch {
        setLiveAuction(null);
        setLiveBids([]);
      } finally {
        if (!cancelled) setIsAuctionLoading(false);
      }
    }

    loadAuction();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  function handleBidAccepted(payload: BidAcceptedPayload) {
    setLiveAuction(payload.auction);
    setLiveBids((current) => {
      if (current.some((bid) => bid.id === payload.bid.id)) return current;
      return [mapApiBid(payload.bid), ...current].slice(0, 6);
    });
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setContactStatus("");
    setContactError("");

    try {
      const response = await fetch("/api/contact-inquiries", {
        body: JSON.stringify({
          email: data.get("email"),
          fileType: data.get("fileType"),
          message: data.get("message"),
          name: data.get("name"),
          phone: data.get("phone"),
          consentNewsletter: data.get("consentNewsletter") === "on"
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      if (!response.ok) throw new Error("Contact inquiry failed");
      form.reset();
      setContactStatus("Inquiry sent.");
    } catch {
      setContactError("Inquiry service is offline. Email cameron@wyattrealty.ca.");
    }
  }

  async function submitNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewsletterStatus("");
    setNewsletterError("");

    try {
      const response = await fetch("/api/newsletter-signups", {
        body: JSON.stringify({
          email: newsletterEmail.trim(),
          source: "website"
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      if (!response.ok) throw new Error("Newsletter signup failed");
      setNewsletterEmail("");
      setNewsletterStatus("Subscribed.");
    } catch {
      setNewsletterError("Signup is unavailable.");
    }
  }

  const filteredListings = backendListings.filter((listing) => {
    const statusMatch = status.includes("All") || status.includes(listing.status);
    const regionMatch = region === "All" || region === listing.region;
    const typeMatch = propertyType === "All" || listing.type === propertyType;
    const acresMatch = !minAcres || listing.acres >= Number(minAcres);
    const soilMatch = !minSoilRating || listing.soilRating >= Number(minSoilRating);
    const priceMatch = !maxPricePerAcre || listing.pricePerAcre <= Number(maxPricePerAcre);
    return statusMatch && regionMatch && typeMatch && acresMatch && soilMatch && priceMatch;
  });

  const regionOptions = useMemo(
    () => ["All", ...Array.from(new Set(backendListings.map((listing) => listing.region))).sort()],
    [backendListings]
  );
  const typeOptions = useMemo(
    () => ["All", ...Array.from(new Set(backendListings.map((listing) => listing.type))).sort()],
    [backendListings]
  );
  const publicMetrics = useMemo(
    () => [
      {
        label: "Published listings",
        value: number.format(backendListings.length),
        icon: Landmark
      },
      {
        label: "Listed acres",
        value: number.format(Math.round(backendListings.reduce((sum, listing) => sum + listing.acres, 0))),
        icon: Sprout
      },
      {
        label: "Active auction",
        value: liveAuction ? "1" : "0",
        icon: Gavel
      },
      {
        label: "Current high bid",
        value: liveAuction && liveAuction.currentHighBidDollars > 0
          ? cad.format(liveAuction.currentHighBidDollars)
          : "None",
        icon: Clock3
      }
    ],
    [backendListings, liveAuction]
  );

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
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Wyatt Farmland Auctions home">
          <span className="brand-mark">
            <Landmark size={19} />
          </span>
          <span>
            <strong>Wyatt</strong>
            <small>Farmland Auctions</small>
          </span>
        </a>
        <nav className={mobileNav ? "nav-links open" : "nav-links"}>
          <a href="#listings">Listings</a>
          <a href="#auction">Auction</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="header-actions">
          <a className="ghost-button" href="mailto:cameron@wyattrealty.ca?subject=Farmland auction inquiry">
            <Mail size={17} />
            Inquire
          </a>
          <button
            className="icon-button nav-toggle"
            title="Menu"
            aria-label="Toggle navigation"
            onClick={() => setMobileNav((value) => !value)}
          >
            {mobileNav ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </header>

      <section className="hero-shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Saskatchewan REALTOR | Wyatt Realty Group</p>
          <h1>Wyatt Farmland Auctions</h1>
          <p>Saskatchewan farmland listings and auctions managed by Wyatt Realty Group.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#auction">
              <Gavel size={18} />
              Open Auction
            </a>
            <a className="secondary-button" href="#listings">
              <Search size={18} />
              Search Land
            </a>
          </div>
        </div>
        <div className="hero-console" aria-label="Auction operations snapshot">
          <div className="hero-photo">
            <img src="/images/hero-fields.jpg" alt="Prairie farmland rows at sunset" />
          </div>
          <div className="signal-strip">
            {publicMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label}>
                  <Icon size={18} />
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="content-band" id="listings">
        <div className="section-head">
          <div>
            <p className="eyebrow">Listings</p>
            <h2>Saskatchewan farmland inventory</h2>
          </div>
          <form className="newsletter-form" onSubmit={submitNewsletter}>
            <input
              type="email"
              value={newsletterEmail}
              onChange={(event) => setNewsletterEmail(event.target.value)}
              autoComplete="email"
              placeholder="Email for market alerts"
              required
            />
            <button type="submit">
              <Bell size={17} />
              Subscribe
            </button>
            {newsletterStatus ? <span>{newsletterStatus}</span> : null}
            {newsletterError ? <span className="error-text">{newsletterError}</span> : null}
          </form>
        </div>
        <div className="tool-row" aria-label="Listing filters">
          <div className="filter-group">
            <span>
              <Filter size={15} />
              Status
            </span>
            {statuses.map((item) => (
              <button
                className={status.includes(item) ? "chip active" : "chip"}
                key={item}
                onClick={() => toggleStatus(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="select-filter">
            Region
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {regionOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="select-filter">
            Type
            <select value={propertyType} onChange={(event) => setPropertyType(event.target.value)}>
              {typeOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="range-filter">
            Min acres
            <input
              inputMode="numeric"
              value={minAcres}
              onChange={(event) => setMinAcres(event.target.value)}
            />
          </label>
          <label className="range-filter">
            Min soil
            <input
              inputMode="numeric"
              value={minSoilRating}
              onChange={(event) => setMinSoilRating(event.target.value)}
            />
          </label>
          <label className="range-filter">
            Max $/acre
            <input
              inputMode="numeric"
              value={maxPricePerAcre}
              onChange={(event) => setMaxPricePerAcre(event.target.value)}
            />
          </label>
        </div>
        <div className="listing-layout">
          <div className="listing-grid">
            {filteredListings.length ? (
              filteredListings.map((listing) => <ListingCard listing={listing} key={listing.id} />)
            ) : (
              <div className="empty-state listing-empty">
                <strong>{isListingsLoading ? "Loading listings" : "No listings"}</strong>
                <span>{listingError || "No published listings match the current filters."}</span>
              </div>
            )}
          </div>
          <RmMap listings={filteredListings} />
        </div>
      </section>

      <section className="auction-band" id="auction">
        <AuctionPanel
          auction={liveAuction}
          bids={liveBids}
          bidderEmail={bidderEmail}
          isLoading={isAuctionLoading}
          onBidderEmailChange={setBidderEmail}
          onBidAccepted={handleBidAccepted}
        />
        <BidderRegistration
          auction={liveAuction}
          bidderEmail={bidderEmail}
          onBidderEmailChange={setBidderEmail}
        />
      </section>

      <section className="contact-band" id="contact">
        <div className="contact-copy">
          <p className="eyebrow">Cameron Wyatt</p>
          <h2>Bring a farmland file to market</h2>
          <p>Sale, lease, wanted, and auction files for Saskatchewan farmland.</p>
        </div>
        <form
          className="contact-form"
          onSubmit={submitContact}
        >
          <label>
            Name
            <input name="name" autoComplete="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Phone
            <input name="phone" autoComplete="tel" />
          </label>
          <label>
            File type
            <select name="fileType" defaultValue="Auction">
              <option>Auction</option>
              <option>For Sale</option>
              <option>Lease</option>
              <option>Wanted</option>
            </select>
          </label>
          <label className="full-field">
            Message
            <textarea name="message" />
          </label>
          <label className="check-row full-field">
            <input name="consentNewsletter" type="checkbox" />
            <span>Send market alerts to this email.</span>
          </label>
          <button type="submit">
            <MessageSquare size={18} />
            Send Inquiry
            <ChevronRight size={17} />
          </button>
          {contactStatus ? <p className="form-status success">{contactStatus}</p> : null}
          {contactError ? <p className="form-status">{contactError}</p> : null}
        </form>
      </section>

      <footer>
        <span>Wyatt Farmland Auctions</span>
        <div className="footer-links">
          <a href="/bidder-terms/">Bidder terms</a>
          <a href="mailto:cameron@wyattrealty.ca">
            Contact
            <ArrowUpRight size={15} />
          </a>
        </div>
      </footer>
    </main>
  );
}
