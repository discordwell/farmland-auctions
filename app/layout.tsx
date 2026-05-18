import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wyatt Farmland Auctions | Saskatchewan Farmland Listings",
  description:
    "A Saskatchewan farmland listings and auction platform for Wyatt Realty Group.",
  metadataBase: new URL("https://farmauction.discordwell.com"),
  openGraph: {
    title: "Wyatt Farmland Auctions",
    description:
      "Listings, bidder registration, live farmland auctions, and post-auction workflows for Saskatchewan land.",
    url: "https://farmauction.discordwell.com",
    siteName: "Wyatt Farmland Auctions",
    images: [
      {
        url: "/images/hero-fields.jpg",
        width: 1600,
        height: 900,
        alt: "Saskatchewan farmland at sunset"
      }
    ],
    locale: "en_CA",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Wyatt Farmland Auctions",
    description:
      "Saskatchewan farmland listings, bidder registration, and live auction workflows.",
    images: ["/images/hero-fields.jpg"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
