/**
 * Build the draw-prompts queue for the listing-art generation loop.
 *
 * Pattern borrowed from HYPERDRAFT's Mnestic Reset image flow
 * (scripts/_mnr_image_helper.py + _mnr_make_js.py). Emits a
 * `public/images/lots/draw_prompts.json` queue that a browser-driven
 * ChatGPT loop can consume — no OpenAI API key needed.
 *
 * Run:  npx tsx scripts/build_art_prompts.ts
 */

import { promises as fs } from "node:fs";
import path from "node:path";

type LotPromptInput = {
  slug: string;
  title: string;
  rm: string;
  region: string;
  acres: number;
  cultivated: number;
  pasture: number;
  hayland: number;
  bush: number;
  yard: number;
  soil: number;
  status: string;
  season: string;
  notes: string;
};

const STYLE = [
  "Painterly aerial view of a Saskatchewan farmland parcel.",
  "Editorial-cartographic aesthetic — hand-painted gouache with a soft etched-paper feel, not photoreal.",
  "Sun-bleached prairie palette: muted ochres, wheat golds, brown chernozem soil, prairie sage, deep ink shadows.",
  "Township grid lines barely visible like an old land-survey plate. Single quarter section centered.",
  "Sweeping horizon line, big prairie sky, low sun. No people, no text, no logos, no UI."
].join(" ");

function landCharacter(p: LotPromptInput): string {
  const total = Math.max(1, p.acres);
  const parts: string[] = [];
  if (p.cultivated > 0) parts.push(`${Math.round((p.cultivated / total) * 100)}% cultivated cropland in ordered strips`);
  if (p.pasture > 0) parts.push(`${Math.round((p.pasture / total) * 100)}% native pasture with prairie grass texture`);
  if (p.hayland > 0) parts.push(`${Math.round((p.hayland / total) * 100)}% hayland with mown windrows`);
  if (p.bush > 0) parts.push(`${Math.round((p.bush / total) * 100)}% aspen bush and brush along the edge`);
  if (p.yard > 0) parts.push(`a small yard site with bins and a windbreak`);
  return parts.join(", ");
}

function buildPrompt(p: LotPromptInput, output: string): { id: string; output_file: string; prompt: string; meta: LotPromptInput } {
  const composition = landCharacter(p);
  const soilNote =
    p.soil >= 70
      ? "rich heavy black soil"
      : p.soil >= 55
        ? "brown chernozem"
        : p.soil >= 45
          ? "transitional grey-wooded soil"
          : "lighter sandy soil";
  const seasonNote = p.season;
  const statusAccent =
    p.status === "Sold"
      ? "A faint maroon notation in the corner suggesting a closed file."
      : p.status === "Wanted"
        ? "A faint hand-drawn arrow inset, suggesting an active search."
        : p.status === "Lease"
          ? "A pale ochre 'L' notation in the corner, suggesting a leasehold."
          : "";
  const lines = [
    STYLE,
    `Region: ${p.region}, ${seasonNote}. ${soilNote}.`,
    `Land composition: ${composition}.`,
    p.notes ? `Distinguishing features: ${p.notes}.` : "",
    statusAccent,
    "Aspect ratio 3:2, painterly, illustration. Absolutely no text or watermarks in the image."
  ].filter(Boolean);
  return {
    id: p.slug,
    output_file: output,
    prompt: lines.join(" "),
    meta: p
  };
}

const HERO_PROMPT = [
  STYLE,
  "Subject: a wide Saskatchewan farmland horizon at the golden hour — three quarter-sections receding to a low prairie horizon.",
  "Visible elements: a long gravel grid road, a single grain bin clustered with a shelter belt of poplars on the right, fields banded green-gold-brown for canola-wheat-summerfallow rotation, a sliver of slough water reflecting the sky.",
  "Mood: editorial, patient, considered. No people. No text. The kind of scene printed at the head of an almanac.",
  "Aspect ratio 3:2."
].join(" ");

