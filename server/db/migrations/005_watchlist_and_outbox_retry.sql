-- 005_watchlist_and_outbox_retry.sql
-- Add bidder watchlist + outbox retry columns.

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS html_body text;

CREATE INDEX IF NOT EXISTS notification_outbox_next_attempt_idx
  ON notification_outbox (status, next_attempt_at)
  WHERE status IN ('queued', 'failed');

CREATE TABLE IF NOT EXISTS bidder_watchlist (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS bidder_watchlist_user_idx ON bidder_watchlist (user_id);
CREATE INDEX IF NOT EXISTS bidder_watchlist_listing_idx ON bidder_watchlist (listing_id);
