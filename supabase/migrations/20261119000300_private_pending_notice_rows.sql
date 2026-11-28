-- A deliverable pending notice: unsent removal / cancellation rows of a sitting whose student is active in the org with an email.
-- users.email is NOT NULL (001_initial_schema.sql:27); <> '' excludes the only gap. SECURITY INVOKER, references schema-qualified.
-- Single definition for get_pending_removal_notices and get_exam_sitting_summary.
CREATE OR REPLACE FUNCTION private.pending_notice_rows(p_org uuid, p_sitting_id uuid, p_cancelled boolean)
RETURNS TABLE(entry_id uuid, user_id uuid, subject_id uuid, passed_at timestamptz, removed_at timestamptz,
              kind text, code_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT r.entry_id, r.user_id, r.subject_id, r.passed_at, r.removed_at, r.kind, r.code_id
    FROM (
      SELECT (a.metadata ->> 'entry_id')::uuid AS entry_id, (a.metadata ->> 'user_id')::uuid AS user_id,
             (a.metadata ->> 'subject_id')::uuid AS subject_id, (a.metadata ->> 'passed_at')::timestamptz AS passed_at,
             a.created_at AS removed_at, 'entry_auto_removed'::text AS kind, NULL::uuid AS code_id
        FROM public.audit_events a
       WHERE a.organization_id = p_org AND a.resource_id = p_sitting_id
         AND a.event_type = 'exam_sitting.entry_auto_removed'
         AND NOT EXISTS (SELECT 1 FROM public.audit_events n
                          WHERE n.organization_id = p_org AND n.resource_id = p_sitting_id
                            AND n.event_type = 'exam_sitting.notice_emailed'
                            AND n.metadata ->> 'kind' = 'entry_auto_removed'
                            AND n.metadata ->> 'entry_id' = a.metadata ->> 'entry_id')
      UNION ALL
      SELECT e.id, c.student_id, c.subject_id, NULL::timestamptz, c.voided_at, 'sitting_cancelled'::text, c.id
        FROM public.internal_exam_codes c
        JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id AND e.organization_id = p_org AND e.deleted_at IS NULL
       WHERE p_cancelled AND e.sitting_id = p_sitting_id AND c.organization_id = p_org
         AND c.deleted_at IS NULL AND c.consumed_at IS NULL AND c.voided_at IS NOT NULL
         AND c.void_reason = 'sitting_cancelled' AND c.emailed_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.audit_events n
                          WHERE n.organization_id = p_org AND n.resource_id = p_sitting_id
                            AND n.event_type = 'exam_sitting.notice_emailed'
                            AND n.metadata ->> 'kind' IN ('cancelled', 'sitting_cancelled')
                            AND n.metadata ->> 'code_id' = c.id::text)
    ) r
    JOIN public.users u ON u.id = r.user_id AND u.organization_id = p_org AND u.deleted_at IS NULL AND u.email <> '';
$$;
REVOKE EXECUTE ON FUNCTION private.pending_notice_rows(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
