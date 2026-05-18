-- 006_listing_photos.sql
-- Multi-photo support per listing.

CREATE TABLE IF NOT EXISTS listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_photos_listing_position_idx
  ON listing_photos (listing_id, position);
