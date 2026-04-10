-- #382: Ensure the question-images storage bucket exists.
-- Policies were added in migrations 053/055 but the bucket itself
-- was only created manually in the dashboard. This makes local dev
-- and CI environments work without manual bucket creation.
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;
