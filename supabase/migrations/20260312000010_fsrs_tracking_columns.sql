-- Add incorrect-answer tracking columns to fsrs_cards.
-- Used by quiz question filters (unseen / incorrectly answered).
-- Note: last_was_correct is nullable — existing rows become NULL (unknown),
-- not false. Values self-correct on the next answer submission.

ALTER TABLE fsrs_cards
  ADD COLUMN IF NOT EXISTS last_was_correct BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS consecutive_correct_count INT NOT NULL DEFAULT 0;
