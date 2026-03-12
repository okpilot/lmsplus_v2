-- Add incorrect-answer tracking columns to fsrs_cards.
-- Used by quiz question filters (unseen / incorrectly answered).

ALTER TABLE fsrs_cards
  ADD COLUMN IF NOT EXISTS last_was_correct BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS consecutive_correct_count INT NOT NULL DEFAULT 0;
