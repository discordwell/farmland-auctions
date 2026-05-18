const sections = [
  {
    title: "Bidder authorization",
    body: "Bidders must register with accurate legal name, contact details, authority to act, and any requested identity, deposit, and proof-of-funds materials before approval."
  },
  {
    title: "Bids",
    body: "Submitted bids are recorded against the bidder account, auction, timestamp, and auction version. Approved bidder limits may cap the maximum accepted bid."
  },
  {
    title: "Auction close",
    body: "Auction status, reserve state, bid increments, close time, and any soft-close extension are controlled by the auction record and server time."
  },
  {
    title: "Post-close",
    body: "The high bidder may be required to complete identity confirmation, deposit handling, purchase documentation, and closing instructions before a transaction is complete."
  },
  {
    title: "Privacy",
    body: "Registration, consent, bid, and inquiry records are retained for brokerage operations, audit history, and transaction administration."
  }
];

export const metadata = {
  title: "Bidder terms | Wyatt Farmland Auctions"
};

export default function BidderTermsPage() {
  return (
    <main className="terms-page">
      <section className="terms-shell">
        <a className="terms-back" href="/">
          ← Back to the floor
        </a>
        <div className="terms-head">
          <div>
            <p className="pre">§04 &nbsp; Bidder terms</p>
            <h1>
              Terms of the <em>bell.</em>
            </h1>
          </div>
        </div>
        <p className="terms-intro">
          Auction-specific bidder packages, seller instructions, and signed agreements control where they differ from this page. The Almanac is the public statement; the signed package is the binding one.
        </p>
        <div className="terms-list">
          {sections.map((section, idx) => (
            <article key={section.title}>
              <div className="num">§04·{String(idx + 1).padStart(2, "0")}</div>
              <div>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
