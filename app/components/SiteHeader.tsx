"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

import type { AuthUser } from "../lib/useAuth";

type SiteHeaderProps = {
  user: AuthUser | null;
  authStatus: "loading" | "ready";
  onSignOut?: () => void | Promise<void>;
  /** True on the home page so anchors stay relative; elsewhere they jump to /#section. */
  onHome?: boolean;
  /** Home page can mark the Auction link active when a featured auction is open. */
  highlightAuction?: boolean;
};

export function SiteHeader({
  user,
  authStatus,
  onSignOut,
  onHome = false,
  highlightAuction = false
}: SiteHeaderProps) {
  const [mobileNav, setMobileNav] = useState(false);
  const anchor = (hash: string) => (onHome ? hash : `/${hash}`);
  const homeHref = onHome ? "#top" : "/";

  const hubHref =
    user?.role === "admin"
      ? "/admin/"
      : user?.intent === "seller"
        ? "/seller/"
        : "/buyer/";

  return (
    <header className="mast">
      <div className="mast-inner">
        <a className="wordmark" href={homeHref} aria-label="Wyatt Farmland Auctions home">
          <span className="mark">W</span>
          <span className="lockup">
            <span className="name">Wyatt</span>
            <span className="sub">Farmland Auctions</span>
          </span>
        </a>
        <nav className={mobileNav ? "navlinks open" : "navlinks"} aria-label="Primary">
          <a href={anchor("#inventory")}>Lots</a>
          <a href={anchor("#floor")} className={highlightAuction ? "current" : ""}>
            Auction
          </a>
          <a href={anchor("#procurement")}>Contact</a>
          {user && user.role !== "admin" && (user.intent === "buyer" || user.intent === "both" || user.intent === null) ? (
            <a href="/buyer/">Buyer</a>
          ) : null}
          {user && user.role !== "admin" && (user.intent === "seller" || user.intent === "both") ? (
            <a href="/seller/">Seller</a>
          ) : null}
          {user && user.role === "admin" ? <a href="/admin/">Admin</a> : null}
        </nav>
        <div className="mast-actions">
          {authStatus === "loading" ? null : user ? (
            <>
              <a className="auth-link mast-auth" href={hubHref} title={user.email}>
                {user.displayName?.trim() ? user.displayName : user.email}
              </a>
              {onSignOut ? (
                <button
                  className="mast-signout"
                  type="button"
                  onClick={() => {
                    void onSignOut();
                  }}
                >
                  Sign out
                </button>
              ) : null}
            </>
          ) : (
            <a className="auth-link mast-auth" href="/login/">
              Sign in
            </a>
          )}
          <button
            className="nav-toggle"
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setMobileNav((value) => !value)}
          >
            {mobileNav ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
