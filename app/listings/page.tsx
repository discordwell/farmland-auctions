import { LegacySlugRedirect } from "./LegacySlugRedirect";

export const metadata = {
  title: "Lot detail | Wyatt Farmland Auctions",
  robots: { index: false }
};

export default function ListingsIndexPage() {
  // Old URLs of the form /listings/?slug=foo redirect to /listings/foo/.
  return <LegacySlugRedirect />;
}
