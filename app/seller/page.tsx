"use client";

import { FormEvent, useEffect, useState } from "react";

import { SiteHeader } from "../components/SiteHeader";
import { useAuth } from "../lib/useAuth";

type SellerListing = {
  id: string;
  slug: string;
  title: string;
  rm: string;
  region: string;
  acres: number;
  pricePerAcre: number;
  status: string;
  description: string;
  publishedAt: string | null;
  createdAt: string;
  auctionRequested: boolean;
  auctionPreferredWindow: string | null;
  reservePricePerAcre: number | null;
};

type SellerInquiry = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  fileType: string;
  message: string;
  createdAt: string;
};

type SellerSummary = {
  listings: SellerListing[];
  inquiries: SellerInquiry[];
};

type ListingIntent = "For Sale" | "Lease" | "Auction";
type MineralRights = "included" | "excluded" | "partial" | "unknown";
type AuctionWindow = "within_two_weeks" | "within_a_month" | "brokers_choice";

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-CA");

const dateOnly = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateOnly.format(parsed);
}

function statusSlug(value: string | null | undefined) {
  if (!value) return "pending";
  return value.toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
}

function listingStateLabel(listing: SellerListing): string {
  if (listing.publishedAt) return "Published";
  if (listing.auctionRequested) return "Auction requested · pending Cameron";
  return "Draft · pending review";
}

const intentOptions: Array<{ value: ListingIntent; label: string; blurb: string }> = [
  { value: "For Sale", label: "Sell", blurb: "Outright sale" },
  { value: "Lease", label: "Lease", blurb: "Rent the land out" },
  { value: "Auction", label: "Auction", blurb: "Cameron schedules the bell" }
];

const mineralRightsOptions: Array<{ value: MineralRights; label: string }> = [
  { value: "included", label: "Included with sale" },
  { value: "excluded", label: "Reserved by seller" },
  { value: "partial", label: "Partial / split" },
  { value: "unknown", label: "Not sure" }
];

const windowOptions: Array<{ value: AuctionWindow; label: string; blurb: string }> = [
  { value: "within_two_weeks", label: "Within 2 weeks", blurb: "Move quickly" },
  { value: "within_a_month", label: "Within a month", blurb: "Standard window" },
  { value: "brokers_choice", label: "Broker's choice", blurb: "Cameron decides" }
];

function targetPriceLabel(intent: ListingIntent): string {
  if (intent === "Lease") return "Target $/ac / year (optional)";
  if (intent === "Auction") return "Proposed reserve $/ac (optional)";
  return "Target $/acre (optional)";
}

function targetPricePlaceholder(intent: ListingIntent): string {
  if (intent === "Lease") return "85";
  if (intent === "Auction") return "3,200";
  return "3,500";
}

