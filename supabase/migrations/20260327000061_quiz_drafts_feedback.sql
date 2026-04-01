-- Add optional feedback column to quiz_drafts for persisting per-question
-- answer feedback (isCorrect, correctOptionId, explanationText, explanationImageUrl).
-- This allows resuming a draft with feedback already shown for answered questions.
ALTER TABLE quiz_drafts ADD COLUMN IF NOT EXISTS feedback JSONB;
