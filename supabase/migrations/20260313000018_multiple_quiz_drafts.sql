-- Allow multiple quiz drafts per student (up to 20, enforced at app level)
-- Previously limited to 1 draft via UNIQUE (student_id). That constraint is dropped here.

ALTER TABLE quiz_drafts DROP CONSTRAINT quiz_drafts_student_id_key;

-- Max 20 drafts per student is enforced in the saveDraft server action,
-- not at the DB level. RLS policies already scope access to student_id = auth.uid().
