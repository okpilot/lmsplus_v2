-- Add question_number column to questions table for external ID tracking
ALTER TABLE questions ADD COLUMN question_number TEXT NULL;

-- Unique per bank — same question_number can't appear twice in the same bank
CREATE UNIQUE INDEX idx_questions_bank_number
  ON questions (bank_id, question_number)
  WHERE deleted_at IS NULL AND question_number IS NOT NULL;
