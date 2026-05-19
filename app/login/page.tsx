"use client";

import { FormEvent, useEffect, useState } from "react";
import { loginRequest } from "../lib/useAuth";

type DemoAccount = {
  role: "admin" | "user";
  label: string;
  email: string;
  password: string;
};

const demoAccounts: DemoAccount[] = [
  {
    role: "admin",
    label: "Demo Admin",
    email: "admin@farmauction.demo",
    password: "admin12345"
  },
  {
    role: "user",
    label: "Demo Buyer",
    email: "buyer@farmauction.demo",
    password: "buyer12345"
  },
  {
    role: "user",
    label: "Demo Seller",
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
          ← Home
        </a>
        <div className="terms-head">
          <div>
            <h1>Sign in</h1>
          </div>
        </div>

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
            <h3>Demo accounts</h3>
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
                      <span className="auth-demo-cta">
                        {isLoading ? "Signing in…" : "Sign in"}{" "}
                        <span className="arrow">→</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}