export default function SellerPage() {
  const { user, status: authStatus, signOut } = useAuth();
  const [summary, setSummary] = useState<SellerSummary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [summaryError, setSummaryError] = useState("");

  const [title, setTitle] = useState("");
  const [legalDescription, setLegalDescription] = useState("");
  const [rm, setRm] = useState("");
  const [region, setRegion] = useState("");
  const [acres, setAcres] = useState("");
  const [soilRating, setSoilRating] = useState("");
  const [mineralRights, setMineralRights] = useState<MineralRights | "">("");
  const [intent, setIntent] = useState<ListingIntent>("For Sale");
  const [targetPpa, setTargetPpa] = useState("");
  const [auctionWindow, setAuctionWindow] = useState<AuctionWindow>("brokers_choice");
  const [description, setDescription] = useState("");
  const [photoUrlsText, setPhotoUrlsText] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Seller · Wyatt Farmland Auctions";
  }, []);

  useEffect(() => {
    if (authStatus === "ready" && user === null) {
      window.location.assign("/login/?next=/seller/");
    }
  }, [authStatus, user]);

  async function loadSummary() {
    setSummaryStatus("loading");
    setSummaryError("");
    try {
      const response = await fetch("/api/seller/summary", { credentials: "include" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? "Could not load your seller hub");
      }
      const payload = (await response.json()) as SellerSummary;
      setSummary(payload);
      setSummaryStatus("ready");
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Could not load your seller hub");
      setSummaryStatus("error");
    }
  }

  useEffect(() => {
    if (authStatus !== "ready" || !user) return;
    let cancelled = false;
    loadSummary().catch(() => {
      if (!cancelled) {
        setSummaryStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user]);

  async function handleSignOut() {
    await signOut();
    window.location.assign("/");
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    const acresNum = Number(acres);
    if (!Number.isFinite(acresNum) || acresNum <= 0) {
      setFormError("Enter the acreage as a positive number.");
      return;
    }

    const soilNum = soilRating.trim() ? Number(soilRating) : undefined;
    if (soilNum != null && (!Number.isFinite(soilNum) || soilNum < 0 || soilNum > 100)) {
      setFormError("Soil rating should be between 0 and 100.");
      return;
    }

    const photoUrls = photoUrlsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const ppaNum = targetPpa.trim() ? Number(targetPpa) : undefined;
    const reserveOnly = intent === "Auction" ? ppaNum : undefined;
    const standardTarget = intent === "Auction" ? undefined : ppaNum;

    setSubmitting(true);
    try {
      const response = await fetch("/api/seller/listings", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          rm: rm.trim(),
          region: region.trim(),
          legalDescription: legalDescription.trim(),
          acres: acresNum,
          soilRating: soilNum,
          mineralRights: mineralRights || undefined,
          intent,
          targetPricePerAcre: standardTarget,
          auctionPreferredWindow: intent === "Auction" ? auctionWindow : undefined,
          auctionReservePricePerAcre: reserveOnly,
          description: description.trim(),
          photoUrls
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? "Could not submit the listing");
      }
      setFormSuccess(
        intent === "Auction"
          ? "Submitted. Cameron will schedule the auction."
          : "Submitted. Cameron will review and publish it."
      );
      setTitle("");
      setLegalDescription("");
      setRm("");
      setRegion("");
      setAcres("");
      setSoilRating("");
      setMineralRights("");
      setTargetPpa("");
      setAuctionWindow("brokers_choice");
      setDescription("");
      setPhotoUrlsText("");
      setIntent("For Sale");
      await loadSummary();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not submit the listing");
    } finally {
      setSubmitting(false);
    }
  }

  if (authStatus === "loading" || (authStatus === "ready" && user === null)) {
    return (
      <main className="hub">
        <div className="hub-loading">Loading…</div>
      </main>
    );
  }

  const listings = summary?.listings ?? [];
  const inquiries = summary?.inquiries ?? [];
  const publishedCount = listings.filter((l) => l.publishedAt).length;
  const draftCount = listings.length - publishedCount;

  return (
    <>
      <SiteHeader user={user} authStatus={authStatus} onSignOut={handleSignOut} />
      <main className="hub">
        <section className="hub-head">
        <p className="hub-eyebrow">Seller</p>
        <h1>
          Hi, <em>{user!.displayName?.trim() || user!.email.split("@")[0]}</em>.
        </h1>
        <p className="hub-lede">
          List a property, see what you&apos;ve submitted, and review inquiries.
        </p>
      </section>

      <div className="hub-stats">
        <div className="hub-stat">
          <span className="lbl">Listings</span>
          <span className="val">{listings.length}</span>
          <span className="foot">
            {publishedCount} live · {draftCount} draft
          </span>
        </div>
        <div className="hub-stat">
          <span className="lbl">Inquiries</span>
          <span className="val">{inquiries.length}</span>
          <span className="foot">in the last while</span>
        </div>
      </div>

      <section className="hub-card">
        <header className="hub-card-head">
          <h2>List a property</h2>
          <span className="hub-card-count">Cameron reviews drafts before publishing</span>
        </header>

        <form className="seller-form" onSubmit={submitListing}>
          <div className="seller-form-grid">
            <div className="field full">
              <label htmlFor="seller-title">Working title</label>
              <input
                id="seller-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Lipton half-section"
                required
                minLength={3}
                maxLength={160}
              />
            </div>
            <div className="field">
              <label htmlFor="seller-rm">RM</label>
              <input
                id="seller-rm"
                type="text"
                value={rm}
                onChange={(event) => setRm(event.target.value)}
                placeholder="RM Lipton No. 217"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="seller-region">Region</label>
              <input
                id="seller-region"
                type="text"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="Southeast SK"
                required
              />
            </div>
            <div className="field full">
              <label htmlFor="seller-lld">Legal land description (optional)</label>
              <input
                id="seller-lld"
                type="text"
                value={legalDescription}
                onChange={(event) => setLegalDescription(event.target.value)}
                placeholder="e.g. SE 14-22-12 W2"
                maxLength={200}
              />
            </div>
            <div className="field">
              <label htmlFor="seller-acres">Acres</label>
              <input
                id="seller-acres"
                type="number"
                inputMode="decimal"
                value={acres}
                onChange={(event) => setAcres(event.target.value)}
                placeholder="320"
                min={0.1}
                step={0.1}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="seller-soil">Soil rating (optional)</label>
              <input
                id="seller-soil"
                type="number"
                inputMode="numeric"
                value={soilRating}
                onChange={(event) => setSoilRating(event.target.value)}
                placeholder="0–100"
                min={0}
                max={100}
                step={1}
              />
            </div>
            <div className="field">
              <label htmlFor="seller-minerals">Mineral rights (optional)</label>
              <select
                id="seller-minerals"
                value={mineralRights}
                onChange={(event) => setMineralRights(event.target.value as MineralRights | "")}
              >
                <option value="">Not specified</option>
                {mineralRightsOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="seller-ppa">{targetPriceLabel(intent)}</label>
              <input
                id="seller-ppa"
                type="number"
                inputMode="decimal"
                value={targetPpa}
                onChange={(event) => setTargetPpa(event.target.value)}
                placeholder={targetPricePlaceholder(intent)}
                min={0}
              />
            </div>
            <div className="field full">
              <span className="label-text">What are you trying to do?</span>
              <div className="intent-pills" role="radiogroup" aria-label="Listing intent">
                {intentOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={intent === option.value}
                    className={`intent-pill${intent === option.value ? " on" : ""}`}
                    onClick={() => setIntent(option.value)}
                  >
                    <span className="intent-pill-label">{option.label}</span>
                    <span className="intent-pill-blurb">{option.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
            {intent === "Auction" ? (
              <div className="field full">
                <span className="label-text">Preferred auction window</span>
                <div className="intent-pills" role="radiogroup" aria-label="Preferred auction window">
                  {windowOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={auctionWindow === option.value}
                      className={`intent-pill${auctionWindow === option.value ? " on" : ""}`}
                      onClick={() => setAuctionWindow(option.value)}
                    >
                      <span className="intent-pill-label">{option.label}</span>
                      <span className="intent-pill-blurb">{option.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="field full">
              <label htmlFor="seller-desc">Description</label>
              <textarea
                id="seller-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={`Tell buyers about the land. A few paragraphs is fine.\n\nThink about: drainage, frontage, fences, outbuildings, neighbours, timing constraints, the history of the field.`}
                rows={8}
                maxLength={4000}
              />
            </div>
            <div className="field full">
              <label htmlFor="seller-photos">Photo URLs (optional)</label>
              <textarea
                id="seller-photos"
                value={photoUrlsText}
                onChange={(event) => setPhotoUrlsText(event.target.value)}
                placeholder={`https://...\nhttps://...`}
                rows={3}
              />
              <span className="hub-row-meta light">
                One URL per line. Cameron may add pro shots later.
              </span>
            </div>
          </div>
          <div className="seller-form-foot">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Submitting" : "Submit draft"} <span className="arrow">→</span>
            </button>
            {formError ? <p className="form-status">{formError}</p> : null}
            {formSuccess ? <p className="form-status success">{formSuccess}</p> : null}
          </div>
        </form>
      </section>

      {summaryStatus === "loading" ? (
        <section className="hub-card">
          <div className="hub-loading">Loading…</div>
        </section>
      ) : null}

      {summaryStatus === "error" ? (
        <section className="hub-card">
          <div className="hub-empty">{summaryError || "Seller hub is offline."}</div>
        </section>
      ) : null}

      {summaryStatus === "ready" ? (
        <>
          <section className="hub-card">
            <header className="hub-card-head">
              <h2>My listings</h2>
              <span className="hub-card-count">
                {listings.length} {listings.length === 1 ? "submission" : "submissions"}
              </span>
            </header>
            {listings.length ? (
              <ul className="hub-list">
                {listings.map((listing) => (
                  <li key={listing.id} className="hub-row">
                    <div className="hub-row-main">
                      <strong>
                        {listing.publishedAt ? (
                          <a href={`/listings/${encodeURIComponent(listing.slug)}/`}>
                            {listing.title}
                          </a>
                        ) : (
                          listing.title
                        )}
                      </strong>
                      <span className="hub-row-meta">
                        {listing.rm} · {listing.region} ·{" "}
                        {number.format(listing.acres)} ac
                        {listing.pricePerAcre > 0
                          ? ` · ${cad.format(listing.pricePerAcre)}/ac target`
                          : ""}
                      </span>
                      <span className="hub-row-meta light">
                        Submitted {formatDate(listing.createdAt)}
                        {listing.publishedAt
                          ? ` · Published ${formatDate(listing.publishedAt)}`
                          : ""}
                      </span>
                    </div>
                    <span
                      className={`lot-status s-${
                        listing.auctionRequested
                          ? "pending"
                          : statusSlug(listing.status)
                      }`}
                    >
                      <span className="swatch" />
                      {listingStateLabel(listing)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hub-empty">
                <p>You haven&apos;t submitted any listings yet.</p>
              </div>
            )}
          </section>

          <section className="hub-card">
            <header className="hub-card-head">
              <h2>My inquiries</h2>
              <span className="hub-card-count">
                {inquiries.length} {inquiries.length === 1 ? "inquiry" : "inquiries"}
              </span>
            </header>
            {inquiries.length ? (
              <ul className="hub-list">
                {inquiries.map((inquiry) => (
                  <li key={inquiry.id} className="hub-row">
                    <div className="hub-row-main">
                      <strong>{inquiry.fileType}</strong>
                      <span className="hub-row-meta">
                        Sent {formatDate(inquiry.createdAt)}
                        {inquiry.phone ? ` · ${inquiry.phone}` : ""}
                      </span>
                      {inquiry.message ? (
                        <span className="hub-row-meta light hub-row-message">
                          {inquiry.message.slice(0, 240)}
                          {inquiry.message.length > 240 ? "…" : ""}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hub-empty">
                <p>No inquiries on file yet.</p>
                <a className="btn btn-ghost btn-sm" href="/#procurement">
                  Send a brief <span className="arrow">→</span>
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
