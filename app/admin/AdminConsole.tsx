"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "../lib/useAuth";

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
  deposit_reference: string;
  email: string;
  entity_type: string;
  identity_document_url: string;
  legal_name: string;
  mailing_address: string;
  max_bid_cents: string | null;
  operator_notes: string;
  phone: string | null;
  proof_of_funds_url: string;
  bidder_proof_of_funds_url: string;
  reviewed_at: string | null;
  terms_version: string;
  bidder_notes: string;
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

type PostAuctionTask = {
  id: string;
  title: string;
  assignee_role: string;
  status: string;
  due_at: string | null;
};

type Notification = {
  id: string;
  event_type: string;
  recipient_email: string;
  subject: string;
  status: string;
  last_error: string | null;
  created_at: string;
};

const money = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  maximumFractionDigits: 0,
  style: "currency"
});

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
  const { user, status: authStatus, signOut } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [auctions, setAuctions] = useState<AdminAuction[]>([]);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [tasks, setTasks] = useState<PostAuctionTask[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [status, setStatus] = useState("");
  const [selectedAuctionId, setSelectedAuctionId] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const isAdmin = authStatus === "ready" && user?.role === "admin";

  const selectedAuction = useMemo(
    () => auctions.find((auction) => auction.id === selectedAuctionId) ?? auctions[0],
    [auctions, selectedAuctionId]
  );

  useEffect(() => {
    if (authStatus === "ready" && user === null) {
      window.location.assign("/login/?next=/admin/");
    }
  }, [authStatus, user]);

  useEffect(() => {
    if (selectedAuction && !selectedAuctionId) {
      setSelectedAuctionId(selectedAuction.id);
    }
  }, [selectedAuction, selectedAuctionId]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAdmin();
    // loadAdmin is stable for this component; intentional one-shot kickoff on admin auth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
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
    if (isSyncing) return;

    setIsSyncing(true);
    setStatus("Syncing");
    try {
      const [
        dashboardPayload,
        listingPayload,
        auctionPayload,
        inquiryPayload,
        signupPayload,
        eventPayload,
        notificationPayload
      ] = await Promise.all([
        adminFetch<Dashboard>("/api/admin/dashboard"),
        adminFetch<{ listings: AdminListing[] }>("/api/admin/listings"),
        adminFetch<{ auctions: AdminAuction[] }>("/api/admin/auctions"),
        adminFetch<{ inquiries: Inquiry[] }>("/api/admin/inquiries"),
        adminFetch<{ signups: Signup[] }>("/api/admin/newsletter-signups"),
        adminFetch<{ events: AuditEvent[] }>("/api/admin/events"),
        adminFetch<{ notifications: Notification[] }>("/api/admin/notifications")
      ]);
      setDashboard(dashboardPayload);
      setListings(listingPayload.listings);
      setAuctions(auctionPayload.auctions);
      setInquiries(inquiryPayload.inquiries);
      setSignups(signupPayload.signups);
      setEvents(eventPayload.events);
      setNotifications(notificationPayload.notifications);
      setStatus("Synced");

      const auctionId = selectedAuctionId || auctionPayload.auctions[0]?.id;
      if (auctionId) {
        setSelectedAuctionId(auctionId);
        await loadAuthorizations(auctionId);
        await loadTasks(auctionId);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Admin request failed");
    } finally {
      setIsSyncing(false);
    }
  }

  async function loadAuthorizations(auctionId: string) {
    const payload = await adminFetch<{ authorizations: Authorization[] }>(
      `/api/admin/auctions/${auctionId}/bidders`
    );
    setAuthorizations(payload.authorizations);
  }

  async function loadTasks(auctionId: string) {
    const payload = await adminFetch<{ tasks: PostAuctionTask[] }>(
      `/api/admin/auctions/${auctionId}/tasks`
    );
    setTasks(payload.tasks);
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
        photos: String(data.get("photos") ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [url, ...captionParts] = line.split("|");
            return { url: url.trim(), caption: captionParts.join("|").trim() };
          }),
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

  async function submitBidderDecision(
    event: FormEvent<HTMLFormElement>,
    authorization: Authorization
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await adminFetch(
      `/api/admin/auctions/${authorization.auction_id}/bidders/${authorization.bidder_id}/decision`,
      {
        body: JSON.stringify({
          depositStatus: data.get("depositStatus"),
          maxBid: data.get("maxBid") || undefined,
          operatorNotes: data.get("operatorNotes"),
          status: data.get("status"),
          verificationStatus: data.get("verificationStatus")
        }),
        method: "POST"
      }
    );
    await loadAuthorizations(authorization.auction_id);
    await loadAdmin();
  }

  async function updateTaskStatus(taskId: string, nextStatus: string) {
    await adminFetch(`/api/admin/tasks/${taskId}/status`, {
      body: JSON.stringify({ status: nextStatus }),
      method: "POST"
    });
    if (selectedAuction?.id) await loadTasks(selectedAuction.id);
  }

  async function resendNotification(notificationId: string) {
    await adminFetch(`/api/admin/notifications/${notificationId}/send`, {
      body: JSON.stringify({}),
      method: "POST"
    });
    const payload = await adminFetch<{ notifications: Notification[] }>("/api/admin/notifications");
    setNotifications(payload.notifications);
  }

  const metrics: Array<{ lbl: string; val: string | number; foot?: string }> = [
    { lbl: "Listings on book", val: dashboard?.listing_count ?? 0, foot: "Inventory CMS" },
    { lbl: "Open auctions", val: dashboard?.open_auction_count ?? 0, foot: "Bell active" },
    { lbl: "Bidders", val: dashboard?.bidder_count ?? 0, foot: "Authorized accounts" },
    { lbl: "Accepted bids", val: dashboard?.accepted_bid_count ?? 0, foot: "Recorded to ledger" },
    { lbl: "Inquiries", val: dashboard?.inquiry_count ?? 0, foot: "Procurement intake" }
  ];

  if (authStatus === "loading") {
    return (
      <main className="admin-page">
        <section className="admin-shell">
          <div className="admin-head">
            <h1 className="title">Authorising…</h1>
          </div>
        </section>
      </main>
    );
  }

  if (user === null) {
    return (
      <main className="admin-page">
        <section className="admin-shell">
          <div className="admin-head">
            <h1 className="title">Redirecting…</h1>
          </div>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="admin-page">
        <section className="admin-shell">
          <div className="admin-head">
            <h1 className="title">Restricted</h1>
            <p className="lede">
              This area is restricted to operators. Sign out and use an admin account.
            </p>
          </div>
          <div className="admin-actions" style={{ display: "flex", gap: 12 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                void signOut();
              }}
              type="button"
            >
              Sign out <span className="arrow">→</span>
            </button>
            <a className="btn btn-ghost btn-sm" href="/">
              Back to site
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <a className="wordmark" href="/" aria-label="Back to the public floor">
          <span className="mark">W</span>
          <span className="lockup">
            <span className="name">Wyatt</span>
            <span className="sub">Operator console</span>
          </span>
        </a>
        <div className="admin-key">
          <span>Signed in · {user.email}</span>
          <a className="btn btn-ghost btn-sm" href="/">
            Back to site
          </a>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              void signOut().then(() => {
                window.location.assign("/");
              });
            }}
            type="button"
          >
            Sign out
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={loadAdmin}
            type="button"
            disabled={isSyncing}
          >
            {isSyncing ? "Syncing" : "Sync"} <span className="arrow">→</span>
          </button>
        </div>
      </header>

      <section className="admin-shell">
        <div className="admin-head">
          <h1 className="title">Operator console</h1>
          <p className="lede">
            Listings, live auctions, bidder approvals, post-close. Every action writes to the audit ledger.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <span className="admin-status">{status || "Ready"}</span>
        </div>

        <div className="admin-metrics">
          {metrics.map((metric) => (
            <div className="admin-metric" key={metric.lbl}>
              <div className="lbl">
                {metric.lbl} <span className="pip">§</span>
              </div>
              <div className="val figure">{metric.val}</div>
              <div className="foot">{metric.foot}</div>
            </div>
          ))}
        </div>

        <section className="admin-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Inventory</p>
                <h2>
                  Create <em>listing</em>
                </h2>
              </div>
              <span className="ornament">Form · 14 fields</span>
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
              <input
                name="satellite"
                defaultValue="/images/satellite-fields.jpg"
                placeholder="Satellite image"
              />
              <textarea name="description" placeholder="Description" />
              <textarea name="highlights" placeholder="Highlights, one per line" />
              <textarea
                name="photos"
                placeholder="Additional photo URLs — one per line. Optionally pipe a caption: https://… | Aerial, July"
              />
              <label className="admin-check">
                <input name="publish" type="checkbox" />
                Publish to the book
              </label>
              <button type="submit">Add listing →</button>
            </form>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Auctions</p>
                <h2>
                  Create <em>auction</em>
                </h2>
              </div>
              <span className="ornament">Bell · Reserve · Bid</span>
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
              <input
                name="bidIncrement"
                defaultValue="25000"
                placeholder="Bid increment"
                type="number"
              />
              <input
                name="reservePrice"
                defaultValue="0"
                placeholder="Reserve price"
                type="number"
              />
              <input
                name="softCloseSeconds"
                defaultValue="300"
                placeholder="Soft close seconds"
                type="number"
              />
              <select name="reserveVisibility" defaultValue="met-only">
                <option value="met-only">Reserve met only</option>
                <option value="hidden">Hidden</option>
                <option value="public">Public</option>
              </select>
              <button type="submit">Add auction →</button>
            </form>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">On the book</p>
                <h2>The book</h2>
              </div>
              <span className="ornament">{listings.length} files</span>
            </div>
            <div className="admin-table">
              {listings.length ? (
                listings.map((listing) => (
                  <div className="admin-row" key={listing.id}>
                    <div>
                      <strong>{listing.title}</strong>
                      <span>
                        {listing.rm} · {listing.acres} ac · soil {listing.soilRating} · {money.format(listing.pricePerAcre)}/ac
                      </span>
                    </div>
                    <em>{listing.publishedAt ? listing.status : "Draft"}</em>
                  </div>
                ))
              ) : (
                <div className="admin-empty">No listings yet — press Sync to refresh.</div>
              )}
            </div>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Open auctions</p>
                <h2>Auctions</h2>
              </div>
              <span className="ornament">{auctions.length} on roll</span>
            </div>
            <div className="admin-table">
              {auctions.length ? (
                auctions.map((auction) => (
                  <div className="admin-row stacked" key={auction.id}>
                    <div>
                      <strong>{auction.title}</strong>
                      <span>
                        {auction.status.toUpperCase()} · high {money.format(auction.currentHighBidDollars)} · reserve {auction.reserveMet ? "met" : "pending"}
                      </span>
                    </div>
                    <div className="admin-actions">
                      <button
                        className="subtle"
                        onClick={() => setAuctionStatus(auction.id, "open")}
                        title="Open"
                        type="button"
                      >
                        Open
                      </button>
                      <button
                        className="subtle"
                        onClick={() => setAuctionStatus(auction.id, "paused")}
                        title="Pause"
                        type="button"
                      >
                        Pause
                      </button>
                      <button
                        onClick={() => closeAuction(auction.id)}
                        title="Close the bell"
                        type="button"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="admin-empty">No auctions yet.</div>
              )}
            </div>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Bidder approvals</p>
                <h2>
                  Authorization <em>queue</em>
                </h2>
              </div>
              <select
                aria-label="Auction authorization queue"
                onChange={(event) => {
                  setSelectedAuctionId(event.target.value);
                  void loadAuthorizations(event.target.value);
                  void loadTasks(event.target.value);
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
              {authorizations.length ? (
                authorizations.map((authorization) => (
                  <div
                    className="admin-row stacked"
                    key={`${authorization.auction_id}-${authorization.bidder_id}`}
                  >
                    <div>
                      <strong>{authorization.legal_name}</strong>
                      <span>
                        {authorization.email} · {authorization.entity_type} · {authorization.status} · deposit {authorization.deposit_status}
                      </span>
                      <span>
                        ID {authorization.verification_status} · Terms {authorization.terms_version}
                      </span>
                      {authorization.deposit_reference ? (
                        <span>Deposit ref · {authorization.deposit_reference}</span>
                      ) : null}
                      {authorization.proof_of_funds_url || authorization.bidder_proof_of_funds_url ? (
                        <span>
                          Proof · {authorization.proof_of_funds_url || authorization.bidder_proof_of_funds_url}
                        </span>
                      ) : null}
                      {authorization.identity_document_url ? (
                        <span>ID · {authorization.identity_document_url}</span>
                      ) : null}
                      {authorization.bidder_notes ? <span>Notes · {authorization.bidder_notes}</span> : null}
                    </div>
                    <form
                      className="admin-inline-form"
                      onSubmit={(event) => submitBidderDecision(event, authorization)}
                    >
                      <select name="status" defaultValue={authorization.status}>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="suspended">Suspended</option>
                      </select>
                      <select name="depositStatus" defaultValue={authorization.deposit_status}>
                        <option value="not_required">No deposit</option>
                        <option value="pending">Deposit pending</option>
                        <option value="verified">Deposit verified</option>
                        <option value="waived">Deposit waived</option>
                      </select>
                      <select
                        name="verificationStatus"
                        defaultValue={authorization.verification_status}
                      >
                        <option value="pending">ID pending</option>
                        <option value="approved">ID approved</option>
                        <option value="rejected">ID rejected</option>
                      </select>
                      <input
                        name="maxBid"
                        placeholder="Max bid"
                        type="number"
                        defaultValue={
                          authorization.max_bid_cents
                            ? Number(authorization.max_bid_cents) / 100
                            : ""
                        }
                      />
                      <input
                        name="operatorNotes"
                        placeholder="Operator notes"
                        defaultValue={authorization.operator_notes}
                      />
                      <button type="submit">Save decision</button>
                    </form>
                  </div>
                ))
              ) : (
                <div className="admin-empty">No applications for the selected auction.</div>
              )}
            </div>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Inquiries</p>
                <h2>Inquiries</h2>
              </div>
              <span className="ornament">{inquiries.length} on file</span>
            </div>
            <div className="admin-table">
              {inquiries.length ? (
                inquiries.map((inquiry) => (
                  <div className="admin-row" key={inquiry.id}>
                    <div>
                      <strong>{inquiry.name}</strong>
                      <span>
                        {inquiry.file_type} · {inquiry.email}
                      </span>
                    </div>
                    <em>{formatDate(inquiry.created_at)}</em>
                  </div>
                ))
              ) : (
                <div className="admin-empty">No inquiries yet.</div>
              )}
            </div>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Post-auction tasks</p>
                <h2>
                  Post-auction <em>tasks</em>
                </h2>
              </div>
              <span className="ornament">{tasks.length} active</span>
            </div>
            <div className="admin-table">
              {tasks.length ? (
                tasks.map((task) => (
                  <div className="admin-row" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>
                        {task.assignee_role} · {task.due_at ? formatDate(task.due_at) : "No due date"}
                      </span>
                    </div>
                    <div className="admin-actions">
                      <button
                        className="subtle"
                        onClick={() => updateTaskStatus(task.id, "open")}
                        type="button"
                      >
                        Open
                      </button>
                      <button
                        className="subtle"
                        onClick={() => updateTaskStatus(task.id, "blocked")}
                        type="button"
                      >
                        Blocked
                      </button>
                      <button onClick={() => updateTaskStatus(task.id, "done")} type="button">
                        Done
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="admin-empty">No tasks for the selected auction.</div>
              )}
            </div>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Notifications</p>
                <h2>Notifications</h2>
              </div>
              <span className="ornament">{notifications.length} queued</span>
            </div>
            <div className="admin-table">
              {notifications.length ? (
                notifications.map((notification) => (
                  <div className="admin-row stacked" key={notification.id}>
                    <div>
                      <strong>{notification.subject}</strong>
                      <span>
                        {notification.recipient_email} · {notification.event_type} · {notification.status}
                      </span>
                      {notification.last_error ? <span>{notification.last_error}</span> : null}
                    </div>
                    <div className="admin-actions">
                      <button
                        onClick={() => resendNotification(notification.id)}
                        type="button"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="admin-empty">Outbox is clear.</div>
              )}
            </div>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Newsletter</p>
                <h2>Consent log</h2>
              </div>
              <span className="ornament">{signups.length} subscribers</span>
            </div>
            <div className="admin-table">
              {signups.length ? (
                signups.map((signup) => (
                  <div className="admin-row" key={signup.id}>
                    <div>
                      <strong>{signup.email}</strong>
                      <span>{signup.consent_source}</span>
                    </div>
                    <em>{formatDate(signup.consent_at)}</em>
                  </div>
                ))
              ) : (
                <div className="admin-empty">No subscribers yet.</div>
              )}
            </div>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <p className="pre">Audit ledger</p>
                <h2>
                  Event <em>ledger</em>
                </h2>
              </div>
              <span className="ornament">{events.length} events</span>
            </div>
            <div className="admin-table">
              {events.length ? (
                events.map((event) => (
                  <div className="admin-row" key={event.id}>
                    <div>
                      <strong>{event.event_type}</strong>
                      <span>{event.actor_type}</span>
                    </div>
                    <em>{formatDate(event.created_at)}</em>
                  </div>
                ))
              ) : (
                <div className="admin-empty">Ledger is empty — no recorded events.</div>
              )}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
