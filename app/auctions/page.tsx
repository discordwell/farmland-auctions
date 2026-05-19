"use client";

import { useEffect, useState } from "react";

import { SiteHeader } from "../components/SiteHeader";
import { useAuth } from "../lib/useAuth";
import { AuctionCatalog, type ApiAuction } from "./AuctionCatalog";
import { AuctionDetail } from "./AuctionDetail";

function readIdParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id || !/^[a-f0-9-]{8,}$/i.test(id)) return null;
  return id;
}

function CatalogView() {
  const { user, status: authStatus, signOut } = useAuth();
  const [auctions, setAuctions] = useState<ApiAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/auctions")
      .then((response) => {
        if (!response.ok) throw new Error("Auctions service is offline");
        return response.json() as Promise<{ auctions: ApiAuction[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        setAuctions(payload.auctions);
        setError("");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    await signOut();
    window.location.assign("/");
  }

  return (
    <>
      <SiteHeader user={user} authStatus={authStatus} onSignOut={handleSignOut} highlightAuction />
      <main className="hub">
        <section className="hub-head">
          <p className="hub-eyebrow">Auctions</p>
          <h1>
            Open <em>auctions.</em>
          </h1>
          <p className="hub-lede">
            Reserves published. Bell drops on schedule. Approved bidders only.
          </p>
        </section>
        {loading ? (
          <div className="hub-loading">Loading auctions…</div>
        ) : error ? (
          <div className="hub-empty">
            <p>{error}</p>
          </div>
        ) : (
          <AuctionCatalog auctions={auctions} variant="page" />
        )}
      </main>
    </>
  );
}

export default function AuctionsPage() {
  const [resolved, setResolved] = useState<{ id: string | null } | null>(null);

  useEffect(() => {
    setResolved({ id: readIdParam() });
    function onPop() {
      setResolved({ id: readIdParam() });
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (resolved === null) {
    return (
      <main className="hub">
        <div className="hub-loading">Loading…</div>
      </main>
    );
  }

  if (resolved.id) {
    return <AuctionDetail id={resolved.id} />;
  }

  return <CatalogView />;
}
