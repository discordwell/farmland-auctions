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
  LayoutDashboard,
  Mail,
  Map,
  MapPinned,
  Menu,
  MessageSquare,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  UserRoundCheck,
  X
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { bidHistory, listings, metrics, workflow, type Listing, type ListingStatus } from "../data";

const statuses: Array<ListingStatus | "All"> = [
  "All",
  "For Sale",
  "Pending",
  "Sold",
  "Wanted",
  "Lease"
];

const regions = ["All", "West Central", "Parkland", "South East", "North East"];

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

function statusClass(status: ListingStatus) {
  return `status status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <article className="listing-card">
      <div className="listing-media">
        <img src={listing.image} alt={`${listing.title} property view`} />
        <div className="media-tabs" aria-label="Listing media">
          <button title="Photos" aria-label="Photos">
            <ImageIcon size={16} />
          </button>
          <button title="Satellite" aria-label="Satellite">
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
  const [seconds, setSeconds] = useState(422);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (closesAt) {
        setSeconds(Math.max(0, Math.floor((new Date(closesAt).getTime() - Date.now()) / 1000)));
        return;
      }
      setSeconds((value) => (value <= 1 ? 422 : value - 1));
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
  onBidAccepted
}: {
  auction: ApiAuction | null;
  bids: DisplayBid[];
  onBidAccepted: (payload: BidAcceptedPayload) => void;
}) {
  const [bidAmount, setBidAmount] = useState(2310000);
  const [bidError, setBidError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const increment = (auction?.bidIncrementCents ?? 2500000) / 100;
    const currentHigh = auction?.currentHighBidDollars ?? bids[0]?.amount ?? 2285000;
    setBidAmount(currentHigh + increment);
  }, [auction?.bidIncrementCents, auction?.currentHighBidDollars, bids]);

  async function submitBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBidError("");

    const increment = (auction?.bidIncrementCents ?? 2500000) / 100;
    const safeBid = Math.max(bidAmount, (bids[0]?.amount ?? 0) + increment);

    if (!auction) {
      onBidAccepted({
        accepted: true,
        auction: {
          id: "local",
          title: "RM 271 Grain Quarter Package",
          status: "open",
          closesAt: "",
          bidIncrementCents: 2500000,
          reserveMet: true,
          currentHighBidCents: safeBid * 100,
          currentHighBidDollars: safeBid
        },
        bid: {
          id: crypto.randomUUID(),
          bidderAlias: "Bidder 204",
          amountDollars: safeBid,
          accepted: true,
          createdAt: new Date().toISOString()
        }
      });
      setBidAmount(safeBid + increment);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auctions/${auction.id}/bids`, {
        body: JSON.stringify({
          amountCents: Math.round(safeBid * 100),
          bidderEmail: "bidder204@example.com",
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

  return (
    <section className="auction-panel" aria-labelledby="auction-title">
      <div className="panel-head">
        <div>
          <p className="eyebrow live-dot">Live auction</p>
          <h2 id="auction-title">{auction?.title ?? "RM 271 Grain Quarter Package"}</h2>
        </div>
        <Countdown closesAt={auction?.closesAt} />
      </div>
      <div className="auction-grid">
        <div className="bid-now">
          <span className="label">Current high bid</span>
          <strong>{cad.format(auction?.currentHighBidDollars ?? bids[0].amount)}</strong>
          <div className="reserve-row">
            <Check size={16} />
            <span>{auction?.reserveMet === false ? "Reserve pending" : "Reserve met"}</span>
          </div>
          <form onSubmit={submitBid}>
            <label htmlFor="bidAmount">Bid command</label>
            <div className="bid-command">
              <input
                id="bidAmount"
                inputMode="numeric"
                value={bidAmount}
                onChange={(event) => setBidAmount(Number(event.target.value))}
              />
              <button type="submit" disabled={isSubmitting}>
                <Gavel size={17} />
                {isSubmitting ? "Sending" : "Submit"}
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
          {bids.map((bid, index) => (
            <div className="ledger-row" key={`${bid.bidder}-${bid.time}-${index}`}>
              <span>{bid.bidder}</span>
              <strong>{cad.format(bid.amount)}</strong>
              <time>{bid.time}</time>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RmMap() {
  const pins = [
    { label: "Coteau", top: "42%", left: "31%", status: "For Sale" },
    { label: "Moose Range", top: "26%", left: "62%", status: "Pending" },
    { label: "Lake of the Rivers", top: "70%", left: "48%", status: "Lease" },
    { label: "Wanted", top: "58%", left: "74%", status: "Wanted" }
  ];

  return (
    <section className="map-panel" aria-labelledby="map-title">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">RM map</p>
          <h2 id="map-title">Regional demand and active inventory</h2>
        </div>
        <button className="icon-button" title="Open map tools" aria-label="Open map tools">
          <SlidersHorizontal size={18} />
        </button>
      </div>
      <div className="map-surface">
        {pins.map((pin) => (
          <button
            className={`map-pin pin-${pin.status.toLowerCase().replaceAll(" ", "-")}`}
            key={pin.label}
            style={{ top: pin.top, left: pin.left }}
            title={`${pin.label}: ${pin.status}`}
            aria-label={`${pin.label}: ${pin.status}`}
          >
            <MapPinned size={15} />
            <span>{pin.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function FarmAuctionApp() {
  const [status, setStatus] = useState<Array<ListingStatus | "All">>(["All"]);
  const [region, setRegion] = useState("All");
  const [mobileNav, setMobileNav] = useState(false);
  const [backendListings, setBackendListings] = useState<Listing[]>(listings);
  const [liveAuction, setLiveAuction] = useState<ApiAuction | null>(null);
  const [liveBids, setLiveBids] = useState<DisplayBid[]>(bidHistory);

  useEffect(() => {
    fetch("/api/listings")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: { listings: Listing[] }) => setBackendListings(payload.listings))
      .catch(() => setBackendListings(listings));
  }, []);

  useEffect(() => {
    let source: EventSource | undefined;
    let cancelled = false;

    async function loadAuction() {
      try {
        const auctionsResponse = await fetch("/api/auctions");
        if (!auctionsResponse.ok) throw new Error("No auctions");
        const auctionsPayload = (await auctionsResponse.json()) as { auctions: ApiAuction[] };
        const auction = auctionsPayload.auctions[0];
        if (!auction || cancelled) return;

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
        setLiveBids(bidHistory);
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

    try {
      await fetch("/api/contact-inquiries", {
        body: JSON.stringify({
          email: data.get("email"),
          fileType: data.get("fileType"),
          message: "",
          name: data.get("name")
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      form.reset();
    } catch {
      window.location.href = "mailto:cameron@wyattrealty.ca?subject=Farmland auction inquiry";
    }
  }

  const filteredListings = backendListings.filter((listing) => {
    const statusMatch = status.includes("All") || status.includes(listing.status);
    const regionMatch = region === "All" || region === listing.region;
    return statusMatch && regionMatch;
  });

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
          <a href="#workflow">Admin</a>
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
          <p>
            Listings, qualified bidder intake, live auction rooms, reserve controls,
            sealed bid files, and broker-ready closing workflows for Saskatchewan land.
          </p>
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
            {metrics.map((metric) => {
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
            <p className="eyebrow">Listings engine</p>
            <h2>Saskatchewan farmland inventory</h2>
          </div>
          <button className="ghost-button">
            <Bell size={17} />
            Market alerts
          </button>
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
              {regions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="listing-layout">
          <div className="listing-grid">
            {filteredListings.map((listing) => (
              <ListingCard listing={listing} key={listing.id} />
            ))}
          </div>
          <RmMap />
        </div>
      </section>

      <section className="auction-band" id="auction">
        <AuctionPanel auction={liveAuction} bids={liveBids} onBidAccepted={handleBidAccepted} />
        <aside className="bidder-panel">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Bidder portal</p>
              <h2>Registration queue</h2>
            </div>
            <button className="icon-button" title="Review bidders" aria-label="Review bidders">
              <UserRoundCheck size={18} />
            </button>
          </div>
          <div className="approval-list">
            {[
              ["Prairie Grain Ltd.", "Approved", "Deposit verified"],
              ["Bidder 204", "Review", "Proof of funds uploaded"],
              ["North Ridge Farms", "Approved", "Terms accepted"]
            ].map(([name, state, note]) => (
              <div className="approval-row" key={name}>
                <div>
                  <strong>{name}</strong>
                  <span>{note}</span>
                </div>
                <em>{state}</em>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="workflow-band" id="workflow">
        <div className="section-head">
          <div>
            <p className="eyebrow">Operator console</p>
            <h2>CMS, auction controls, and post-close execution</h2>
          </div>
          <a className="secondary-button" href="#contact">
            <LayoutDashboard size={18} />
            Start file
          </a>
        </div>
        <div className="workflow-grid">
          {workflow.map((step) => {
            const Icon = step.icon;
            return (
              <article className="workflow-card" key={step.title}>
                <div className="workflow-icon">
                  <Icon size={20} />
                </div>
                <div>
                  <span>{step.status}</span>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="trust-band">
        <div>
          <ShieldCheck size={24} />
          <h2>Built around auditability</h2>
        </div>
        <p>
          Append-only bid history, server-time close decisions, reserve event logs,
          broker review gates, and consent records are treated as first-class platform data.
        </p>
      </section>

      <section className="contact-band" id="contact">
        <div className="contact-copy">
          <p className="eyebrow">Cameron Wyatt</p>
          <h2>Bring a farmland file to market</h2>
          <p>
            Wyatt Realty Group and Firesky Resorts Ltd. can run sale, lease, wanted,
            and auction files through one Saskatchewan-focused operating surface.
          </p>
        </div>
        <form
          className="contact-form"
          onSubmit={submitContact}
        >
          <label>
            Name
            <input name="name" autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" />
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
          <button type="submit">
            <MessageSquare size={18} />
            Send Inquiry
            <ChevronRight size={17} />
          </button>
        </form>
      </section>

      <footer>
        <span>Wyatt Farmland Auctions</span>
        <a href="mailto:cameron@wyattrealty.ca">
          Contact
          <ArrowUpRight size={15} />
        </a>
      </footer>
    </main>
  );
}
