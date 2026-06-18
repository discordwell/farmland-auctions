"use client";

import { Countdown } from "./Countdown";

export type ApiAuctionListing = {
  slug: string;
  rm: string;
  acres: number;
  soilRating: number;
  image: string;
};

export type ApiAuction = {
  id: string;
  listingId: string;
  title: string;
  status: string;
  auctionType: string;
  opensAt: string;
  closesAt: string;
  softCloseSeconds: number;
  bidIncrementCents: number;
  reserveVisibility: string;
  reserveMet: boolean;
  currentHighBidCents: number;
  currentHighBidDollars: number;
  currentHighBidderId: string | null;
  version: number;
  listing?: ApiAuctionListing | null;
};

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-CA");

function cleanTitle(raw: string) {
  // Strip "DEMO · " prefix; the catalog has its own demo badge.
  return raw.replace(/^DEMO\s*·\s*/i, "");
}

export function AuctionCatalog({
  auctions,
  variant = "compact"
}: {
  auctions: ApiAuction[];
  variant?: "compact" | "page";
}) {
  if (!auctions.length) {
    return (
      <div className="auction-catalog-empty">
        <strong>No auctions live right now.</strong>
        <p>Auctions appear here when Wyatt Realty opens one.</p>
      </div>
    );
  }

  return (
    <ul className={`auction-catalog ${variant}`}>
      {auctions.map((auction) => {
        const isDemo = /^DEMO\s*·/i.test(auction.title);
        const title = cleanTitle(auction.title);
        const high = auction.currentHighBidDollars;
        return (
          <li className="auction-card" key={auction.id}>
            <a
              className="auction-card-link"
              href={`/auctions/?id=${encodeURIComponent(auction.id)}`}
            >
              <div className="auction-card-media">
                {auction.listing?.image ? (
                  <img src={auction.listing.image} alt={title} />
                ) : null}
                {isDemo ? <span className="auction-card-demo">Demo</span> : null}
              </div>
              <div className="auction-card-body">
                <span className="rm">{auction.listing?.rm ?? "RM tba"}</span>
                <strong>{title}</strong>
                <div className="auction-card-meta">
                  {auction.listing ? (
                    <span>{number.format(auction.listing.acres)} ac</span>
                  ) : null}
                  <span>Increment {cad.format(auction.bidIncrementCents / 100)}</span>
                </div>
              </div>
              <div className="auction-card-stats">
                <div className="auction-card-stat">
                  <span className="lbl">High bid</span>
                  <span className="val">{high > 0 ? cad.format(high) : "—"}</span>
                </div>
                <div className="auction-card-stat">
                  <span className="lbl">Reserve</span>
                  {auction.reserveVisibility === "hidden" ? (
                    <span className="val">—</span>
                  ) : (
                    <span className={`val ${auction.reserveMet ? "ok" : "pending"}`}>
                      {auction.reserveMet ? "Met" : "Open"}
                    </span>
                  )}
                </div>
                <div className="auction-card-stat countdown-stat">
                  <span className="lbl">Closes in</span>
                  <Countdown closesAt={auction.closesAt} variant="inline" />
                </div>
              </div>
              <div className="auction-card-foot">
                <span>Open the bidding</span>
                <span className="arrow">→</span>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
