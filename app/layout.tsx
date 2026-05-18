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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500;1,6..72,600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
