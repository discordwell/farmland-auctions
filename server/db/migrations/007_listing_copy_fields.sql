-- 007_listing_copy_fields.sql
-- Additional listing copy fields for the detail page provenance panel.
-- Buyers ask for these on every file; capturing them inline saves the back-and-forth.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS water_source text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_operator text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_sale_price_cents bigint,
  ADD COLUMN IF NOT EXISTS last_sale_date date,
  ADD COLUMN IF NOT EXISTS zoning text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mineral_rights text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS encumbrances text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seo_description text NOT NULL DEFAULT '';
