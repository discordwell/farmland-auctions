"use client";

import { FormEvent, useEffect, useState } from "react";
import { loginRequest } from "../lib/useAuth";

function readNextParam(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return "";
  // Only honor same-site paths to avoid open-redirect surprises.
  if (!next.startsWith("/") || next.startsWith("//")) return "";
  return next;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Sign in | Wyatt Farmland Auctions";
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const user = await loginRequest(email.trim(), password);
      const next = readNextParam();
      if (next) {
        window.location.assign(next);
        return;
      }
      window.location.assign(user.role === "admin" ? "/admin/" : "/account/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setIsSubmitting(false);
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
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in" : "Sign in"} <span className="arrow">→</span>
            </button>
            {error ? <p className="form-status">{error}</p> : null}
            <p className="auth-foot">
              Don&apos;t have an account? <a href="/signup/">Sign up</a>
            </p>
          </form>

          <aside className="auth-aside">
            <p className="pre">Demo credentials</p>
            <h3>Two seeded accounts</h3>
            <p className="auth-aside-lede">
              For the staging demo, two roles are wired to the live auction floor.
            </p>
            <dl className="auth-creds">
              <div>
                <dt>Operator</dt>
                <dd>
                  <code>admin@farmauction.demo</code>
                  <code>admin12345</code>
                </dd>
              </div>
              <div>
                <dt>Bidder</dt>
                <dd>
                  <code>bidder@farmauction.demo</code>
                  <code>bidder12345</code>
                </dd>
              </div>
            </dl>
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
