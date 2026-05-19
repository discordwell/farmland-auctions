ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS auction_requested boolean NOT NULL DEFAULT false;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS auction_preferred_window text
    CHECK (
      auction_preferred_window IS NULL
      OR auction_preferred_window IN ('within_two_weeks', 'within_a_month', 'brokers_choice')
    );

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS reserve_price_per_acre_cents bigint
    CHECK (reserve_price_per_acre_cents IS NULL OR reserve_price_per_acre_cents >= 0);

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS mineral_rights_status text
    CHECK (
      mineral_rights_status IS NULL
      OR mineral_rights_status IN ('included', 'excluded', 'partial', 'unknown')
    );

CREATE INDEX IF NOT EXISTS listings_auction_requested_idx
  ON listings (auction_requested)
  WHERE auction_requested = true;
