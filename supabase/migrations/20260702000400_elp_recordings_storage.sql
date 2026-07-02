-- Migration (storage): AI ICAO ELP — elp-recordings bucket + RLS (Slice 0).
--
-- PRIVATE bucket (signed-URL reads only — never public). Audio answers are stored
-- at {org_id}/{student_id}/{session_id}/{section_no}.<ext>, so:
--   (storage.foldername(name))[1] = org_id, [2] = student_id (owner), [3] = session_id.
--
-- Owner scope is the load-bearing term ([2] = auth.uid()); the [1] = org term is
-- defense-in-depth (mirrors 20260324000055 org-scope fix). Recordings are immutable
-- answers — students may INSERT (upload) + SELECT own, but NOT update/delete. The
-- grader Edge Function reads via the service-role key, which bypasses storage RLS.
-- Lives in supabase/migrations only (storage schema is not in the packages/db mirror).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'elp-recordings', 'elp-recordings', false,
  26214400,  -- ~25 MiB per recording
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- Student uploads to their own {org}/{student}/... prefix only.
CREATE POLICY elp_recordings_student_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'elp-recordings'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Student reads own recordings.
CREATE POLICY elp_recordings_student_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'elp-recordings'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Instructor/admin reads recordings in their own org (for review).
CREATE POLICY elp_recordings_staff_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'elp-recordings'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );
