CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  brokerage text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  rm text NOT NULL,
  region text NOT NULL,
  acres numeric(12,2) NOT NULL CHECK (acres > 0),
  price_per_acre_cents bigint NOT NULL CHECK (price_per_acre_cents >= 0),
  avg_assessment_per_quarter_cents bigint NOT NULL CHECK (avg_assessment_per_quarter_cents >= 0),
  soil_final_rating integer NOT NULL CHECK (soil_final_rating BETWEEN 0 AND 100),
  property_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('For Sale', 'Pending', 'Sold', 'Wanted', 'Lease')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  hero_image_url text NOT NULL,
  satellite_image_url text NOT NULL,
  description text NOT NULL DEFAULT '',
  agent_id uuid REFERENCES agents(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listing_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  body text NOT NULL,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bidders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  phone text,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'registration', 'open', 'paused', 'closed', 'settled')),
  auction_type text NOT NULL DEFAULT 'live'
    CHECK (auction_type IN ('live', 'sealed')),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  soft_close_seconds integer NOT NULL DEFAULT 300 CHECK (soft_close_seconds >= 0),
  bid_increment_cents bigint NOT NULL DEFAULT 2500000 CHECK (bid_increment_cents > 0),
  reserve_price_cents bigint NOT NULL DEFAULT 0 CHECK (reserve_price_cents >= 0),
  reserve_visibility text NOT NULL DEFAULT 'met-only'
    CHECK (reserve_visibility IN ('hidden', 'met-only', 'public')),
  current_high_bid_id uuid,
  current_high_bid_cents bigint NOT NULL DEFAULT 0 CHECK (current_high_bid_cents >= 0),
  current_high_bidder_id uuid REFERENCES bidders(id),
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

CREATE TABLE IF NOT EXISTS auction_bidder_authorizations (
  auction_id uuid NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL REFERENCES bidders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  max_bid_cents bigint,
  deposit_status text NOT NULL DEFAULT 'not_required'
    CHECK (deposit_status IN ('not_required', 'pending', 'verified', 'waived')),
  terms_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auction_id, bidder_id)
);

CREATE TABLE IF NOT EXISTS bid_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL REFERENCES bidders(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  bid_type text NOT NULL DEFAULT 'live' CHECK (bid_type IN ('live', 'sealed')),
  idempotency_key text NOT NULL,
  accepted boolean NOT NULL,
  rejection_reason text,
  auction_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auction_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS auction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid REFERENCES auctions(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_auction_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  title text NOT NULL,
  assignee_role text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'blocked')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  file_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  consent_newsletter boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS newsletter_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  consent_source text NOT NULL,
  consent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listings_filter_idx
  ON listings (status, region, property_type, soil_final_rating);

CREATE INDEX IF NOT EXISTS auctions_status_close_idx
  ON auctions (status, closes_at);

CREATE INDEX IF NOT EXISTS bid_events_auction_created_idx
  ON bid_events (auction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auction_events_auction_created_idx
  ON auction_events (auction_id, created_at DESC);
