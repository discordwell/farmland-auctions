CREATE UNIQUE INDEX IF NOT EXISTS post_auction_tasks_unique_title_idx
  ON post_auction_tasks (auction_id, title);
