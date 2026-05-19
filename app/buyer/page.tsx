"use client";

import { FormEvent, useEffect, useState } from "react";

import { SiteHeader } from "../components/SiteHeader";
import { useAuth } from "../lib/useAuth";

type EntityType = "individual" | "corporation" | "partnership" | "trust";

type Bidder = {
  id: string;
  email: string;
  legal_name: string | null;
  phone: string | null;
  entity_type: EntityType | null;
  mailing_address: string | null;
  verification_status: string | null;
};

type Registration = {
  auction_id: string;
  auction_title: string;
  auction_status: string;
  opens_at: string | null;
  closes_at: string | null;
  listing_slug: string | null;
  listing_rm: string | null;
  status: string;
  deposit_status: string | null;
  max_bid_cents: number | null;
};

type BidRow = {
  id: string;
  auction_id: string;
  auction_title: string;
  listing_slug: string | null;
  amount_cents: number;
  accepted: boolean;
  rejection_reason: string | null;
  created_at: string;
};

type WatchlistRow = {
  id: string;
  slug: string;
  title: string;
  rm: string;
  region: string;
  acres: number;
  pricePerAcre: number;
  status: string;
  image: string;
  watchedAt: string;
};

type SummaryPayload = {
  bidder: Bidder | null;
  registrations: Registration[];
  bids: BidRow[];
  watchlist?: WatchlistRow[];
};

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-CA");

const dateTime = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short"
});

const dateOnly = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });

function formatCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  return cad.format(cents / 100);
}

function formatDate(value: string | null | undefined, withTime = true) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return withTime ? dateTime.format(parsed) : dateOnly.format(parsed);
}

function statusSlug(value: string | null | undefined) {
  if (!value) return "pending";
  return value.toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
}

