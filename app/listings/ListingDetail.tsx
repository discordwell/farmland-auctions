"use client";

import { FormEvent, useEffect, useState } from "react";
import { type Listing } from "../data";
import { GoogleMapsEmbed } from "../components/GoogleMapsEmbed";

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-CA");

function statusSlug(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}

type ListingDetailProps = {
  initial?: Listing | null;
  slug?: string;
};

export function ListingDetail({ initial = null, slug: slugProp }: ListingDetailProps = {}) {
  const [listing, setListing] = useState<Listing | null>(initial);
  const [isLoading, setIsLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [activePhoto, setActivePhoto] = useState(0);
  const [inquiryStatus, setInquiryStatus] = useState("");
  const [inquiryError, setInquiryError] = useState("");

  useEffect(() => {
    // If we hydrated from generateStaticParams, refresh in the background to pick up admin edits.
    // If we didn't (legacy /listings/?slug=... entrypoint), fetch outright.
    const params = new URLSearchParams(window.location.search);
    const next = slugProp || params.get("slug") || initial?.slug || "";
    if (!next) {
      setIsLoading(false);
      setError("No lot specified");
      return;
    }

    let cancelled = false;
    if (!initial) setIsLoading(true);
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
        if (!initial) setListing(null);
        setError(err.message);
      })
      .finally(() => !cancelled && setIsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [initial, slugProp]);

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
                {listing.legalDescription ? (
                  <div className="lld">
                    <span className="lbl">Legal land description</span>
                    <span className="val">{listing.legalDescription}</span>
                  </div>
                ) : null}
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
              <div className="detail-media-stack">
                {(() => {
                  const gallery = [
                    { url: listing.image, caption: "" },
                    ...(listing.photos ?? []).filter((p) => p.url && p.url !== listing.image)
                  ];
                  const safeIdx = Math.min(activePhoto, gallery.length - 1);
                  return (
                    <>
                      <div className="detail-media">
                        <img src={gallery[safeIdx].url} alt={gallery[safeIdx].caption || listing.title} />
                        {gallery[safeIdx].caption ? (
                          <span className="detail-media-caption">{gallery[safeIdx].caption}</span>
                        ) : null}
                      </div>
                      {gallery.length > 1 ? (
                        <div className="detail-thumbs" role="tablist" aria-label="Lot photos">
                          {gallery.map((photo, idx) => (
                            <button
                              key={photo.url + idx}
                              type="button"
                              className={`detail-thumb${idx === safeIdx ? " on" : ""}`}
                              onClick={() => setActivePhoto(idx)}
                              aria-label={photo.caption || `Photo ${idx + 1}`}
                            >
                              <img src={photo.url} alt="" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
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
                    <dt>Status</dt>
                    <dd>{listing.status}</dd>
                  </div>
                </dl>

                {(() => {
                  const segments: Array<[string, string, number]> = [
                    ["cultivated", "Cultivated", listing.acresCultivated ?? 0],
                    ["pasture", "Pasture", listing.acresPasture ?? 0],
                    ["hayland", "Hayland", listing.acresHayland ?? 0],
                    ["bush", "Bush", listing.acresBush ?? 0],
                    ["yard", "Yard", listing.acresYard ?? 0]
                  ];
                  const accountedFor = segments.reduce((sum, [, , acres]) => sum + acres, 0);
                  if (accountedFor <= 0) return null;
                  const total = Math.max(accountedFor, listing.acres);
                  return (
                    <div className="composition">
                      <div className="lbl">Land composition</div>
                      <div className="composition-bar" role="img" aria-label="Land composition">
                        {segments.map(([key, , acres]) =>
                          acres > 0 ? (
                            <div
                              key={key}
                              className={`composition-segment c-${key}`}
                              style={{ flexGrow: acres }}
                              title={`${acres} ac`}
                            />
                          ) : null
                        )}
                      </div>
                      <ul className="composition-legend">
                        {segments.map(([key, label, acres]) =>
                          acres > 0 ? (
                            <li key={key}>
                              <span className={`composition-swatch c-${key}`}></span>
                              <span className="ll">{label}</span>
                              <span className="ac">
                                {number.format(acres)} ac
                                <span className="pct">
                                  &nbsp;· {Math.round((acres / total) * 100)}%
                                </span>
                              </span>
                            </li>
                          ) : null
                        )}
                      </ul>
                    </div>
                  );
                })()}

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

            {(() => {
              const provenance: Array<[string, string]> = [];
              if (listing.waterSource) provenance.push(["Water source", listing.waterSource]);
              if (listing.currentOperator) provenance.push(["Current operator", listing.currentOperator]);
              if (listing.zoning) provenance.push(["Zoning", listing.zoning]);
              if (listing.mineralRights) provenance.push(["Mineral rights", listing.mineralRights]);
              if (listing.lastSalePrice != null && listing.lastSalePrice > 0) {
                const date = listing.lastSaleDate
                  ? new Date(listing.lastSaleDate).toLocaleDateString("en-CA", {
                      year: "numeric",
                      month: "short",
                      day: "numeric"
                    })
                  : null;
                provenance.push([
                  "Last sale",
                  date ? `${cad.format(listing.lastSalePrice)} · ${date}` : cad.format(listing.lastSalePrice)
                ]);
              }
              if (!provenance.length && !listing.encumbrances) return null;
              return (
                <section className="detail-provenance">
                  <div className="provenance-head">
                    <span className="sign">§ Provenance &amp; rights</span>
                  </div>
                  {provenance.length ? (
                    <dl className="provenance-grid">
                      {provenance.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {listing.encumbrances ? (
                    <div className="provenance-note">
                      <div className="lbl">Encumbrances</div>
                      <p>{listing.encumbrances}</p>
                    </div>
                  ) : null}
                </section>
              );
            })()}

            {listing.latitude != null && listing.longitude != null ? (
              <GoogleMapsEmbed
                latitude={listing.latitude}
                longitude={listing.longitude}
                label={`${listing.title} · ${listing.rm}`}
              />
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
