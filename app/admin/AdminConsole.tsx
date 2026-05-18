"use client";

import {
  ArrowLeft,
  BadgeCheck,
  ClipboardList,
  FilePlus2,
  Gavel,
  KeyRound,
  LayoutDashboard,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Square,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Dashboard = {
  accepted_bid_count: number;
  bidder_count: number;
  inquiry_count: number;
  listing_count: number;
  open_auction_count: number;
};

type AdminListing = {
  id: string;
  slug: string;
  title: string;
  rm: string;
  region: string;
  acres: number;
  pricePerAcre: number;
  avgAssessment: number;
  soilRating: number;
  type: string;
  status: string;
  image: string;
  satellite: string;
  description: string;
  highlights: string[];
  publishedAt: string | null;
};

type AdminAuction = {
  id: string;
  listingId: string;
  title: string;
  status: string;
  auctionType: string;
  opensAt: string;
  closesAt: string;
  currentHighBidDollars: number;
  reserveMet: boolean;
  listing: {
    rm: string;
    acres: number;
  } | null;
};

type Authorization = {
  auction_id: string;
  bidder_id: string;
  status: string;
  deposit_status: string;
  email: string;
  legal_name: string;
  phone: string | null;
  verification_status: string;
};

type Inquiry = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  file_type: string;
  created_at: string;
};

type Signup = {
  id: string;
  email: string;
  consent_source: string;
  consent_at: string;
};

type AuditEvent = {
  id: string;
  event_type: string;
  actor_type: string;
  created_at: string;
};

const money = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  maximumFractionDigits: 0,
  style: "currency"
});

type MetricItem = [string, number, LucideIcon];

