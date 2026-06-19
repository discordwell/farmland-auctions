/**
 * Pure open-redirect guard for the post-login `?next=` parameter.
 *
 * After sign-in the login page redirects to the `next` query param so a user who
 * was bounced to `/login/?next=/account/` lands back where they meant to go. That
 * value is attacker-controllable (it rides in on the URL), so before it reaches
 * `window.location.assign` it must be proven to be a same-site path — otherwise a
 * crafted link like `/login/?next=//evil.com` turns the trusted login page into
 * an open redirect (CWE-601), a classic post-auth phishing vector.
 *
 * `safeNextPath` returns the value only if it is an absolute same-site path, and
 * the empty string (caller falls back to its default destination) otherwise. It
 * is the single, side-effect-free, unit-tested decision — the same zero-infra
 * approach as `listingFilter`/`server/bidRules` — so the rule is documented and
 * testable without a DOM or a browser.
 *
 * Why a naive `startsWith("/") && !startsWith("//")` check is NOT enough: the
 * browser's URL parser normalizes a backslash to a forward slash and strips
 * TAB/LF/CR mid-URL *before* resolving. So `"/\\evil.com"` resolves to
 * `https://evil.com/`, and `"/<TAB>/evil.com"` collapses to `"//evil.com"` — both
 * pass the naive check yet escape the origin. This guard therefore rejects every
 * control character and backslash outright (a legitimate in-app path contains
 * none) and then requires a single leading slash that is not followed by another.
 *
 * Implemented with `charCodeAt` rather than a regex on purpose: the character
 * set it screens for (control chars, DEL, backslash) is exactly the set that is
 * easy to get wrong when escaping a regex literal, so the checks are spelled out
 * against explicit code points.
 */

const SLASH = 47; // "/"
const BACKSLASH = 92; // "\"  (browsers parse this as "/")
const DEL = 127;
const FIRST_PRINTABLE = 0x20; // everything below this is a C0 control char

/**
 * Returns `next` when it is a safe absolute same-site path (e.g. `/account/`,
 * `/?q=x#inventory`), or `""` when it is missing or could navigate off-origin.
 * The empty string signals the caller to use its own default destination.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "";

  for (let i = 0; i < next.length; i += 1) {
    const code = next.charCodeAt(i);
    // Control chars (TAB/LF/CR are silently stripped by the URL parser) and the
    // backslash (parsed as "/") can each turn a leading-slash path into the
    // protocol-relative "//evil.com" — reject them anywhere in the value.
    if (code < FIRST_PRINTABLE || code === DEL || code === BACKSLASH) return "";
  }

  // Must be one leading slash (an absolute same-site path), never "//…".
  if (next.charCodeAt(0) !== SLASH || next.charCodeAt(1) === SLASH) return "";

  return next;
}
