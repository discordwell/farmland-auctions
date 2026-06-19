import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeNextPath } from "./safeNextPath";

// Control characters / backslash are built from code points rather than typed as
// escapes so the test source can't itself be misread (the exact trap the module
// avoids by screening on code points instead of a regex).
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const BS = String.fromCharCode(92); // backslash
const DEL = String.fromCharCode(127);

const ORIGIN = "https://farmauction.discordwell.com";

describe("safeNextPath — accepts same-site paths", () => {
  const ok = [
    "/account/",
    "/admin/",
    "/buyer/",
    "/seller/",
    "/",
    "/listings/lipton-half-section/",
    "/#inventory",
    "/?q=lipton&region=South%20East",
    "/a/b/c",
    "/path-with-dash/",
    "/0/1/2"
  ];

  for (const path of ok) {
    it(`passes ${JSON.stringify(path)} through unchanged`, () => {
      assert.equal(safeNextPath(path), path);
    });
  }
});

describe("safeNextPath — rejects missing / empty input", () => {
  it("returns '' for null, undefined, and empty string", () => {
    assert.equal(safeNextPath(null), "");
    assert.equal(safeNextPath(undefined), "");
    assert.equal(safeNextPath(""), "");
  });
});

describe("safeNextPath — rejects off-origin redirects", () => {
  it("rejects protocol-relative URLs", () => {
    assert.equal(safeNextPath("//evil.com"), "");
    assert.equal(safeNextPath("//evil.com/path"), "");
  });

  it("rejects absolute URLs with a scheme", () => {
    assert.equal(safeNextPath("http://evil.com"), "");
    assert.equal(safeNextPath("https://evil.com"), "");
    assert.equal(safeNextPath("https:/evil.com"), "");
  });

  it("rejects a path that does not start with a slash", () => {
    assert.equal(safeNextPath("evil.com"), "");
    assert.equal(safeNextPath("account/"), "");
    assert.equal(safeNextPath(" //evil.com"), ""); // leading space, not a slash
  });

  it("rejects javascript:/data: payloads (no leading slash)", () => {
    assert.equal(safeNextPath("javascript:alert(1)"), "");
    assert.equal(safeNextPath("data:text/html,<script>"), "");
  });
});

describe("safeNextPath — closes the backslash bypass", () => {
  // The browser URL parser treats "\" as "/", so "/\evil.com" resolves to
  // "https://evil.com/" — it would slip past a naive !startsWith("//") guard.
  it("rejects a backslash anywhere in the value", () => {
    assert.equal(safeNextPath("/" + BS + "evil.com"), "");
    assert.equal(safeNextPath("/" + BS + "/evil.com"), "");
    assert.equal(safeNextPath(BS + BS + "evil.com"), "");
    assert.equal(safeNextPath(BS + "/evil.com"), "");
  });

  it("the backslash form really would escape the origin if not rejected", () => {
    // Proves the bypass is real: the raw value resolves off-origin, but the
    // guard returns '' so nothing off-origin is ever handed to location.assign.
    assert.equal(new URL("/" + BS + "evil.com", ORIGIN).origin, "https://evil.com");
    assert.equal(safeNextPath("/" + BS + "evil.com"), "");
  });
});

describe("safeNextPath — closes the control-character bypass", () => {
  // Browsers strip TAB/LF/CR mid-URL before parsing, so "/<TAB>/evil.com"
  // collapses to "//evil.com" — another way past a naive check.
  it("rejects TAB/LF/CR (stripped by the URL parser)", () => {
    assert.equal(safeNextPath("/" + TAB + "/evil.com"), "");
    assert.equal(safeNextPath("/" + LF + "//evil.com"), "");
    assert.equal(safeNextPath("/" + CR + "/evil.com"), "");
    assert.equal(safeNextPath(TAB + "//evil.com"), "");
  });

  it("rejects other control characters and DEL", () => {
    assert.equal(safeNextPath("/" + String.fromCharCode(0) + "evil"), "");
    assert.equal(safeNextPath("/" + DEL + "evil"), "");
  });

  it("a control-char form really would collapse off-origin if not rejected", () => {
    assert.equal(new URL("/" + TAB + "/evil.com", ORIGIN).origin, "https://evil.com");
    assert.equal(safeNextPath("/" + TAB + "/evil.com"), "");
  });
});

describe("safeNextPath — security invariant", () => {
  // The core guarantee: whatever safeNextPath RETURNS (non-empty), resolved
  // against any origin, stays on that origin. Exercises the full attack matrix.
  it("never returns a value that resolves off-origin", () => {
    const inputs = [
      "/account/", "/", "/a/b", "/#x", "/?q=1",
      "//evil.com", "http://evil.com", "https://evil.com", "https:/evil.com",
      "/" + BS + "evil.com", "/" + BS + "/evil.com", BS + BS + "evil.com",
      "/" + TAB + "/evil.com", "/" + LF + "//evil.com", "/" + CR + "/evil.com",
      TAB + "//evil.com", " //evil.com", "evil.com", "javascript:alert(1)",
      "/" + String.fromCharCode(0) + "evil", "", "   "
    ];
    for (const input of inputs) {
      const out = safeNextPath(input);
      if (out === "") continue; // rejected — caller uses its default
      assert.equal(new URL(out, ORIGIN).origin, ORIGIN, `escaped origin for ${JSON.stringify(input)}`);
    }
  });
});
