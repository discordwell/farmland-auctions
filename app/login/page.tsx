"use client";

import { FormEvent, useEffect, useState } from "react";
import { loginRequest } from "../lib/useAuth";

type DemoAccount = {
  role: "admin" | "user";
  label: string;
  blurb: string;
  email: string;
  password: string;
};

const demoAccounts: DemoAccount[] = [
  {
    role: "admin",
    label: "Demo Admin",
    blurb: "Operator console: listings, auctions, bidder approvals.",
    email: "admin@farmauction.demo",
    password: "admin12345"
  },
  {
    role: "user",
    label: "Demo Buyer",
    blurb: "Bidder dashboard: watchlist, auction registrations, bid ledger.",
    email: "buyer@farmauction.demo",
    password: "buyer12345"
  },
  {
    role: "user",
    label: "Demo Seller",
    blurb: "Vendor view of inquiries and post-auction next steps.",
    email: "seller@farmauction.demo",
    password: "seller12345"
  }
];

function readNextParam(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return "";
  // Only honor same-site paths to avoid open-redirect surprises.
  if (!next.startsWith("/") || next.startsWith("//")) return "";
  return next;
}

function redirectAfterLogin(role: "admin" | "user") {
  const next = readNextParam();
  if (next) {
    window.location.assign(next);
    return;
  }
  window.location.assign(role === "admin" ? "/admin/" : "/account/");
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickSignIn, setQuickSignIn] = useState<string>("");

  useEffect(() => {
    document.title = "Sign in | Wyatt Farmland Auctions";
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const user = await loginRequest(email.trim(), password);
      redirectAfterLogin(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setIsSubmitting(false);
    }
  }

  async function signInAs(account: DemoAccount) {
    if (quickSignIn || isSubmitting) return;
    setError("");
    setQuickSignIn(account.email);
    try {
      const user = await loginRequest(account.email, account.password);
      redirectAfterLogin(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setQuickSignIn("");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <a className="terms-back" href="/">
          ← Back to the floor
        </a>
        <div className="terms-head">
          <div>
            <p className="pre">
              <span className="sign">§05 &nbsp; Sign in</span>
            </p>
            <h1>
              The <em>operator&apos;s</em> door.
            </h1>
          </div>
        </div>
        <p className="terms-intro">
          Approved bidders sign in to track applications, watch bid status, and review post-close instructions. Wyatt operators sign in for the admin console.
        </p>

        <div className="auth-grid">
          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@operations.ca"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <button
              className="btn btn-primary auth-submit"
              type="submit"
              disabled={isSubmitting || Boolean(quickSignIn)}
            >
              {isSubmitting ? "Signing in" : "Sign in"} <span className="arrow">→</span>
            </button>
            {error ? <p className="form-status">{error}</p> : null}
            <p className="auth-foot">
              Don&apos;t have an account? <a href="/signup/">Sign up</a>
            </p>
          </form>

          <aside className="auth-aside">
            <p className="pre">Demo · one-click sign-in</p>
            <h3>Skip the password</h3>
            <p className="auth-aside-lede">
              Three demo personas wired to live data. Click a role to drop straight into the
              session it owns.
            </p>
            <ul className="auth-demo-list">
              {demoAccounts.map((account) => {
                const isLoading = quickSignIn === account.email;
                return (
                  <li key={account.email}>
                    <button
                      type="button"
                      className="auth-demo-btn"
                      onClick={() => signInAs(account)}
                      disabled={Boolean(quickSignIn) || isSubmitting}
                      aria-busy={isLoading}
                    >
                      <span className="auth-demo-role">{account.label}</span>
                      <span className="auth-demo-blurb">{account.blurb}</span>
                      <span className="auth-demo-cta">
                        {isLoading ? "Signing in…" : "Sign in as this user"}{" "}
                        <span className="arrow">→</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="auth-aside-note">
              Sessions persist in an <code>HttpOnly</code> session cookie. Sign out clears it
              immediately.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
