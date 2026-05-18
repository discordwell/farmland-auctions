ALTER TABLE bidders
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS mailing_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS identity_document_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS proof_of_funds_url text NOT NULL DEFAULT '';

ALTER TABLE auction_bidder_authorizations
  ADD COLUMN IF NOT EXISTS proof_of_funds_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS deposit_reference text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terms_version text NOT NULL DEFAULT '2026-05-18',
  ADD COLUMN IF NOT EXISTS bidder_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS operator_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_outbox_status_created_idx
  ON notification_outbox (status, created_at DESC);
