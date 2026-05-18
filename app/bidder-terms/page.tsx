import { ArrowLeft, FileCheck2 } from "lucide-react";

const sections = [
  {
    title: "Bidder Authorization",
    body: "Bidders must register with accurate legal name, contact details, authority to act, and any requested identity, deposit, and proof-of-funds materials before approval."
  },
  {
    title: "Bids",
    body: "Submitted bids are recorded against the bidder account, auction, timestamp, and auction version. Approved bidder limits may cap the maximum accepted bid."
  },
  {
    title: "Auction Close",
    body: "Auction status, reserve state, bid increments, close time, and any soft-close extension are controlled by the auction record and server time."
  },
  {
    title: "Post-Close",
    body: "The high bidder may be required to complete identity confirmation, deposit handling, purchase documentation, and closing instructions before a transaction is complete."
  },
  {
    title: "Privacy",
    body: "Registration, consent, bid, and inquiry records are retained for brokerage operations, audit history, and transaction administration."
  }
];

export default function BidderTermsPage() {
  return (
    <main className="terms-page">
      <section className="terms-shell">
        <a className="secondary-button" href="/">
          <ArrowLeft size={18} />
          Back
        </a>
        <div className="terms-head">
          <FileCheck2 size={28} />
          <div>
            <p className="eyebrow">Wyatt Farmland Auctions</p>
            <h1>Bidder Terms</h1>
          </div>
        </div>
        <p className="terms-intro">
          Auction-specific bidder packages, seller instructions, and signed agreements control where they differ from this page.
        </p>
        <div className="terms-list">
          {sections.map((section) => (
            <article key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
