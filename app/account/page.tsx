"use client";

import { useEffect, useState } from "react";

import { useAuth } from "../lib/useAuth";

type SummaryUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  displayName: string;
};

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
  auction_type: string;
  opens_at: string | null;
  closes_at: string | null;
  current_high_bid_cents: number | null;
  reserve_price_cents: number | null;
  reserve_visibility: string | null;
  listing_slug: string | null;
  listing_rm: string | null;
  status: string;
  deposit_status: string | null;
  max_bid_cents: number | null;
  terms_accepted_at: string | null;
  deposit_reference: string | null;
  operator_notes: string | null;
  reviewed_at: string | null;
  bidder_notes: string | null;
};

type BidRow = {
  id: string;
  auction_id: string;
  auction_title: string;
  auction_status: string;
  listing_slug: string | null;
  amount_cents: number;
  bid_type: string | null;
  accepted: boolean;
  rejection_reason: string | null;
  created_at: string;
};

type SummaryPayload = {
  user: SummaryUser;
  bidder: Bidder | null;
  registrations: Registration[];
  bids: BidRow[];
};

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const dateTime = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  return cad.format(cents / 100);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTime.format(parsed);
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

function listingHref(registration: Registration) {
  if (registration.listing_slug) {
    return `/listings/?slug=${encodeURIComponent(registration.listing_slug)}`;
  }
  return "/#floor";
}

function bidHref(bid: BidRow) {
  if (bid.listing_slug) {
    return `/listings/?slug=${encodeURIComponent(bid.listing_slug)}`;
  }
  return "/#floor";
}