const lots: LotPromptInput[] = [
  {
    slug: "lipton-half-section",
    title: "Lipton half-section",
    rm: "RM Lipton No. 217",
    region: "South · Treaty 4",
    acres: 318.4,
    cultivated: 280,
    pasture: 24,
    hayland: 0,
    bush: 6,
    yard: 8,
    soil: 72,
    status: "For Sale",
    season: "early summer",
    notes: "two contiguous quarters separated by a low fence line, small bin yard with poplar windbreak on the SE corner"
  },
  {
    slug: "caron-north-quarter",
    title: "North Caron quarter",
    rm: "RM Caron No. 162",
    region: "South · Treaty 4",
    acres: 158,
    cultivated: 152,
    pasture: 0,
    hayland: 0,
    bush: 6,
    yard: 0,
    soil: 64,
    status: "Pending",
    season: "late spring, freshly seeded",
    notes: "a single quarter section in pulse rotation; pencil-thin tractor tracks across the field"
  },
  {
    slug: "vanscoy-three-quarter",
    title: "Vanscoy three-quarter",
    rm: "RM Vanscoy No. 345",
    region: "Central · Treaty 6",
    acres: 478.6,
    cultivated: 320,
    pasture: 140,
    hayland: 0,
    bush: 18,
    yard: 0,
    soil: 58,
    status: "For Sale",
    season: "mid summer",
    notes: "three quarters arranged L-shape, two in crop and one in native grass; a barbed-wire perimeter and a dugout pond on the east edge"
  },
  {
    slug: "coalfields-pasture",
    title: "Coalfields pasture",
    rm: "RM Coalfields No. 4",
    region: "South · Treaty 4",
    acres: 240,
    cultivated: 0,
    pasture: 240,
    hayland: 0,
    bush: 0,
    yard: 0,
    soil: 42,
    status: "Lease",
    season: "late summer, dry grass",
    notes: "open shortgrass prairie cross-fenced into three paddocks, two dugouts catching afternoon light, no buildings"
  },
  {
    slug: "buckland-section",
    title: "Buckland section",
    rm: "RM Buckland No. 491",
    region: "Northern grain belt",
    acres: 640,
    cultivated: 600,
    pasture: 0,
    hayland: 30,
    bush: 10,
    yard: 0,
    soil: 70,
    status: "Sold",
    season: "harvest, swathed grain",
    notes: "a full section, deep black soil, long curving swaths cut into the wheat, a single combine on the horizon as a tiny silhouette"
  },
  {
    slug: "snipe-lake-wanted",
    title: "Snipe Lake — buyer wanted",
    rm: "RM Snipe Lake No. 259",
    region: "Central · Treaty 6",
    acres: 160,
    cultivated: 100,
    pasture: 60,
    hayland: 0,
    bush: 0,
    yard: 0,
    soil: 50,
    status: "Wanted",
    season: "spring, snow patches lingering",
    notes: "a representative composite parcel — fields divided by a coulee, distant lake on the horizon hinting at the namesake"
  },
  {
    slug: "eyebrow-quarter",
    title: "Eyebrow quarter",
    rm: "RM Eyebrow No. 193",
    region: "South · Treaty 4",
    acres: 159.8,
    cultivated: 156,
    pasture: 0,
    hayland: 0,
    bush: 4,
    yard: 0,
    soil: 68,
    status: "For Sale",
    season: "early summer canola in bloom",
    notes: "a single cultivated quarter section, brilliant yellow canola bloom, a gravel highway frontage on the south edge"
  },
  {
    slug: "edenwold-half-section",
    title: "Edenwold half-section",
    rm: "RM Edenwold No. 158",
    region: "South · Treaty 4",
    acres: 320,
    cultivated: 296,
    pasture: 0,
    hayland: 18,
    bush: 0,
    yard: 6,
    soil: 75,
    status: "For Sale",
    season: "summer, deep green wheat",
    notes: "two quarters of premium class-1 black chernozem, a shop and 5,000 bu storage bins in the yard, the Regina skyline as a thin dark line on the far horizon"
  },
  {
    slug: "hudson-bay-pasture-lease",
    title: "Hudson Bay grazing lease",
    rm: "RM Hudson Bay No. 394",
    region: "Northern grain belt",
    acres: 480,
    cultivated: 0,
    pasture: 420,
    hayland: 0,
    bush: 60,
    yard: 0,
    soil: 38,
    status: "Lease",
    season: "early autumn, aspen leaves turning gold",
    notes: "aspen parkland transitioning from open pasture to mixed bluff, a clutch of cattle in the middle distance, soft northern light"
  },
  {
    slug: "battle-river-quarter",
    title: "Battle River quarter",
    rm: "RM Battle River No. 438",
    region: "Northern grain belt",
    acres: 160,
    cultivated: 142,
    pasture: 0,
    hayland: 0,
    bush: 18,
    yard: 0,
    soil: 62,
    status: "For Sale",
    season: "late summer, grain ripening",
    notes: "a quarter section with a poplar bluff along the north edge transitioning to grey-wooded soil, a coulee draining toward the Battle River"
  }
];

const entries = [
  {
    id: "hero",
    output_file: "hero.png",
    prompt: HERO_PROMPT,
    meta: { kind: "hero" as const }
  },
  ...lots.map((lot) => buildPrompt(lot, `${lot.slug}.png`))
];

async function main() {
  const queueDir = path.resolve(process.cwd(), "public/images/lots");
  await fs.mkdir(queueDir, { recursive: true });
  const queuePath = path.join(queueDir, "draw_prompts.json");
  const payload = {
    generated_at: new Date().toISOString(),
    style: STYLE,
    aspect_ratio: "3:2",
    notes: [
      "Drive these prompts through the ChatGPT web interface (logged-in session).",
      "Pattern: HYPERDRAFT/scripts/_mnr_image_helper.py + _mnr_make_js.py",
      "Save each generated PNG into public/images/lots/<output_file> at >=10KB"
    ],
    entries
  };
  await fs.writeFile(queuePath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${entries.length} prompts to ${queuePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
