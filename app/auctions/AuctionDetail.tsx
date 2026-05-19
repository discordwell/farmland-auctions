"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { useAuth, type AuthUser } from "../lib/useAuth";
import type { ApiAuction } from "./AuctionCatalog";
import { Countdown } from "./Countdown";

type ApiBid = {
  id: string;
  bidderAlias: string;
  amountDollars: number;
  accepted: boolean;
  createdAt: string;
};

type DisplayBid = {
  id?: string;
  bidder: string;
  amount: number;
  time: string;
};

type BidAcceptedPayload = {
  accepted: boolean;
  bid: ApiBid;
  auction: ApiAuction;
};

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

function cleanTitle(raw: string) {
  return raw.replace(/^DEMO\s*·\s*/i, "");
}

export function AuctionDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const [auction, setAuction] = useState<ApiAuction | null>(null);
  const [bids, setBids] = useState<DisplayBid[]>([]);
  const [bidderEmail, setBidderEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showApply, setShowApply] = useState(false);
  const applyRef = useRef<HTMLDivElement | null>(null);

  function revealApply() {
    setShowApply(true);
    // Scroll into view next paint so the user sees the form.
    setTimeout(() => {
      applyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  useEffect(() => {
    if (user?.email && !bidderEmail) {
      setBidderEmail(user.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  useEffect(() => {
    let source: EventSource | undefined;
    let cancelled = false;

    async function loadDetail() {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`/api/auctions/${encodeURIComponent(id)}`);
        if (!response.ok) {
          if (response.status === 404) throw new Error("Auction not found");
          throw new Error("Could not load this auction");
        }
        const payload = (await response.json()) as {
          auction: ApiAuction;
          bidHistory: ApiBid[];
        };
        if (cancelled) return;
        setAuction(payload.auction);
        setBids(payload.bidHistory.filter((bid) => bid.accepted).map(mapApiBid));

        source = new EventSource(`/api/auctions/${encodeURIComponent(id)}/events`);
        source.addEventListener("bid.accepted", (event) => {
          const data = JSON.parse(event.data) as BidAcceptedPayload;
          setAuction(data.auction);
          setBids((current) => {
            if (current.some((bid) => bid.id === data.bid.id)) return current;
            return [mapApiBid(data.bid), ...current].slice(0, 25);
          });
        });
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Could not load this auction");
        setAuction(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, [id]);

  if (isLoading) {
    return (
      <main className="hub">
        <header className="hub-bar">
          <a className="hub-back" href="/">
            ← Wyatt Farmland Auctions
          </a>
        </header>
        <div className="hub-loading">Loading auction…</div>
      </main>
    );
  }

  if (loadError || !auction) {
    return (
      <main className="hub">
        <header className="hub-bar">
          <a className="hub-back" href="/">
            ← Wyatt Farmland Auctions
          </a>
        </header>
        <div className="hub-empty">
          <p>{loadError || "Auction not available."}</p>
          <a className="btn btn-ghost btn-sm" href="/auctions/">
            See open auctions <span className="arrow">→</span>
          </a>
        </div>
      </main>
    );
  }

  const title = cleanTitle(auction.title);
  const isDemo = /^DEMO\s*·/i.test(auction.title);
  const isOpen = auction.status === "open";
  const currentHigh = Math.max(auction.currentHighBidDollars, bids[0]?.amount ?? 0);
  const increment = auction.bidIncrementCents / 100;
  const minNext = currentHigh + increment;
  const bellTime = new Date(auction.closesAt).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  return (
    <main className="auction-page">
      <header className="hub-bar">
        <a className="hub-back" href="/">
          ← Wyatt Farmland Auctions
        </a>
        <div className="hub-bar-actions">
          <a className="hub-switch" href="/auctions/">
            All auctions →
          </a>
        </div>
      </header>

      <section className="auction-hero">
        {auction.listing?.image ? (
          <div className="auction-hero-media">
            <img src={auction.listing.image} alt={title} />
            {isDemo ? <span className="auction-hero-demo">Demo · resets every 6h</span> : null}
          </div>
        ) : null}
        <div className="auction-hero-meta">
          <p className="eyebrow">{auction.listing?.rm ?? "Saskatchewan farmland"}</p>
          <h1>
            {title.split(" ").slice(0, -1).join(" ")}{" "}
            <em>{title.split(" ").slice(-1)[0]}</em>
          </h1>
          <p className="hero-line">
            Bell at {bellTime} CST · Increment {cad.format(increment)}
          </p>
          <Countdown closesAt={auction.closesAt} />
        </div>
      </section>

      <article className="auction" aria-labelledby="auction-h">
        <header className="auction-top">
          <div>
            <span className="live">
              {auction.status.toUpperCase()} · Bell at {bellTime} CST
            </span>
            <h2 id="auction-h">{title}</h2>
            <div className="legal">Approved bidders only</div>
          </div>
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

            <BidForm
              auction={auction}
              bids={bids}
              bidderEmail={bidderEmail}
              hideEmailField={Boolean(user)}
              onBidderEmailChange={setBidderEmail}
              onBidAccepted={(payload) => {
                setAuction(payload.auction);
                setBids((current) => {
                  if (current.some((bid) => bid.id === payload.bid.id)) return current;
                  return [mapApiBid(payload.bid), ...current].slice(0, 25);
                });
              }}
              onAuthFailure={revealApply}
            />
            <p className="auction-hint">
              Minimum next bid: <strong>{cad.format(minNext)}</strong>.
            </p>
          </div>

          <div className="ledger">
            <header className="ledger-head">
              <div className="ttl">
                <span className="pip">§</span>&nbsp; Bid ledger · accepted &amp; recorded
              </div>
              <div className="count">
                {bids.length} {bids.length === 1 ? "bid" : "bids"}
              </div>
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

      {showApply ? (
        <div ref={applyRef}>
          <BidderRegistration
            auction={auction}
            user={user}
            bidderEmail={bidderEmail}
            onBidderEmailChange={setBidderEmail}
            onDismiss={() => setShowApply(false)}
          />
        </div>
      ) : null}
    </main>
  );
}

function BidForm({
  auction,
  bids,
  bidderEmail,
  hideEmailField,
  onBidderEmailChange,
  onBidAccepted,
  onAuthFailure
}: {
  auction: ApiAuction;
  bids: DisplayBid[];
  bidderEmail: string;
  hideEmailField: boolean;
  onBidderEmailChange: (email: string) => void;
  onBidAccepted: (payload: BidAcceptedPayload) => void;
  onAuthFailure: () => void;
}) {
  const [bidAmount, setBidAmount] = useState(0);
  const [bidError, setBidError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const increment = auction.bidIncrementCents / 100;
    const currentHigh = Math.max(auction.currentHighBidDollars, bids[0]?.amount ?? 0);
    setBidAmount(currentHigh + increment);
  }, [auction.bidIncrementCents, auction.currentHighBidDollars, bids]);

  async function submitBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBidError("");

    if (auction.status !== "open") {
      setBidError("Auction is not open");
      return;
    }
    if (!bidderEmail.trim()) {
      onAuthFailure();
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
        const reason = payload.reason ?? "Bid was not accepted";
        setBidError(reason);
        if (payload.minimumBidCents) setBidAmount(payload.minimumBidCents / 100);
        // Auth-shaped failures (401/403/404) or "not approved / not found" → reveal apply form.
        const reasonLower = reason.toLowerCase();
        const looksLikeAuth =
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404 ||
          /approve|authoriz|profile|not found|register|bidder/.test(reasonLower);
        if (looksLikeAuth) onAuthFailure();
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

  const increment = auction.bidIncrementCents / 100;
  const isOpen = auction.status === "open";

  return (
    <form className="bid-form" onSubmit={submitBid}>
      {hideEmailField ? null : (
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
      )}
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
      {bidError ? <p className="form-status">{bidError}</p> : null}
    </form>
  );
}

function BidderRegistration({
  auction,
  user,
  bidderEmail,
  onBidderEmailChange,
  onDismiss
}: {
  auction: ApiAuction;
  user: AuthUser | null;
  bidderEmail: string;
  onBidderEmailChange: (email: string) => void;
  onDismiss: () => void;
}) {
  const nextPath = `/auctions/?id=${auction.id}`;
  const [legalName, setLegalName] = useState(user?.displayName ?? "");
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

  return (
    <aside className="register apply-panel">
      <header className="register-head">
        <div className="apply-head-row">
          <div>
            <span className="pre">Apply to bid</span>
            <h3>You&apos;re not approved for this lot yet.</h3>
          </div>
          <button type="button" className="apply-dismiss" onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>
        {user ? (
          <p className="note">
            Submit identity &amp; proof of funds. Approval is at Wyatt Realty Group&apos;s sole
            discretion — usually same-day.
          </p>
        ) : (
          <div className="apply-anon-callout">
            <p>
              <a href={`/login/?next=${encodeURIComponent(nextPath)}`}>Sign in</a> or{" "}
              <a href={`/signup/?next=${encodeURIComponent(nextPath)}`}>create an account</a>{" "}
              to apply faster — or fill out the form below as a guest.
            </p>
          </div>
        )}
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
            <select
              id="reg-entity"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
            >
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
          {isSubmitting ? "Submitting" : "Submit for approval"}{" "}
          <span className="arrow">→</span>
        </button>
        {status ? <p className="form-status success">{status}</p> : null}
        {error ? <p className="form-status">{error}</p> : null}
      </form>
    </aside>
  );
}