export default function AccountPage() {
  const { user, status: authStatus, signOut } = useAuth();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    if (authStatus === "ready" && user === null) {
      window.location.assign("/login/?next=/account/");
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
          throw new Error(payload.message ?? "Could not load the dashboard");
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
      <main>
        <div className="edition">
          <div className="left">
            <span>Regina, SK · Treaty 4</span>
          </div>
          <div className="center">
            <span>Bidder dashboard</span>
          </div>
          <div className="right" />
        </div>
        <div className="account-loading">Loading the docket…</div>
      </main>
    );
  }

  const bidder = summary?.bidder ?? null;
  const registrations = summary?.registrations ?? [];
  const bids = summary?.bids ?? [];

  return (
    <main>
      <div className="edition">
        <div className="left">
          <a href="/">← Wyatt Farmland Auctions</a>
        </div>
        <div className="center">
          <span>Bidder dashboard · {user!.email}</span>
        </div>
        <div className="right">
          <a href="/#floor">The Floor</a>
        </div>
      </div>

      <header className="mast">
        <div className="mast-inner">
          <a className="wordmark" href="/" aria-label="Wyatt Farmland Auctions home">
            <span className="mark">W</span>
            <span className="lockup">
              <span className="name">Wyatt</span>
              <span className="sub">Farmland Auctions</span>
            </span>
          </a>
          <nav className="navlinks" aria-label="Primary">
            <a href="/#inventory">Inventory</a>
            <a href="/#floor">Floor</a>
            <a href="/#procurement">Procurement</a>
            <a href="/account/" className="current">
              My file
            </a>
          </nav>
          <div className="mast-actions">
            <a className="btn btn-ghost btn-sm" href="/#floor">
              Auction floor <span className="arrow">→</span>
            </a>
            <button className="btn btn-primary btn-sm" type="button" onClick={handleSignOut}>
              Sign out <span className="arrow">→</span>
            </button>
          </div>
        </div>
      </header>

      <section className="band">
        <div className="sec-head">
          <span className="sign">§02·c &nbsp; Bidder dashboard</span>
          <h2 className="title">
            Your <em>file.</em>
          </h2>
          <p className="lede">
            Registrations, deposits, and every bid you have placed on the floor.
          </p>
        </div>

        <div className="account-id">
          <div className="account-id-meta">
            <span className="pre">Signed in as</span>
            <strong>{user!.displayName || user!.email}</strong>
            <span className="account-id-email">{user!.email}</span>
          </div>
          <div className="account-id-actions">
            <span className={`lot-status s-${user!.role === "admin" ? "for-sale" : "pending"}`}>
              <span className="swatch" />
              {user!.role === "admin" ? "Operator" : "Bidder"}
            </span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleSignOut}>
              Sign out <span className="arrow">→</span>
            </button>
          </div>
        </div>

        {summaryStatus === "loading" ? (
          <div className="account-loading">Loading the docket…</div>
        ) : null}

        {summaryStatus === "error" ? (
          <div className="admin-empty">{summaryError || "Dashboard service is offline."}</div>
        ) : null}

        {summaryStatus === "ready" ? (
          <div className="account-grid">
            <article className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <p className="pre">Bidder profile</p>
                  <h2>
                    Your <em>file of record</em>
                  </h2>
                </div>
                <span className="ornament">
                  {bidder ? prettyStatus(bidder.verification_status) : "Not on file"}
                </span>
              </div>
              {bidder ? (
                <div className="account-profile">
                  <dl className="detail-stats">
                    <div>
                      <dt>Legal name</dt>
                      <dd>{bidder.legal_name || "—"}</dd>
                    </div>
                    <div>
                      <dt>Entity</dt>
                      <dd>{prettyStatus(bidder.entity_type) || "—"}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>{bidder.phone || "—"}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{bidder.email}</dd>
                    </div>
                  </dl>
                  <div className="account-profile-block">
                    <span className="lbl">Mailing address</span>
                    <p>{bidder.mailing_address || "Not on file"}</p>
                  </div>
                  <div className="account-profile-block">
                    <span className="lbl">ID verification</span>
                    <span
                      className={`lot-status s-${statusSlug(bidder.verification_status)}`}
                    >
                      <span className="swatch" />
                      {prettyStatus(bidder.verification_status)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="account-empty">
                  <strong>No bidder profile yet.</strong>
                  <p>
                    Register for an auction on the floor to start your file.
                  </p>
                  <a className="btn btn-ghost btn-sm" href="/#floor">
                    Open the floor <span className="arrow">→</span>
                  </a>
                </div>
              )}
            </article>

            <article className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <p className="pre">Auction registrations</p>
                  <h2>
                    My <em>authorizations</em>
                  </h2>
                </div>
                <span className="ornament">
                  {registrations.length} {registrations.length === 1 ? "file" : "files"}
                </span>
              </div>
              <div className="admin-table">
                {registrations.length ? (
                  registrations.map((registration) => (
                    <div
                      className="admin-row stacked"
                      key={`${registration.auction_id}`}
                    >
                      <div>
                        <strong>
                          <a href={listingHref(registration)}>
                            {registration.auction_title}
                          </a>
                        </strong>
                        <span>
                          {registration.listing_rm || "RM tba"} · Bell{" "}
                          {prettyStatus(registration.auction_status)} ·{" "}
                          {formatDate(registration.opens_at)} → {formatDate(registration.closes_at)}
                        </span>
                        <span>
                          Deposit {prettyStatus(registration.deposit_status)} · Max bid{" "}
                          {registration.max_bid_cents
                            ? formatCents(registration.max_bid_cents)
                            : "no cap"}
                        </span>
                      </div>
                      <div className="account-row-side">
                        <span className={`lot-status s-${statusSlug(registration.status)}`}>
                          <span className="swatch" />
                          {prettyStatus(registration.status)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="admin-empty">No auction registrations on file.</div>
                )}
              </div>
            </article>

            <article className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <p className="pre">Ledger</p>
                  <h2>
                    My <em>bids</em>
                  </h2>
                </div>
                <span className="ornament">
                  {bids.length} {bids.length === 1 ? "bid" : "bids"}
                </span>
              </div>
              <div className="admin-table">
                {bids.length ? (
                  bids.map((bid) => (
                    <div className="admin-row stacked" key={bid.id}>
                      <div>
                        <strong>
                          <a href={bidHref(bid)}>{bid.auction_title}</a>
                        </strong>
                        <span>
                          {cad.format(bid.amount_cents / 100)} ·{" "}
                          {bid.bid_type ? prettyStatus(bid.bid_type) : "Live"} ·{" "}
                          {formatDate(bid.created_at)}
                        </span>
                        {!bid.accepted && bid.rejection_reason ? (
                          <span>Reason · {bid.rejection_reason}</span>
                        ) : null}
                      </div>
                      <div className="account-row-side">
                        <span
                          className={`lot-status s-${bid.accepted ? "for-sale" : "wanted"}`}
                        >
                          <span className="swatch" />
                          {bid.accepted ? "Accepted" : "Rejected"}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="admin-empty">No bids on file.</div>
                )}
              </div>
            </article>
          </div>
        ) : null}
      </section>

      <footer className="colophon">
        <div className="colo-bottom">
          <div>© {new Date().getFullYear()} Wyatt Farmland Auctions · Regina, SK</div>
          <div className="center">
            — <em>Operator-led.</em> —
          </div>
          <div className="right">
            <a href="/">All listings →</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
