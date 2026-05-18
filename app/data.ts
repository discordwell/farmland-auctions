import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Clock3,
  FileCheck2,
  Gavel,
  MapPin,
  RadioTower,
  ShieldCheck,
  Sprout
} from "lucide-react";

export type ListingStatus = "For Sale" | "Pending" | "Sold" | "Wanted" | "Lease";

export type Listing = {
  id: string;
  title: string;
  rm: string;
  region: "West Central" | "Parkland" | "South East" | "North East";
  acres: number;
  pricePerAcre: number;
  avgAssessment: number;
  soilRating: number;
  type: "Grain" | "Mixed" | "Pasture" | "Lease";
  status: ListingStatus;
  image: string;
  satellite: string;
  coordinates: string;
  highlights: string[];
};

export type Bid = {
  bidder: string;
  amount: number;
  time: string;
};

export type WorkflowStep = {
  title: string;
  detail: string;
  status: "Ready" | "Review" | "Locked";
  icon: LucideIcon;
};

export const listings: Listing[] = [
  {
    id: "sk-quarter-01",
    title: "RM 271 Grain Quarter Package",
    rm: "RM of Coteau No. 255",
    region: "West Central",
    acres: 641,
    pricePerAcre: 3825,
    avgAssessment: 308000,
    soilRating: 61,
    type: "Grain",
    status: "For Sale",
    image: "/images/hero-fields.jpg",
    satellite: "/images/satellite-fields.jpg",
    coordinates: "51.056 N, 107.161 W",
    highlights: ["4 contiguous quarters", "Class H/J soils", "Yard access"]
  },
  {
    id: "sk-quarter-02",
    title: "Moose Range Mixed Land",
    rm: "RM of Moose Range No. 486",
    region: "North East",
    acres: 318,
    pricePerAcre: 2140,
    avgAssessment: 176500,
    soilRating: 47,
    type: "Mixed",
    status: "Pending",
    image: "/images/harvest.jpg",
    satellite: "/images/satellite-fields.jpg",
    coordinates: "52.841 N, 103.988 W",
    highlights: ["Hay and pasture", "Dugout water", "Road on two sides"]
  },
  {
    id: "sk-quarter-03",
    title: "Assiniboia Pasture Block",
    rm: "RM of Lake of the Rivers No. 72",
    region: "South East",
    acres: 962,
    pricePerAcre: 1375,
    avgAssessment: 121250,
    soilRating: 39,
    type: "Pasture",
    status: "Lease",
    image: "/images/pasture.jpg",
    satellite: "/images/satellite-fields.jpg",
    coordinates: "49.617 N, 105.994 W",
    highlights: ["Fenced block", "Seasonal creek", "Leaseback available"]
  }
];

export const bidHistory: Bid[] = [
  { bidder: "Bidder 118", amount: 2285000, time: "10:42:18" },
  { bidder: "Bidder 042", amount: 2260000, time: "10:39:04" },
  { bidder: "Bidder 118", amount: 2235000, time: "10:31:52" },
  { bidder: "Bidder 077", amount: 2210000, time: "10:27:11" }
];

export const workflow: WorkflowStep[] = [
  {
    title: "Listing intake",
    detail: "Broker review, media, RM data, soils, seller authorization",
    status: "Ready",
    icon: FileCheck2
  },
  {
    title: "Bidder approval",
    detail: "Identity, terms, deposit status, auction-specific clearance",
    status: "Review",
    icon: ShieldCheck
  },
  {
    title: "Live close",
    detail: "Server clock, reserve state, soft-close, immutable bid ledger",
    status: "Locked",
    icon: RadioTower
  },
  {
    title: "Contracts",
    detail: "Buyer/seller tasks, signatures, reports, broker audit package",
    status: "Ready",
    icon: BadgeCheck
  }
];

export const metrics = [
  { label: "Qualified bidders", value: "47", icon: Gavel },
  { label: "Active acres", value: "1,921", icon: Sprout },
  { label: "Avg. close window", value: "14m", icon: Clock3 },
  { label: "RM pins loaded", value: "126", icon: MapPin }
];
