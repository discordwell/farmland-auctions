-- 008_land_composition.sql
-- Replace the made-up property_type taxonomy with real Saskatchewan land composition.
-- A quarter section can be partially cultivated, partially pasture, partially hayland, etc.
-- The total typically matches `acres` but doesn't have to (legal vs. arable acres).
-- Also add legal_description (LLD) which is the standard SK identifier instead of street addresses.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS legal_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS acres_cultivated numeric(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acres_pasture    numeric(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acres_hayland    numeric(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acres_bush       numeric(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acres_yard       numeric(8, 2) NOT NULL DEFAULT 0;

-- Drop the made-up property_type column. The composition fields above are the standard SK breakdown.
-- Existing rows will be repopulated by `npm run db:seed` immediately after this migration.
ALTER TABLE listings DROP COLUMN IF EXISTS property_type;

-- Replace the index that referenced property_type.
DROP INDEX IF EXISTS listings_filter_idx;
CREATE INDEX IF NOT EXISTS listings_filter_idx
  ON listings (status, region, soil_final_rating);
