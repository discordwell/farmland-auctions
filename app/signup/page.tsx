"use client";

import { FormEvent, useEffect, useState } from "react";
import { signupRequest, type UserIntent } from "../lib/useAuth";

type IntentChoice = Exclude<UserIntent, null>;

const intentOptions: Array<{ value: IntentChoice; label: string; blurb: string }> = [
  { value: "buyer", label: "Buying", blurb: "Watch lots, register, bid." },
  { value: "seller", label: "Selling", blurb: "List a property, take inquiries." },
  { value: "both", label: "Both", blurb: "I do both sides." }
];

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [intent, setIntent] = useState<IntentChoice>("buyer");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Sign up | Wyatt Farmland Auctions";
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      const user = await signupRequest(email.trim(), password, displayName.trim(), intent);
      const next = user.intent === "seller" ? "/seller/" : "/buyer/";
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      setIsSubmitting(false);
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
            <h1>Sign up</h1>
          </div>
        </div>

        <div className="auth-grid">
          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="auth-name">Display name</label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Optional — how Wyatt addresses you"
              />
            </div>
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
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="field">
              <span className="label-text">I&apos;m here for</span>
              <div className="intent-pills" role="radiogroup" aria-label="What brings you here">
                {intentOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={intent === option.value}
                    className={`intent-pill${intent === option.value ? " on" : ""}`}
                    onClick={() => setIntent(option.value)}
                  >
                    <span className="intent-pill-label">{option.label}</span>
                    <span className="intent-pill-blurb">{option.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="btn btn-primary auth-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating account" : "Create account"}{" "}
              <span className="arrow">→</span>
            </button>
            {error ? <p className="form-status">{error}</p> : null}
            <p className="auth-foot">
              Already registered? <a href="/login/">Sign in</a>
            </p>
          </form>

          <aside className="auth-aside">
            <h3>Bidder account</h3>
            <ul className="auth-aside-list">
              <li>Identity, deposit, and proof-of-funds happen later, per auction.</li>
              <li>Authorization is at Wyatt&apos;s discretion.</li>
              <li>By signing up you accept the <a href="/bidder-terms/">bidder terms</a>.</li>
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}
