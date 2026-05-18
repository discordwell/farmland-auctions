"use client";

import { FormEvent, useEffect, useState } from "react";
import { type Listing } from "../data";

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-CA");

function statusSlug(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export function ListingDetail() {
  const [slug, setSlug] = useState<string>("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [mediaMode, setMediaMode] = useState<"photo" | "satellite">("photo");
  const [inquiryStatus, setInquiryStatus] = useState("");
  const [inquiryError, setInquiryError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("slug") ?? "";
    setSlug(next);
    if (!next) {
      setIsLoading(false);
      setError("No lot specified");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/listings/${encodeURIComponent(next)}`)
      .then(async (response) => {
        if (response.status === 404) throw new Error("Lot not found");
        if (!response.ok) throw new Error("Could not load lot");
        return response.json();
      })
      .then((payload: { listing: Listing }) => {
        if (cancelled) return;
        setListing(payload.listing);
        setError("");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setListing(null);
        setError(err.message);
      })
      .finally(() => !cancelled && setIsLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setInquiryStatus("");
    setInquiryError("");

    try {
      const response = await fetch("/api/contact-inquiries", {
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          fileType: listing.status === "Wanted" ? "Wanted" : "For Sale",
          message: `Inquiry re: ${listing.title} (${listing.rm}) — ${listing.coordinates || "no coords"}\n\n${data.get("message") ?? ""}`,
          consentNewsletter: data.get("consentNewsletter") === "on"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      if (!response.ok) throw new Error("Inquiry failed");
      form.reset();
      setInquiryStatus("Inquiry sent. Cameron will be in touch.");
    } catch {
      setInquiryError("Could not send. Email cameron@wyattrealty.ca.");
    }
  }

  return (
    <main>
      <div className="edition">
        <div className="left">
          <a href="/">← Wyatt Farmland Auctions</a>
        </div>
        <div className="center">
          <span>{listing ? listing.rm : "Lot detail"}</span>
        </div>
        <div className="right">
          <a href="/#inventory">All listings</a>
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
          </nav>
          <div className="mast-actions">
            <a className="btn btn-ghost btn-sm" href="/#inventory">
              ← Back to inventory
            </a>
          </div>
        </div>
      </header>

      <section className="band">
        {isLoading ? (
          <div className="lot-empty">
            <strong>Loading the file</strong>
            One moment.
          </div>
        ) : error || !listing ? (
          <div className="lot-empty">
            <strong>{error || "Lot not found"}</strong>
            The file may be unpublished or the link is stale.
            <a className="btn btn-ghost btn-sm" href="/#inventory" style={{ marginTop: 12 }}>
              Back to inventory →
            </a>
          </div>
        ) : (
          <div className="detail">
            <div className="detail-head">
              <div>
                <div className="rm">{listing.rm}</div>
                <h1 className="title">
                  {listing.title.split(" ").slice(0, -1).join(" ")}{" "}
                  <em>{listing.title.split(" ").slice(-1)[0]}.</em>
                </h1>
                <div className="legal">
                  {listing.coordinates || "Coordinates not published"} · {listing.region}
                </div>
              </div>
              <span className={`lot-status s-${statusSlug(listing.status)}`}>
                <span className="swatch"></span>
                {listing.status}
              </span>
            </div>

            <div className="detail-grid">
              <div className="detail-media">
                <img
                  src={mediaMode === "photo" ? listing.image : listing.satellite}
                  alt={`${listing.title} ${mediaMode} view`}
                />
                <div className="media-toggle">
                  <button
                    type="button"
                    className={mediaMode === "photo" ? "on" : ""}
                    onClick={() => setMediaMode("photo")}
                  >
                    Photo
                  </button>
                  <button
                    type="button"
                    className={mediaMode === "satellite" ? "on" : ""}
                    onClick={() => setMediaMode("satellite")}
                  >
                    Satellite
                  </button>
                </div>
              </div>

              <aside className="detail-side">
                <dl className="detail-stats">
                  <div>
                    <dt>Title acres</dt>
                    <dd>{number.format(listing.acres)}</dd>
                  </div>
                  <div>
                    <dt>{listing.status === "Lease" ? "$/ac/yr" : "$/ac"}</dt>
                    <dd>{cad.format(listing.pricePerAcre)}</dd>
                  </div>
                  <div>
                    <dt>Avg AV / Qtr</dt>
                    <dd>{cad.format(listing.avgAssessment)}</dd>
                  </div>
                  <div>
                    <dt>Soil final</dt>
                    <dd>{listing.soilRating}/100</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{listing.type}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{listing.status}</dd>
                  </div>
                </dl>

                {listing.highlights?.length ? (
                  <div className="detail-highlights">
                    <div className="lbl">Highlights</div>
                    <ul>
                      {listing.highlights.map((h, idx) => (
                        <li key={idx}>{h}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </aside>
            </div>

            {listing.description ? (
              <p className="detail-description">{listing.description}</p>
            ) : null}

            <div className="detail-inquiry">
              <div>
                <span className="sign">§ Inquire</span>
                <h2>
                  {listing.status === "Wanted"
                    ? "Match this buyer"
                    : listing.status === "Sold"
                      ? "Closed file — request the record"
                      : "Send a brief on this lot"}
                </h2>
              </div>
              <form className="contact-form" onSubmit={submitInquiry}>
                <div className="field">
                  <label htmlFor="iq-name">Name</label>
                  <input id="iq-name" name="name" required autoComplete="name" />
                </div>
                <div className="field">
                  <label htmlFor="iq-phone">Phone</label>
                  <input id="iq-phone" name="phone" autoComplete="tel" />
                </div>
                <div className="field full">
                  <label htmlFor="iq-email">Email</label>
                  <input id="iq-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="field full">
                  <label htmlFor="iq-msg">Message</label>
                  <textarea id="iq-msg" name="message" />
                </div>
                <label className="check full">
                  <input name="consentNewsletter" type="checkbox" />
                  <span>Notify me when new lots open or an auction is called.</span>
                </label>
                <button className="submit full" type="submit">
                  Send the brief <span className="arrow">→</span>
                </button>
                {inquiryStatus ? <p className="form-status success full">{inquiryStatus}</p> : null}
                {inquiryError ? <p className="form-status full">{inquiryError}</p> : null}
              </form>
            </div>
          </div>
        )}
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
