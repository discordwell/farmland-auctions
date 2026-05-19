"use client";

import { useEffect, useState } from "react";

import { useAuth } from "../lib/useAuth";

type Bidder = {
  id: string;
  email: string;
  legal_name: string | null;
  phone: string | null;
  entity_type: string | null;
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

export default function BuyerPage() {
  const { user, status: authStatus, signOut } = useAuth();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [summaryError, setSummaryError] = useState("");

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

  if (authStatus === "loading" || (authStatus === "ready" && user === null)) {
    return (
      <main className="hub">
        <div className="hub-loading">Loading…</div>
      </main>
    );
  }

  const bidder = summary?.bidder ?? null;
  const registrations = summary?.registrations ?? [];
  const bids = summary?.bids ?? [];
  const watchlist = summary?.watchlist ?? [];
  const acceptedBidCount = bids.filter((bid) => bid.accepted).length;

  return (
    <main className="hub">
      <header className="hub-bar">
        <a className="hub-back" href="/">
          ← Wyatt Farmland Auctions
        </a>
        <div className="hub-bar-actions">
          {user!.intent === "both" || user!.intent === "seller" ? (
            <a className="hub-switch" href="/seller/">
              Switch to seller →
            </a>
          ) : null}
          <button className="hub-signout" type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="hub-head">
        <p className="hub-eyebrow">Buyer</p>
        <h1>
          Hi, <em>{user!.displayName?.trim() || user!.email.split("@")[0]}</em>.
        </h1>
        <p className="hub-lede">
          What you&apos;re watching, what you&apos;ve bid on, where you&apos;re approved to bid.
        </p>
      </section>

      <div className="hub-stats">
        <div className="hub-stat">
          <span className="lbl">Saved</span>
          <span className="val">{watchlist.length}</span>
          <span className="foot">{watchlist.length === 1 ? "lot" : "lots"}</span>
        </div>
        <div className="hub-stat">
          <span className="lbl">Bids</span>
          <span className="val">{bids.length}</span>
          <span className="foot">
            {acceptedBidCount} accepted
          </span>
        </div>
        <div className="hub-stat">
          <span className="lbl">Registrations</span>
          <span className="val">{registrations.length}</span>
          <span className="foot">
            {registrations.filter((r) => r.status === "approved").length} approved
          </span>
        </div>
        <div className="hub-stat">
          <span className="lbl">Verification</span>
          <span className="val small">
            {bidder ? prettyStatus(bidder.verification_status) : "—"}
          </span>
          <span className="foot">
            {bidder ? bidder.legal_name || bidder.email : "Not yet on file"}
          </span>
        </div>
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
          <section className="hub-card">
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

          <section className="hub-card">
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

          <section className="hub-card">
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
  );
}
