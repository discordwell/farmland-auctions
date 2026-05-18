import { config } from "./config.js";

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0
});

const SITE_URL = config.publicSiteUrl?.replace(/\/$/, "") || "https://farmauction.discordwell.com";

function htmlShell(body: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body { background: #efe7d3; color: #14201a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px 16px; }
    .wrap { max-width: 560px; margin: 0 auto; background: #f4ecd9; border: 1px solid #14201a; padding: 28px 26px; }
    h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 500; font-size: 1.6rem; letter-spacing: -0.01em; margin: 0 0 14px; }
    p { line-height: 1.55; margin: 0 0 12px; font-size: 1rem; }
    a.btn { display: inline-block; background: #14201a; color: #efe7d3; padding: 10px 18px; text-decoration: none; font-weight: 600; margin-top: 8px; }
    .meta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; color: #5e6453; letter-spacing: 0.04em; margin-top: 22px; padding-top: 16px; border-top: 1px solid #c3b896; }
    .ember { color: #a93826; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrap">
    ${body}
    <div class="meta">Wyatt Farmland Auctions · Regina, SK · ${SITE_URL}</div>
  </div>
</body>
</html>`;
}

export type BidderRegistrationEmail = {
  bidderEmail: string;
  bidderName: string;
  auctionTitle: string;
  auctionId: string;
};

export function bidderRegistrationConfirmation(args: BidderRegistrationEmail) {
  const subject = `Registration received — ${args.auctionTitle}`;
  const text =
    `Hi ${args.bidderName},\n\n` +
    `We've received your registration for ${args.auctionTitle}. ` +
    `Wyatt Realty Group will review your documents and notify you once approved.\n\n` +
    `Sign in any time at ${SITE_URL}/login/ to track your registrations and bids.\n\n` +
    `— Wyatt Farmland Auctions`;
  const html = htmlShell(
    `<h1>Registration received</h1>
     <p>Hi ${args.bidderName},</p>
     <p>We've received your registration for <strong>${args.auctionTitle}</strong>. Wyatt Realty Group will review your documents and notify you once approved.</p>
     <p><a class="btn" href="${SITE_URL}/account/">Track your account →</a></p>`
  );
  return { subject, body: text, htmlBody: html };
}

export type BidderDecisionEmail = {
  bidderEmail: string;
  bidderName: string;
  auctionTitle: string;
  auctionId: string;
  decision: "approved" | "rejected" | "suspended";
  operatorNotes?: string;
};

export function bidderDecisionEmail(args: BidderDecisionEmail) {
  if (args.decision === "approved") {
    const subject = `Approved to bid — ${args.auctionTitle}`;
    const text =
      `Hi ${args.bidderName},\n\n` +
      `You're approved to bid on ${args.auctionTitle}. ` +
      `Sign in at ${SITE_URL}/login/ when the bell opens to place bids.\n\n` +
      `— Wyatt Farmland Auctions`;
    const html = htmlShell(
      `<h1>You're approved to bid</h1>
       <p>Hi ${args.bidderName},</p>
       <p>You're approved to bid on <strong>${args.auctionTitle}</strong>. Sign in when the bell opens to place bids.</p>
       <p><a class="btn" href="${SITE_URL}/login/">Open the floor →</a></p>`
    );
    return { subject, body: text, htmlBody: html };
  }

  const subject = `Registration update — ${args.auctionTitle}`;
  const text =
    `Hi ${args.bidderName},\n\n` +
    `Your registration for ${args.auctionTitle} was not approved at this time.` +
    (args.operatorNotes ? `\n\nNotes: ${args.operatorNotes}` : "") +
    `\n\nReach out to cameron@wyattrealty.ca with questions.\n\n` +
    `— Wyatt Farmland Auctions`;
  const html = htmlShell(
    `<h1>Registration update</h1>
     <p>Hi ${args.bidderName},</p>
     <p>Your registration for <strong>${args.auctionTitle}</strong> was not approved at this time.</p>
     ${args.operatorNotes ? `<p><em>Notes:</em> ${args.operatorNotes}</p>` : ""}
     <p>Reach out to <a href="mailto:cameron@wyattrealty.ca">cameron@wyattrealty.ca</a> with questions.</p>`
  );
  return { subject, body: text, htmlBody: html };
}

export type OutbidEmail = {
  bidderEmail: string;
  bidderName: string;
  auctionTitle: string;
  previousAmountCents: number;
  newHighAmountCents: number;
};

export function outbidNotice(args: OutbidEmail) {
  const subject = `Outbid — ${args.auctionTitle}`;
  const text =
    `Hi ${args.bidderName},\n\n` +
    `Your bid of ${cad.format(args.previousAmountCents / 100)} on ${args.auctionTitle} has been outbid. ` +
    `Current high: ${cad.format(args.newHighAmountCents / 100)}.\n\n` +
    `Place a new bid at ${SITE_URL}/#floor\n\n` +
    `— Wyatt Farmland Auctions`;
  const html = htmlShell(
    `<h1>You've been outbid</h1>
     <p>Hi ${args.bidderName},</p>
     <p>Your bid of <strong>${cad.format(args.previousAmountCents / 100)}</strong> on <strong>${args.auctionTitle}</strong> has been outbid.</p>
     <p>Current high: <span class="ember">${cad.format(args.newHighAmountCents / 100)}</span></p>
     <p><a class="btn" href="${SITE_URL}/#floor">Place a new bid →</a></p>`
  );
  return { subject, body: text, htmlBody: html };
}

export type AuctionClosedEmail = {
  bidderEmail: string;
  bidderName: string;
  auctionTitle: string;
  winningAmountCents: number;
  isWinner: boolean;
};

export function auctionClosedEmail(args: AuctionClosedEmail) {
  if (args.isWinner) {
    const subject = `You won — ${args.auctionTitle}`;
    const text =
      `Hi ${args.bidderName},\n\n` +
      `You won ${args.auctionTitle} at ${cad.format(args.winningAmountCents / 100)}. ` +
      `Wyatt Realty Group will contact you within 24 hours with closing instructions.\n\n` +
      `— Wyatt Farmland Auctions`;
    const html = htmlShell(
      `<h1>You won.</h1>
       <p>Hi ${args.bidderName},</p>
       <p>You won <strong>${args.auctionTitle}</strong> at <strong>${cad.format(args.winningAmountCents / 100)}</strong>.</p>
       <p>Wyatt Realty Group will contact you within 24 hours with closing instructions.</p>`
    );
    return { subject, body: text, htmlBody: html };
  }

  const subject = `Auction closed — ${args.auctionTitle}`;
  const text =
    `Hi ${args.bidderName},\n\n` +
    `${args.auctionTitle} has closed. ` +
    `The winning bid was ${cad.format(args.winningAmountCents / 100)}.\n\n` +
    `Thanks for participating.\n\n` +
    `— Wyatt Farmland Auctions`;
  const html = htmlShell(
    `<h1>Auction closed</h1>
     <p>Hi ${args.bidderName},</p>
     <p><strong>${args.auctionTitle}</strong> has closed. The winning bid was <strong>${cad.format(args.winningAmountCents / 100)}</strong>.</p>
     <p>Thanks for participating.</p>`
  );
  return { subject, body: text, htmlBody: html };
}