function prettyStatus(value: string | null | undefined) {
  if (!value) return "Pending";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

const entityOptions: Array<{ value: EntityType; label: string }> = [
  { value: "individual", label: "Individual" },
  { value: "corporation", label: "Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust", label: "Trust" }
];

function verificationBlurb(status: string | null | undefined): string {
  switch (status) {
    case "approved":
      return "You're cleared to bid. Auctions you've registered for will let you in at the bell.";
    case "rejected":
      return "Cameron flagged something on your file. Email cameron@wyattrealty.ca to sort it out.";
    case "pending":
    default:
      return "Submit your info below. Cameron reviews each buyer before the first auction.";
  }
}

export default function BuyerPage() {
  const { user, status: authStatus, signOut } = useAuth();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [summaryError, setSummaryError] = useState("");

  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("individual");
  const [mailingAddress, setMailingAddress] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  useEffect(() => {
    document.title = "Buyer · Wyatt Farmland Auctions";
  }, []);

  useEffect(() => {
    if (authStatus === "ready" && user === null) {
      window.location.assign("/login/?next=/buyer/");
    }
  }, [authStatus, user]);

  useEffect(() => {
    if (authStatus !== "ready" || !user) return;
    let cancelled = false;
    setSummaryStatus("loading");
    setSummaryError("");

    fetch("/api/me/summary", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message ?? "Could not load your dashboard");
        }
        return (await response.json()) as SummaryPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        setSummary(payload);
        setSummaryStatus("ready");
        if (payload.bidder) {
          setLegalName(payload.bidder.legal_name ?? "");
          setPhone(payload.bidder.phone ?? "");
          setEntityType((payload.bidder.entity_type ?? "individual") as EntityType);
          setMailingAddress(payload.bidder.mailing_address ?? "");
        } else {
          setLegalName(user.displayName?.trim() ?? "");
        }
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setSummaryError(error.message);
        setSummaryStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user]);

  async function handleSignOut() {
    await signOut();
    window.location.assign("/");
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    setProfileSubmitting(true);
    try {
      const response = await fetch("/api/me/bidder", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legalName: legalName.trim(),
          phone: phone.trim(),
          entityType,
          mailingAddress: mailingAddress.trim()
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? "Could not save your info");
      }
      const payload = (await response.json()) as { bidder: Bidder };
      setSummary((prev) =>
        prev ? { ...prev, bidder: payload.bidder } : { bidder: payload.bidder, registrations: [], bids: [], watchlist: [] }
      );
      setProfileSuccess("Saved. Cameron will see the updated info.");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not save your info");
    } finally {
      setProfileSubmitting(false);
    }
  }

  if (authStatus === "loading" || (authStatus === "ready" && user === null)) {
    return (
      <>
        <SiteHeader user={user} authStatus={authStatus} onSignOut={handleSignOut} />
        <main className="hub">
          <div className="hub-loading">Loading…</div>
        </main>
      </>
    );
  }

  const bidder = summary?.bidder ?? null;
  const registrations = summary?.registrations ?? [];
  const bids = summary?.bids ?? [];
  const watchlist = summary?.watchlist ?? [];
  const acceptedBidCount = bids.filter((bid) => bid.accepted).length;
  const verificationStatus = bidder?.verification_status ?? "pending";

  return (
    <>
      <SiteHeader user={user} authStatus={authStatus} onSignOut={handleSignOut} />
      <main className="hub">
        <section className="hub-head">
          <p className="hub-eyebrow">Buyer</p>
          <h1>
            Hi, <em>{user!.displayName?.trim() || user!.email.split("@")[0]}</em>.
          </h1>
        </section>

        <div className="hub-stats">
          <a className="hub-stat" href="#watchlist">
            <span className="lbl">Saved</span>
            <span className="val">{watchlist.length}</span>
            <span className="foot">{watchlist.length === 1 ? "lot" : "lots"}</span>
          </a>
          <a className="hub-stat" href="#bids">
            <span className="lbl">Bids</span>
            <span className="val">{bids.length}</span>
            <span className="foot">{acceptedBidCount} accepted</span>
          </a>
          <a className="hub-stat" href="#registrations">
            <span className="lbl">Registrations</span>
            <span className="val">{registrations.length}</span>
            <span className="foot">
              {registrations.filter((r) => r.status === "approved").length} approved
            </span>
          </a>
          <a className="hub-stat" href="#buyer-info">
            <span className="lbl">Verification</span>
            <span className="val small">{prettyStatus(verificationStatus)}</span>
            <span className="foot">{bidder?.legal_name || bidder?.email || "Not yet on file"}</span>
          </a>
        </div>

        {summaryStatus === "loading" ? (
          <section className="hub-card">
            <div className="hub-loading">Loading your activity…</div>
          </section>
        ) : null}

        {summaryStatus === "error" ? (
          <section className="hub-card">
            <div className="hub-empty">{summaryError || "Dashboard service is offline."}</div>
          </section>
        ) : null}

        {summaryStatus === "ready" ? (
          <>
            <section className="hub-card" id="buyer-info">
              <header className="hub-card-head">
                <h2>Your buyer info</h2>
                <span className={`lot-status s-${statusSlug(verificationStatus)}`}>
                  <span className="swatch" />
                  {prettyStatus(verificationStatus)}
                </span>
              </header>
              <p className="hub-card-blurb">{verificationBlurb(verificationStatus)}</p>
              <form className="seller-form" onSubmit={submitProfile}>
                <div className="seller-form-grid">
                  <div className="field full">
                    <label htmlFor="buyer-legal-name">Legal name</label>
                    <input
                      id="buyer-legal-name"
                      type="text"
                      value={legalName}
                      onChange={(event) => {
                        setLegalName(event.target.value);
                        if (profileSuccess) setProfileSuccess("");
                      }}
                      placeholder="As it would appear on a land title"
                      required
                      minLength={2}
                      maxLength={200}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="buyer-phone">Phone</label>
                    <input
                      id="buyer-phone"
                      type="tel"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        if (profileSuccess) setProfileSuccess("");
                      }}
                      placeholder="(306) 555-0100"
                      inputMode="tel"
                      maxLength={40}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="buyer-entity">Buying as</label>
                    <select
                      id="buyer-entity"
                      value={entityType}
                      onChange={(event) => {
                        setEntityType(event.target.value as EntityType);
                        if (profileSuccess) setProfileSuccess("");
                      }}
                    >
                      {entityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field full">
                    <label htmlFor="buyer-address">Mailing address</label>
                    <textarea
                      id="buyer-address"
                      value={mailingAddress}
                      onChange={(event) => {
                        setMailingAddress(event.target.value);
                        if (profileSuccess) setProfileSuccess("");
                      }}
                      placeholder="Street, city, province, postal code"
                      rows={3}
                      maxLength={1000}
                    />
                  </div>
                </div>
                <div className="seller-form-foot">
                  <button className="btn btn-primary" type="submit" disabled={profileSubmitting}>
                    {profileSubmitting ? "Saving" : bidder ? "Update info" : "Submit info"}{" "}
                    <span className="arrow">→</span>
                  </button>
                  {profileError ? <p className="form-status">{profileError}</p> : null}
                  {profileSuccess ? <p className="form-status success">{profileSuccess}</p> : null}
                </div>
              </form>
            </section>

            <section className="hub-card" id="watchlist">
              <header className="hub-card-head">
                <h2>Watchlist</h2>
                <a className="hub-card-link" href="/#inventory">
                  Browse all lots →
                </a>
              </header>
              {watchlist.length ? (
                <ul className="watch-grid">
                  {watchlist.map((row) => (
                    <li className="watch-card" key={row.id}>
                      <a
                        href={`/listings/${encodeURIComponent(row.slug)}/`}
                        className="watch-card-link"
                      >
                        <div className="watch-card-media">
                          {row.image ? <img src={row.image} alt={row.title} /> : null}
                          <span className={`lot-status s-${statusSlug(row.status)}`}>
                            <span className="swatch" />
                            {row.status}
                          </span>
                        </div>
                        <div className="watch-card-body">
                          <span className="rm">{row.rm}</span>
                          <strong>{row.title}</strong>
                          <span className="meta">
                            {number.format(row.acres)} ac · {cad.format(row.pricePerAcre)}/ac
                          </span>
                          <span className="meta light">Saved {formatDate(row.watchedAt, false)}</span>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="hub-empty">
                  <p>No saved lots yet.</p>
                  <a className="btn btn-ghost btn-sm" href="/#inventory">
                    Browse the lots <span className="arrow">→</span>
                  </a>
                </div>
              )}
            </section>

            <section className="hub-card" id="bids">
              <header className="hub-card-head">
                <h2>Recent bids</h2>
                <span className="hub-card-count">
                  {bids.length} {bids.length === 1 ? "bid" : "bids"}
                </span>
              </header>
              {bids.length ? (
                <ul className="hub-list">
                  {bids.slice(0, 8).map((bid) => (
                    <li key={bid.id} className="hub-row">
                      <div className="hub-row-main">
                        <strong>
                          {bid.listing_slug ? (
                            <a href={`/listings/${encodeURIComponent(bid.listing_slug)}/`}>
                              {bid.auction_title}
                            </a>
                          ) : (
                            bid.auction_title
                          )}
                        </strong>
                        <span className="hub-row-meta">
                          {formatCents(bid.amount_cents)} · {formatDate(bid.created_at)}
                          {!bid.accepted && bid.rejection_reason
                            ? ` · ${bid.rejection_reason}`
                            : ""}
                        </span>
                      </div>
                      <span
                        className={`lot-status s-${bid.accepted ? "for-sale" : "wanted"}`}
                      >
                        <span className="swatch" />
                        {bid.accepted ? "Accepted" : "Rejected"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="hub-empty">
                  <p>No bids placed yet. The action happens on the auction floor.</p>
                  <a className="btn btn-ghost btn-sm" href="/#floor">
                    Open the auction <span className="arrow">→</span>
                  </a>
                </div>
              )}
            </section>

            <section className="hub-card" id="registrations">
              <header className="hub-card-head">
                <h2>Auction registrations</h2>
                <span className="hub-card-count">
                  {registrations.length}{" "}
                  {registrations.length === 1 ? "registration" : "registrations"}
                </span>
              </header>
              {registrations.length ? (
                <ul className="hub-list">
                  {registrations.map((registration) => (
                    <li key={registration.auction_id} className="hub-row">
                      <div className="hub-row-main">
                        <strong>
                          {registration.listing_slug ? (
                            <a
                              href={`/listings/${encodeURIComponent(registration.listing_slug)}/`}
                            >
                              {registration.auction_title}
                            </a>
                          ) : (
                            registration.auction_title
                          )}
                        </strong>
                        <span className="hub-row-meta">
                          {registration.listing_rm || "RM tba"} · Bell{" "}
                          {prettyStatus(registration.auction_status)} ·{" "}
                          {formatDate(registration.opens_at)} → {formatDate(registration.closes_at)}
                        </span>
                        <span className="hub-row-meta light">
                          Deposit {prettyStatus(registration.deposit_status)} · Max bid{" "}
                          {registration.max_bid_cents
                            ? formatCents(registration.max_bid_cents)
                            : "no cap"}
                        </span>
                      </div>
                      <span className={`lot-status s-${statusSlug(registration.status)}`}>
                        <span className="swatch" />
                        {prettyStatus(registration.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="hub-empty">
                  <p>You haven&apos;t registered for any auction yet.</p>
                  <a className="btn btn-ghost btn-sm" href="/#floor">
                    See current auctions <span className="arrow">→</span>
                  </a>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
