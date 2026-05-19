ALTER TABLE users
  ADD COLUMN IF NOT EXISTS intent text
    CHECK (intent IS NULL OR intent IN ('buyer', 'seller', 'both'));

CREATE INDEX IF NOT EXISTS users_intent_idx ON users (intent);

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS seller_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS listings_seller_user_idx ON listings (seller_user_id);
