import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auctionClosedEmail,
  bidderDecisionEmail,
  bidderRegistrationConfirmation,
  escapeHtml,
  outbidNotice
} from "../../emailTemplates.js";

describe("escapeHtml", () => {
  it("escapes the five HTML metacharacters", () => {
    assert.equal(
      escapeHtml(`<img src=x onerror="alert(1)">&'`),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;"
    );
  });

  it("passes ordinary names through unchanged", () => {
    assert.equal(escapeHtml("Riverbend Trust"), "Riverbend Trust");
  });
});

describe("bidderRegistrationConfirmation", () => {
  const payload = `<script>alert("x")</script>`;
  const email = bidderRegistrationConfirmation({
    bidderEmail: "evil@example.invalid",
    bidderName: payload,
    auctionTitle: "Smith & Sons quarter",
    auctionId: "00000000-0000-0000-0000-000000000000"
  });

  it("escapes a markup-bearing legal name in the HTML body", () => {
    assert.ok(!email.htmlBody.includes(payload));
    assert.ok(email.htmlBody.includes("&lt;script&gt;"));
  });

  it("renders ampersands in the title as entities in HTML", () => {
    assert.ok(email.htmlBody.includes("Smith &amp; Sons quarter"));
  });

  it("leaves the plain-text body unescaped", () => {
    assert.ok(email.body.includes(payload));
    assert.ok(email.body.includes("Smith & Sons quarter"));
  });
});

describe("bidderDecisionEmail", () => {
  it("escapes operator notes on rejection", () => {
    const email = bidderDecisionEmail({
      bidderEmail: "b@example.invalid",
      bidderName: "Plain Name",
      auctionTitle: "Quarter",
      auctionId: "00000000-0000-0000-0000-000000000000",
      decision: "rejected",
      operatorNotes: `<a href="https://evil.example">verify here</a>`
    });
    assert.ok(!email.htmlBody.includes(`<a href="https://evil.example">`));
    assert.ok(email.htmlBody.includes("&lt;a href="));
  });

  it("omits the notes block when no notes are given", () => {
    const email = bidderDecisionEmail({
      bidderEmail: "b@example.invalid",
      bidderName: "Plain Name",
      auctionTitle: "Quarter",
      auctionId: "00000000-0000-0000-0000-000000000000",
      decision: "rejected"
    });
    assert.ok(!email.htmlBody.includes("Notes:"));
  });

  it("uses the approved template for approvals", () => {
    const email = bidderDecisionEmail({
      bidderEmail: "b@example.invalid",
      bidderName: "Plain Name",
      auctionTitle: "Quarter",
      auctionId: "00000000-0000-0000-0000-000000000000",
      decision: "approved"
    });
    assert.ok(email.subject.startsWith("Approved to bid"));
  });
});

describe("outbidNotice", () => {
  it("formats amounts as whole-dollar CAD and escapes names", () => {
    const email = outbidNotice({
      bidderEmail: "b@example.invalid",
      bidderName: "<b>Bold</b>",
      auctionTitle: "Lipton half-section",
      previousAmountCents: 80_000_000,
      newHighAmountCents: 82_500_000
    });
    // Computed with the template's own formatter so the assertion holds on
    // Node builds whose ICU renders en-CA currency differently.
    const cad = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0
    });
    assert.ok(email.body.includes(cad.format(800_000)));
    assert.ok(email.body.includes(cad.format(825_000)));
    assert.ok(email.htmlBody.includes("&lt;b&gt;Bold&lt;/b&gt;"));
  });
});

describe("auctionClosedEmail", () => {
  it("differentiates winner and non-winner subjects", () => {
    const base = {
      bidderEmail: "b@example.invalid",
      bidderName: "Bidder",
      auctionTitle: "Quarter",
      winningAmountCents: 1_000_000
    };
    assert.ok(auctionClosedEmail({ ...base, isWinner: true }).subject.startsWith("You won"));
    assert.ok(
      auctionClosedEmail({ ...base, isWinner: false }).subject.startsWith("Auction closed")
    );
  });
});
