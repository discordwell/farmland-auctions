"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { type Listing, type ListingStatus } from "../data";
import { useAuth } from "../lib/useAuth";

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

const EDITION_DATE = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric"
}).format(new Date());

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
  softCloseSeconds?: number;
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
    second: "2-digit",
    hour12: false
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
  const soilGap = Math.max(0, Math.min(100, 100 - listing.soilRating));
  const isWanted = listing.status === "Wanted";

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
            aria-label={watched ? "Remove from watchlist" : "Save to watchlist"}
            title={watched ? "Saved · click to remove" : "Save to watchlist"}
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
          <dt>Final soil</dt>
          <dd>{listing.soilRating}</dd>
        </div>
      </dl>
      <div className="lot-soil">
        <span className="lbl">{listing.type}</span>
        <div className="bar">
          <div className="fill" style={{ right: `${soilGap}%` }}></div>
        </div>
        <span className="val">{listing.soilRating}/100</span>
      </div>
      <div className="lot-foot">
        <span className="type">{listing.region}</span>
        {isWanted ? (
          <a className="view" href="#procurement">
            Submit a file →
          </a>
        ) : listing.slug ? (
          <a className="view" href={`/listings/?slug=${encodeURIComponent(listing.slug)}`}>
            {listing.status === "Sold" ? "Closing record →" : "View file →"}
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

function Countdown({ closesAt }: { closesAt?: string }) {
  const [seconds, setSeconds] = useState(() => secondsUntil(closesAt));

  useEffect(() => {
    setSeconds(secondsUntil(closesAt));
    const id = window.setInterval(() => {
      setSeconds(secondsUntil(closesAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [closesAt]);

  const hrs = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

  return (
    <div className="countdown" aria-label="Time remaining">
      <div className="lbl">Time to bell</div>
      <div className="clock">
        <span>
          {hrs}
          <span className="unit">hr</span>
        </span>
        <span className="sep">:</span>
        <span>
          {mins}
          <span className="unit">min</span>
        </span>
        <span className="sep">:</span>
        <span>
          {secs}
          <span className="unit">sec</span>
        </span>
      </div>
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
        headers: { "content-type": "application/json" },
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
      setBidAmount(
        payload.auction.currentHighBidDollars + payload.auction.bidIncrementCents / 100
      );
    } catch {
      setBidError("Bid service is offline");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!auction) {
    return (
      <article className="auction" aria-labelledby="auction-h">
        <header className="auction-top">
          <div>
            <span className="live" style={{ color: "#b9b08f" }}>
              {isLoading ? "· Loading floor" : "· Floor closed"}
            </span>
            <h2 id="auction-h">{isLoading ? "Checking the bell" : "No live auction"}</h2>
            <div className="legal">Wyatt Realty Group · Regina · Treaty 4</div>
          </div>
        </header>
        <div className="auction-empty">
          <strong>{isLoading ? "Auction file loading" : "Registration is closed"}</strong>
          New farmland auction files appear here when Wyatt Realty Group opens them.
        </div>
      </article>
    );
  }

  const currentHigh = Math.max(auction.currentHighBidDollars, bids[0]?.amount ?? 0);
  const isOpen = auction.status === "open";
  const increment = auction.bidIncrementCents / 100;
  const minNext = currentHigh + increment;

  return (
    <article className="auction" aria-labelledby="auction-h">
      <header className="auction-top">
        <div>
          <span className="live" aria-hidden={!isOpen}>
            {isOpen ? <span className="dot"></span> : null}
            {isOpen ? "Live · " : "· "}
            {auction.status.toUpperCase()} · Bell at {new Date(auction.closesAt).toLocaleTimeString("en-CA", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            })} CST
          </span>
          <h2 id="auction-h">{auction.title}</h2>
          <div className="legal">
            Approved bidders only
            {auction.softCloseSeconds && auction.softCloseSeconds > 0
              ? ` · Soft-close ${auction.softCloseSeconds}s`
              : ""}
          </div>
        </div>
        <Countdown closesAt={auction.closesAt} />
      </header>

      <div className="auction-body">
        <div className="bid-now">
          <div className="row1">
            <div>
              <div className="lbl">Current high bid</div>
              <div className="price figure">
                <span className="cur">CAD</span>
                {currentHigh > 0 ? number.format(currentHigh) : "—"}
                {currentHigh > 0 && bids.length ? (
                  <span className="ppa">
                    bid no. {bids.length} · increment {cad.format(increment)}
                  </span>
                ) : null}
              </div>
            </div>
            {auction.reserveMet ? (
              <div className="stamp">
                Reserve
                <br />
                Met
                <span className="sub">{EDITION_DATE}</span>
              </div>
            ) : (
              <div className="stamp pending">
                Reserve
                <br />
                Pending
                <span className="sub">Bell open</span>
              </div>
            )}
          </div>

          <form className="bid-form" onSubmit={submitBid}>
            <div className="field">
              <label htmlFor="bidderEmail">Approved bidder · email</label>
              <input
                id="bidderEmail"
                type="email"
                autoComplete="email"
                placeholder="bidder@operations.ca"
                value={bidderEmail}
                onChange={(event) => onBidderEmailChange(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="bidAmount">Bid command · increment {cad.format(increment)}</label>
              <div className="bid-input">
                <span className="cur">CAD</span>
                <input
                  id="bidAmount"
                  inputMode="numeric"
                  value={Number.isFinite(bidAmount) ? bidAmount : 0}
                  onChange={(event) => {
                    const parsed = Number(event.target.value.replace(/[^0-9.]/g, ""));
                    setBidAmount(Number.isFinite(parsed) ? parsed : 0);
                  }}
                />
                <button type="submit" disabled={isSubmitting || !isOpen}>
                  {isSubmitting ? "Sending" : isOpen ? "Drop the gavel ▾" : "Closed"}
                </button>
              </div>
            </div>
            <div className="hint">
              Minimum next bid: <strong>{cad.format(minNext)}</strong>.
              {auction.softCloseSeconds && auction.softCloseSeconds > 0 ? (
                <>
                  {" "}Bids in the final {auction.softCloseSeconds} s extend the bell by {auction.softCloseSeconds} s.
                </>
              ) : null}
            </div>
            {bidError ? <p className="form-status">{bidError}</p> : null}
          </form>
        </div>

        <div className="ledger">
          <header className="ledger-head">
            <div className="ttl">
              <span className="pip">§</span>&nbsp; Bid ledger · accepted &amp; recorded
            </div>
            <div className="count">{bids.length} of {bids.length}</div>
          </header>
          {bids.length ? (
            <ul className="ledger-feed">
              {bids.map((bid, idx) => (
                <li
                  className={idx === 0 ? "high" : ""}
                  key={bid.id ?? `${bid.bidder}-${bid.time}-${idx}`}
                >
                  <span className="car">{idx === 0 ? "▶" : "›"}</span>
                  <span className="id">BIDDER {bid.bidder.toUpperCase()}</span>
                  <span className="amt figure">{cad.format(bid.amount)}</span>
                  <span className="time">{bid.time}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ledger-empty">
              <strong>No accepted bids yet</strong>
              Bids appear here as they are recorded.
            </div>
          )}
        </div>
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
  const pins = listings
    .map((listing) => {
      const position = listingPinPosition(listing);
      if (!position) return null;
      return {
        index: lotNumberFor(listing.id),
        label: listing.rm.replace(/^RM\s*/i, "").replace(/\s+No\.\s*\d+/i, (m) => m.trim()),
        status: listing.status,
        ...position
      };
    })
    .filter((pin): pin is { index: number; label: string; left: string; top: string; status: ListingStatus } =>
      Boolean(pin)
    );

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
        <CompassRose />
        {pins.length ? (
          pins.map((pin) => (
            <span
              className={`pin s-${statusSlug(pin.status)}`}
              key={`${pin.label}-${pin.left}-${pin.top}-${pin.index}`}
              style={{ top: pin.top, left: pin.left }}
              title={`${pin.label}: ${pin.status}`}
            >
              <span className="num">{formatLotNumber(pin.index)}</span> {pin.label}
            </span>
          ))
        ) : (
          <div className="map-empty">
            <strong>No mapped files</strong>
            Listings with coordinates appear on the plate.
          </div>
        )}
        <div className="map-title">
          <div>
            <div className="name">
              <em>Open files</em>
            </div>
          </div>
          <div className="bar">
            0 — 250 km
            <div className="line"></div>
          </div>
        </div>
      </div>
      <div className="legend">
        <div className="item">
          <span className="swatch"></span>
          <span>For sale</span>
          <span className="count">{counts["For Sale"]}</span>
        </div>
        <div className="item s-pending">
          <span className="swatch"></span>
          <span>Pending</span>
          <span className="count">{counts.Pending}</span>
        </div>
        <div className="item s-sold">
          <span className="swatch"></span>
          <span>Sold</span>
          <span className="count">{counts.Sold}</span>
        </div>
        <div className="item s-wanted">
          <span className="swatch"></span>
          <span>Wanted</span>
          <span className="count">{counts.Wanted}</span>
        </div>
        <div className="item s-lease">
          <span className="swatch"></span>
          <span>Lease</span>
          <span className="count">{counts.Lease}</span>
        </div>
        <div className="item s-live">
          <span className="swatch"></span>
          <span>Live now</span>
          <span className="count">{counts.Pending > 0 ? 1 : 0}</span>
        </div>
      </div>
    </aside>
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
        headers: { "content-type": "application/json" },
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

  if (!auction) {
    return (
      <aside className="register">
        <header className="register-head">
          <span className="pre">Bidder portal</span>
          <h3>Apply to bid</h3>
        </header>
        <div className="register-empty">
          <strong>No floor open</strong>
          Registration opens with the next auction.
        </div>
      </aside>
    );
  }

  return (
    <aside className="register">
      <header className="register-head">
        <span className="pre">§02·b &nbsp; Bidder portal</span>
        <h3>Apply to bid</h3>
        <p className="note">
          Submit identity &amp; proof of funds at least <strong>24 hours</strong> before the bell. Approval is at Wyatt Realty Group&apos;s sole discretion.
        </p>
      </header>
      <form className="register-form" onSubmit={submitRegistration}>
        <div className="field">
          <label htmlFor="reg-name">Legal name</label>
          <input
            id="reg-name"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            autoComplete="organization"
            placeholder="Grant Olson"
            required
          />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="reg-entity">Entity</label>
            <select id="reg-entity" value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="individual">Individual</option>
              <option value="corporation">Corporation</option>
              <option value="partnership">Partnership</option>
              <option value="trust">Trust</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-phone">Phone</label>
            <input
              id="reg-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              placeholder="306 555 0119"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            value={bidderEmail}
            onChange={(event) => onBidderEmailChange(event.target.value)}
            autoComplete="email"
            placeholder="bidder@operations.ca"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="reg-mail">Mailing address</label>
          <textarea
            id="reg-mail"
            value={mailingAddress}
            onChange={(event) => setMailingAddress(event.target.value)}
            placeholder="Box, RM, Province, Postal Code"
            required
          />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="reg-id">ID document — link</label>
            <input
              id="reg-id"
              value={identityDocumentUrl}
              onChange={(event) => setIdentityDocumentUrl(event.target.value)}
              placeholder="dropbox.com/..."
            />
          </div>
          <div className="field">
            <label htmlFor="reg-funds">Proof of funds — link</label>
            <input
              id="reg-funds"
              value={proofOfFundsUrl}
              onChange={(event) => setProofOfFundsUrl(event.target.value)}
              placeholder="dropbox.com/..."
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="reg-deposit">Deposit reference</label>
          <input
            id="reg-deposit"
            value={depositReference}
            onChange={(event) => setDepositReference(event.target.value)}
            placeholder="Wire ref · trust account"
          />
        </div>
        <div className="field">
          <label htmlFor="reg-notes">Notes</label>
          <textarea
            id="reg-notes"
            value={bidderNotes}
            onChange={(event) => setBidderNotes(event.target.value)}
            placeholder="Anything Wyatt Realty should know."
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            required
          />
          <span>
            I accept the <a href="/bidder-terms/">bidder terms</a> for this floor.
          </span>
        </label>
        <button className="submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting" : "Submit for approval"} <span className="arrow">→</span>
        </button>
        {status ? <p className="form-status success">{status}</p> : null}
        {error ? <p className="form-status">{error}</p> : null}
      </form>
    </aside>
  );
}

export function FarmAuctionApp() {
  const { user, status: authStatus, signOut } = useAuth();
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
      return [mapApiBid(payload.bid), ...current].slice(0, 8);
    });
  }

  useEffect(() => {
    function applyHashFilter() {
      const hash = window.location.hash;
      const match = /status=([^&]+)/i.exec(hash);
      if (!match) return;
      const raw = decodeURIComponent(match[1]);
      const allowed: ListingStatus[] = ["For Sale", "Pending", "Sold", "Wanted", "Lease"];
      const matched = allowed.find((s) => s.toLowerCase() === raw.toLowerCase());
      if (matched) setStatus([matched]);
    }
    applyHashFilter();
    window.addEventListener("hashchange", applyHashFilter);
    return () => window.removeEventListener("hashchange", applyHashFilter);
  }, []);

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
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      if (!response.ok) throw new Error("Newsletter signup failed");
      setNewsletterEmail("");
      setNewsletterStatus("Subscribed. We'll email when something opens.");
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

  const highBidCurrent = Math.max(
    liveAuction?.currentHighBidDollars ?? 0,
    liveBids[0]?.amount ?? 0
  );
  const secsRemaining = secondsUntil(liveAuction?.closesAt);
  const minsRemaining = Math.floor(secsRemaining / 60);

  const featuredListing = useMemo(() => {
    const forSale = backendListings.find((l) => l.status === "For Sale");
    return forSale ?? backendListings[0] ?? null;
  }, [backendListings]);

  async function handleSignOut() {
    await signOut();
    window.location.assign("/");
  }

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
          {liveAuction && liveAuction.status === "open" ? (
            <span className="live-tag">
              <span className="dot"></span>
              Live · {liveAuction.title} · closes in {minsRemaining} min
            </span>
          ) : (
            <span>Saskatchewan farmland · Wyatt Realty Group</span>
          )}
        </div>
        <div className="right">
          {spotPricePerAcre > 0 ? (
            <span>
              Avg $/ac <strong>{number.format(spotPricePerAcre)}</strong>
            </span>
          ) : null}
          {totalAcres > 0 ? (
            <span>
              Acres listed <strong>{number.format(Math.round(totalAcres))}</strong>
            </span>
          ) : null}
        </div>
      </div>

      <header className="mast">
        <div className="mast-inner">
          <a className="wordmark" href="#top" aria-label="Wyatt Farmland Auctions home">
            <span className="mark">W</span>
            <span className="lockup">
              <span className="name">Wyatt</span>
              <span className="sub">Farmland Auctions</span>
            </span>
          </a>
          <nav className={mobileNav ? "navlinks open" : "navlinks"} aria-label="Primary">
            <a href="#inventory">The Inventory</a>
            <a href="#floor" className={liveAuction && liveAuction.status === "open" ? "current" : ""}>
              The Floor
            </a>
            <a href="#procurement">Procurement</a>
            <a href="#almanac">The Almanac</a>
          </nav>
          <div className="mast-actions">
            {authStatus === "loading" ? (
              <span className="auth-chip placeholder" aria-hidden="true">
                <span className="who">·</span>
              </span>
            ) : user ? (
              <span className="auth-chip" aria-label="Account">
                <span className="who" title={user.email}>
                  {user.displayName?.trim() ? user.displayName : user.email}
                </span>
                {user.role === "admin" ? (
                  <a className="auth-link" href="/admin/">
                    Admin console
                  </a>
                ) : null}
                <a className="auth-link" href="/account/">
                  My account
                </a>
                <button
                  className="auth-link auth-signout"
                  type="button"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </span>
            ) : (
              <span className="auth-chip">
                <a className="auth-link" href="/login/">
                  Sign in
                </a>
                <a className="auth-link auth-strong" href="/signup/">
                  Sign up
                </a>
              </span>
            )}
            <a className="btn btn-ghost btn-sm" href="#procurement">
              Bring a file <span className="arrow">→</span>
            </a>
            <a className="btn btn-primary btn-sm" href="#floor">
              Open auction <span className="arrow">→</span>
            </a>
            <button
              className="nav-toggle"
              type="button"
              aria-label="Toggle navigation"
              onClick={() => setMobileNav((value) => !value)}
            >
              {mobileNav ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-text">
          <div className="hero-meta">
            <div className="byline">
              <strong>Cameron Wyatt</strong>
              <span className="trail">Saskatchewan REALTOR®</span>
            </div>
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
            {liveAuction && liveAuction.status === "open" ? (
              <span className="meta">
                Bell · {new Date(liveAuction.closesAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })} CST
              </span>
            ) : null}
          </div>
        </div>
        <div className="hero-photo">
          <img src="/images/hero-fields.jpg" alt="Saskatchewan farmland at sunset" />
          {liveAuction && liveAuction.status === "open" ? (
            <span className="badge">
              <span className="dot"></span>Live · {liveAuction.title}
            </span>
          ) : null}
          {liveAuction || featuredListing ? (
            <div className="caption">
              <div className="kicker">
                {liveAuction
                  ? `Live · ${liveAuction.title}`
                  : `Featured · ${featuredListing!.rm}`}
              </div>
              <div className="title">
                {liveAuction ? (
                  <em>Open ledger.</em>
                ) : (
                  <>
                    {featuredListing!.title.split(" ").slice(0, -1).join(" ")}{" "}
                    <em>{featuredListing!.title.split(" ").slice(-1)[0]}.</em>
                  </>
                )}
              </div>
              <div className="rule"></div>
              <div className="row">
                <div>
                  <div className="lbl">Acres</div>
                  <div className="val">
                    {number.format(
                      liveAuction
                        ? Math.round(totalAcres)
                        : Math.round(featuredListing!.acres)
                    )}
                  </div>
                </div>
                <div>
                  <div className="lbl">{liveAuction ? "Reserve" : "$/ac"}</div>
                  <div className="val">
                    {liveAuction
                      ? liveAuction.reserveMet
                        ? "Met"
                        : "Open"
                      : cad.format(featuredListing!.pricePerAcre)}
                  </div>
                </div>
                <div>
                  <div className="lbl">{liveAuction ? "High bid" : "Status"}</div>
                  <div className="val">
                    {liveAuction
                      ? highBidCurrent > 0
                        ? cad.format(highBidCurrent)
                        : "—"
                      : featuredListing!.status}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="stat-rail" aria-label="Inventory at a glance">
        <div className="cell">
          <div className="lbl">
            Listings <span className="pip">§</span>
          </div>
          <div className="val figure">
            {number.format(backendListings.length)}
            <span className="unit">on book</span>
          </div>
          <div className="foot">{statusCounts["For Sale"] ?? 0} for sale</div>
        </div>
        <div className="cell">
          <div className="lbl">
            Acres <span className="pip">§</span>
          </div>
          <div className="val figure">
            {number.format(Math.round(totalAcres))}
            <span className="unit">ac.</span>
          </div>
          <div className="foot">{rmCount} rural municipalities</div>
        </div>
        <div className="cell">
          <div className="lbl">
            Auctions <span className="pip">§</span>
          </div>
          <div className="val figure">
            {liveAuction && liveAuction.status === "open" ? "1" : "0"}
            <span className="unit">live</span>
          </div>
          <div className={liveAuction && liveAuction.status === "open" ? "foot live" : "foot"}>
            {liveAuction && liveAuction.status === "open"
              ? `● ${minsRemaining} min remaining`
              : "No auction open"}
          </div>
        </div>
        <div className="cell">
          <div className="lbl">
            High bid <span className="pip">§</span>
          </div>
          <div className="val figure">
            {highBidCurrent > 0 ? cad.format(highBidCurrent) : "—"}
          </div>
          <div className={liveAuction?.reserveMet ? "foot up" : "foot"}>
            {liveAuction?.reserveMet ? "▲ Reserve met" : "Reserve pending"}
          </div>
        </div>
      </div>

      <section className="band" id="inventory">
        <div className="sec-head">
          <span className="sign">§01 &nbsp; Inventory</span>
          <h2 className="title">
            Open <em>files.</em>
          </h2>
          <p className="lede">
            Sale, lease, wanted, and pending farmland across Saskatchewan. Filter the docket.
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
            <label className="select-pill">
              <span>Region</span>
              <select value={region} onChange={(event) => setRegion(event.target.value)}>
                {regionOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="select-pill">
              <span>Type</span>
              <select value={propertyType} onChange={(event) => setPropertyType(event.target.value)}>
                {typeOptions.map((item) => (
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
          </div>
          <div className="right">
            Showing&nbsp;
            <strong>
              {filteredListings.length} of {backendListings.length}
            </strong>
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
                <strong>{isListingsLoading ? "Loading the book" : "No matching files"}</strong>
                {listingError || "Adjust the docket filters to see open files."}
              </div>
            )}
          </div>
          <RmMap listings={filteredListings} lotNumberFor={lotNumberFor} />
        </div>
      </section>

      {liveAuction || isAuctionLoading ? (
        <section className="band floor" id="floor">
          <div className="sec-head">
            <span className="sign">§02 &nbsp; The auction floor</span>
            <h2 className="title">
              A reserve, a bell, an <em>open ledger.</em>
            </h2>
            <p className="lede">
              Approved bidders only. Reserve is published before the bell. Every accepted bid is timestamped to the ledger.
            </p>
          </div>
          <div className="floor-grid">
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
          </div>
        </section>
      ) : (
        <section className="floor-quiet" id="floor">
          <span className="sign">§02 &nbsp; Auctions</span>
          <p>
            No auction on the floor. <a href="#procurement">Bring a file →</a>
          </p>
        </section>
      )}

      <section className="band" id="procurement">
        <div className="sec-head">
          <span className="sign">§03 &nbsp; Procurement</span>
          <h2 className="title">
            Bring a file to the <em>floor.</em>
          </h2>
          <p className="lede">
            Sale, lease, wanted, or auction — Cameron Wyatt files Saskatchewan farmland.
          </p>
        </div>
        <div className="procurement">
          <aside className="agent-card">
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
            <h2>
              Tell us what you have, or <em>what you want.</em>
            </h2>
            <p className="lede">
              A quarter to move. A buyer with cash. A multi-section file. Send the brief.
            </p>

            <form className="contact-form" onSubmit={submitContact}>
              <div className="field">
                <label htmlFor="ct-name">Name</label>
                <input id="ct-name" name="name" autoComplete="name" placeholder="Your full name" required />
              </div>
              <div className="field">
                <label htmlFor="ct-phone">Phone</label>
                <input id="ct-phone" name="phone" autoComplete="tel" placeholder="306 555 0119" />
              </div>
              <div className="field full">
                <label htmlFor="ct-email">Email</label>
                <input id="ct-email" name="email" type="email" autoComplete="email" placeholder="you@operations.ca" required />
              </div>
              <div className="field">
                <label htmlFor="ct-type">File type</label>
                <select id="ct-type" name="fileType" defaultValue="Auction">
                  <option>Auction</option>
                  <option>For Sale</option>
                  <option>Lease</option>
                  <option>Wanted</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="ct-rm">RM or county (if known)</label>
                <input id="ct-rm" name="rmHint" placeholder="e.g. RM Lipton No. 217" />
              </div>
              <div className="field full">
                <label htmlFor="ct-msg">What&apos;s the file</label>
                <textarea
                  id="ct-msg"
                  name="message"
                  placeholder="Acres, legal, soil rating, current operator, timing, anything else worth knowing."
                />
              </div>
              <label className="check full">
                <input name="consentNewsletter" type="checkbox" />
                <span>Notify me when new lots open or an auction is called.</span>
              </label>
              <button className="submit full" type="submit">
                Send the brief <span className="arrow">→</span>
              </button>
              {contactStatus ? <p className="form-status success full">{contactStatus}</p> : null}
              {contactError ? <p className="form-status full">{contactError}</p> : null}
            </form>

            <div className="newsletter">
              <div className="copy">
                <strong>Notify me</strong>
                Get an email when a new lot opens or an auction is called. No schedule, no filler.
              </div>
              <form onSubmit={submitNewsletter}>
                <input
                  type="email"
                  placeholder="you@operations.ca"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  required
                />
                <button type="submit">Subscribe →</button>
                {newsletterStatus ? <p className="form-status success">{newsletterStatus}</p> : null}
                {newsletterError ? <p className="form-status">{newsletterError}</p> : null}
              </form>
            </div>
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
            <h4>The book</h4>
            <ul>
              <li>
                <a href="#inventory">Inventory</a>
              </li>
              <li>
                <a href="#floor">Auction floor</a>
              </li>
              <li>
                <a href="#inventory?status=Sold">Closed lots</a>
              </li>
              <li>
                <a href="#inventory?status=Wanted">Wanted files</a>
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
                <a href="#procurement">Bring a file</a>
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

