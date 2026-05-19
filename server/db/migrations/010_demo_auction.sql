ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS auctions_is_demo_idx ON auctions (is_demo) WHERE is_demo;