function dateTimeLocal(offsetMinutes: number) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function AdminConsole() {
  const [apiKey, setApiKey] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [auctions, setAuctions] = useState<AdminAuction[]>([]);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState("");
  const [selectedAuctionId, setSelectedAuctionId] = useState("");

  const selectedAuction = useMemo(
    () => auctions.find((auction) => auction.id === selectedAuctionId) ?? auctions[0],
    [auctions, selectedAuctionId]
  );

  useEffect(() => {
    setApiKey(window.localStorage.getItem("farmauction-admin-key") ?? "");
  }, []);

  useEffect(() => {
    if (selectedAuction && !selectedAuctionId) {
      setSelectedAuctionId(selectedAuction.id);
    }
  }, [selectedAuction, selectedAuctionId]);

  async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-admin-key": apiKey,
        ...(init?.headers ?? {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message ?? "Admin request failed");
    }
    return payload as T;
  }

  async function loadAdmin() {
    if (!apiKey) {
      setStatus("Admin key required");
      return;
    }

    window.localStorage.setItem("farmauction-admin-key", apiKey);
    setStatus("Loading");
    try {
      const [
        dashboardPayload,
        listingPayload,
        auctionPayload,
        inquiryPayload,
        signupPayload,
        eventPayload
      ] = await Promise.all([
        adminFetch<Dashboard>("/api/admin/dashboard"),
        adminFetch<{ listings: AdminListing[] }>("/api/admin/listings"),
        adminFetch<{ auctions: AdminAuction[] }>("/api/admin/auctions"),
        adminFetch<{ inquiries: Inquiry[] }>("/api/admin/inquiries"),
        adminFetch<{ signups: Signup[] }>("/api/admin/newsletter-signups"),
        adminFetch<{ events: AuditEvent[] }>("/api/admin/events")
      ]);
      setDashboard(dashboardPayload);
      setListings(listingPayload.listings);
      setAuctions(auctionPayload.auctions);
      setInquiries(inquiryPayload.inquiries);
      setSignups(signupPayload.signups);
      setEvents(eventPayload.events);
      setStatus("Synced");

      const auctionId = selectedAuctionId || auctionPayload.auctions[0]?.id;
      if (auctionId) {
        setSelectedAuctionId(auctionId);
        await loadAuthorizations(auctionId);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Admin request failed");
    }
  }

  async function loadAuthorizations(auctionId: string) {
    const payload = await adminFetch<{ authorizations: Authorization[] }>(
      `/api/admin/auctions/${auctionId}/bidders`
    );
    setAuthorizations(payload.authorizations);
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    await adminFetch("/api/admin/listings", {
      body: JSON.stringify({
        acres: data.get("acres"),
        avgAssessment: data.get("avgAssessment"),
        description: data.get("description"),
        highlights: String(data.get("highlights") ?? "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        image: data.get("image"),
        pricePerAcre: data.get("pricePerAcre"),
        publish: data.get("publish") === "on",
        region: data.get("region"),
        rm: data.get("rm"),
        satellite: data.get("satellite"),
        slug: data.get("slug"),
        soilRating: data.get("soilRating"),
        status: data.get("status"),
        title: data.get("title"),
        type: data.get("type")
      }),
      method: "POST"
    });
    form.reset();
    await loadAdmin();
  }

  async function submitAuction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await adminFetch("/api/admin/auctions", {
      body: JSON.stringify({
        auctionType: data.get("auctionType"),
        bidIncrement: data.get("bidIncrement"),
        closesAt: data.get("closesAt"),
        listingId: data.get("listingId"),
        opensAt: data.get("opensAt"),
        reservePrice: data.get("reservePrice"),
        reserveVisibility: data.get("reserveVisibility"),
        softCloseSeconds: data.get("softCloseSeconds"),
        status: data.get("status"),
        title: data.get("title")
      }),
      method: "POST"
    });
    form.reset();
    await loadAdmin();
  }

  async function setAuctionStatus(auctionId: string, nextStatus: string) {
    await adminFetch(`/api/admin/auctions/${auctionId}/status`, {
      body: JSON.stringify({ status: nextStatus }),
      method: "POST"
    });
    await loadAdmin();
  }

  async function closeAuction(auctionId: string) {
    await adminFetch(`/api/admin/auctions/${auctionId}/close`, {
      body: JSON.stringify({}),
      method: "POST"
    });
    await loadAdmin();
  }

  async function decideBidder(authorization: Authorization, nextStatus: string) {
    await adminFetch(
      `/api/admin/auctions/${authorization.auction_id}/bidders/${authorization.bidder_id}/decision`,
      {
        body: JSON.stringify({
          depositStatus: nextStatus === "approved" ? "verified" : authorization.deposit_status,
          status: nextStatus
        }),
        method: "POST"
      }
    );
    await loadAuthorizations(authorization.auction_id);
    await loadAdmin();
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <ArrowLeft size={18} />
          </span>
          <span>
            <strong>Wyatt</strong>
            <small>Admin Console</small>
          </span>
        </a>
        <div className="admin-key">
          <KeyRound size={17} />
          <input
            aria-label="Admin API key"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Admin key"
            type="password"
            value={apiKey}
          />
          <button className="primary-button" onClick={loadAdmin} type="button">
            <RefreshCcw size={17} />
            Sync
          </button>
        </div>
      </header>

      <section className="admin-shell">
        <div className="section-head">
          <div>
            <p className="eyebrow">Operator console</p>
            <h1>Brokerage command center</h1>
          </div>
          <span className="admin-status">{status || "Ready"}</span>
        </div>

        <div className="admin-metrics">
          {([
            ["Listings", dashboard?.listing_count ?? 0, FilePlus2],
            ["Open auctions", dashboard?.open_auction_count ?? 0, Gavel],
            ["Bidders", dashboard?.bidder_count ?? 0, UsersRound],
            ["Accepted bids", dashboard?.accepted_bid_count ?? 0, BadgeCheck],
            ["Inquiries", dashboard?.inquiry_count ?? 0, Mail]
          ] satisfies MetricItem[]).map(([label, value, Icon]) => (
            <div className="admin-metric" key={String(label)}>
              <Icon size={19} />
              <strong>{String(value)}</strong>
              <span>{String(label)}</span>
            </div>
          ))}
        </div>

        <section className="admin-grid">
          <article className="admin-panel wide">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">Listings CMS</p>
                <h2>Create listing</h2>
              </div>
              <FilePlus2 size={20} />
            </div>
            <form className="admin-form" onSubmit={submitListing}>
              <input name="title" placeholder="Title" required />
              <input name="slug" placeholder="slug" required />
              <input name="rm" placeholder="RM location" required />
              <input name="region" placeholder="Region" required />
              <input name="acres" placeholder="Title acres" required type="number" />
              <input name="pricePerAcre" placeholder="Price per acre" required type="number" />
              <input name="avgAssessment" placeholder="Avg. AV / quarter" required type="number" />
              <input name="soilRating" placeholder="Soil rating" required type="number" />
              <select name="type" defaultValue="Grain">
                <option>Grain</option>
                <option>Mixed</option>
                <option>Pasture</option>
                <option>Lease</option>
              </select>
              <select name="status" defaultValue="For Sale">
                <option>For Sale</option>
                <option>Pending</option>
                <option>Sold</option>
                <option>Wanted</option>
                <option>Lease</option>
              </select>
              <input name="image" defaultValue="/images/hero-fields.jpg" placeholder="Hero image" />
              <input name="satellite" defaultValue="/images/satellite-fields.jpg" placeholder="Satellite image" />
              <textarea name="description" placeholder="Description" />
              <textarea name="highlights" placeholder="Highlights, one per line" />
              <label className="admin-check">
                <input name="publish" type="checkbox" />
                Publish
              </label>
              <button type="submit">
                <Plus size={17} />
                Add Listing
              </button>
            </form>
          </article>

          <article className="admin-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">Auction control</p>
                <h2>Create auction</h2>
              </div>
              <Gavel size={20} />
            </div>
            <form className="admin-form stacked" onSubmit={submitAuction}>
              <select name="listingId" required>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.title}
                  </option>
                ))}
              </select>
              <input name="title" placeholder="Auction title" required />
              <select name="auctionType" defaultValue="live">
                <option value="live">Live</option>
                <option value="sealed">Sealed</option>
              </select>
              <select name="status" defaultValue="registration">
                <option value="registration">Registration</option>
                <option value="open">Open</option>
                <option value="draft">Draft</option>
              </select>
              <input name="opensAt" defaultValue={dateTimeLocal(15)} type="datetime-local" />
              <input name="closesAt" defaultValue={dateTimeLocal(180)} type="datetime-local" />
              <input name="bidIncrement" defaultValue="25000" placeholder="Bid increment" type="number" />
              <input name="reservePrice" defaultValue="0" placeholder="Reserve price" type="number" />
              <input name="softCloseSeconds" defaultValue="300" placeholder="Soft close seconds" type="number" />
              <select name="reserveVisibility" defaultValue="met-only">
                <option value="met-only">Reserve met only</option>
                <option value="hidden">Hidden</option>
                <option value="public">Public</option>
              </select>
              <button type="submit">
                <Plus size={17} />
                Add Auction
              </button>
            </form>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-panel wide">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">Inventory</p>
                <h2>Listings</h2>
              </div>
              <LayoutDashboard size={20} />
            </div>
            <div className="admin-table">
              {listings.map((listing) => (
                <div className="admin-row" key={listing.id}>
                  <div>
                    <strong>{listing.title}</strong>
                    <span>
                      {listing.rm} · {listing.acres} acres · soil {listing.soilRating}
                    </span>
                  </div>
                  <em>{listing.publishedAt ? listing.status : "Draft"}</em>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">Live files</p>
                <h2>Auctions</h2>
              </div>
              <ClipboardList size={20} />
            </div>
            <div className="admin-table">
              {auctions.map((auction) => (
                <div className="admin-row stacked-row" key={auction.id}>
                  <div>
                    <strong>{auction.title}</strong>
                    <span>
                      {auction.status} · {money.format(auction.currentHighBidDollars)}
                    </span>
                  </div>
                  <div className="admin-actions">
                    <button onClick={() => setAuctionStatus(auction.id, "open")} title="Open">
                      <Play size={15} />
                    </button>
                    <button onClick={() => setAuctionStatus(auction.id, "paused")} title="Pause">
                      <Pause size={15} />
                    </button>
                    <button onClick={() => closeAuction(auction.id)} title="Close">
                      <Square size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-panel wide">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">Bidder approvals</p>
                <h2>Authorization queue</h2>
              </div>
              <select
                aria-label="Auction authorization queue"
                onChange={(event) => {
                  setSelectedAuctionId(event.target.value);
                  void loadAuthorizations(event.target.value);
                }}
                value={selectedAuction?.id ?? ""}
              >
                {auctions.map((auction) => (
                  <option key={auction.id} value={auction.id}>
                    {auction.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-table">
              {authorizations.map((authorization) => (
                <div className="admin-row stacked-row" key={`${authorization.auction_id}-${authorization.bidder_id}`}>
                  <div>
                    <strong>{authorization.legal_name}</strong>
                    <span>
                      {authorization.email} · {authorization.status} · {authorization.deposit_status}
                    </span>
                  </div>
                  <div className="admin-actions">
                    <button onClick={() => decideBidder(authorization, "approved")} title="Approve">
                      <ShieldCheck size={15} />
                    </button>
                    <button onClick={() => decideBidder(authorization, "rejected")} title="Reject">
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">Leads</p>
                <h2>Inquiries</h2>
              </div>
              <Mail size={20} />
            </div>
            <div className="admin-table">
              {inquiries.map((inquiry) => (
                <div className="admin-row" key={inquiry.id}>
                  <div>
                    <strong>{inquiry.name}</strong>
                    <span>
                      {inquiry.file_type} · {inquiry.email}
                    </span>
                  </div>
                  <em>{formatDate(inquiry.created_at)}</em>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">Newsletter</p>
                <h2>Consent log</h2>
              </div>
              <Mail size={20} />
            </div>
            <div className="admin-table">
              {signups.map((signup) => (
                <div className="admin-row" key={signup.id}>
                  <div>
                    <strong>{signup.email}</strong>
                    <span>{signup.consent_source}</span>
                  </div>
                  <em>{formatDate(signup.consent_at)}</em>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-panel wide">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">Audit</p>
                <h2>Event ledger</h2>
              </div>
              <ClipboardList size={20} />
            </div>
            <div className="admin-table">
              {events.map((event) => (
                <div className="admin-row" key={event.id}>
                  <div>
                    <strong>{event.event_type}</strong>
                    <span>{event.actor_type}</span>
                  </div>
                  <em>{formatDate(event.created_at)}</em>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
