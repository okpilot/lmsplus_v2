-- Internal Exam Mode — issuance code table.
-- Admin issues a one-time short code; student redeems it to start an
-- internal_exam quiz_session. Code is the audit-trail anchor between admin
-- issuance and student attempt.
--
-- Writes go through SECURITY DEFINER RPCs (issue_internal_exam_code,
-- start_internal_exam_session, void_internal_exam_code). RLS allows reads
-- for the owning student (active codes only) and the admin org. UPDATE policy
-- supports any future admin tooling that touches rows directly. No INSERT or
-- DELETE policies — issuance and consumption are RPC-only.

CREATE TABLE public.internal_exam_codes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL UNIQUE,
  subject_id           uuid NOT NULL REFERENCES public.easa_subjects(id),
  student_id           uuid NOT NULL REFERENCES public.users(id),
  issued_by            uuid NOT NULL REFERENCES public.users(id),
  issued_at            timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  consumed_at          timestamptz,
  consumed_session_id  uuid REFERENCES public.quiz_sessions(id),
  voided_at            timestamptz,
  voided_by            uuid REFERENCES public.users(id),
  void_reason          text,
  organization_id      uuid NOT NULL REFERENCES public.organizations(id),
  deleted_at           timestamptz,
  CONSTRAINT consumed_pair_consistency
    CHECK ((consumed_at IS NULL) = (consumed_session_id IS NULL)),
  CONSTRAINT voided_pair_consistency
    CHECK ((voided_at IS NULL) = (voided_by IS NULL))
);

CREATE INDEX idx_internal_exam_codes_active
  ON public.internal_exam_codes (student_id, expires_at)
  WHERE consumed_at IS NULL
    AND voided_at IS NULL
    AND deleted_at IS NULL;

CREATE INDEX idx_internal_exam_codes_org
  ON public.internal_exam_codes (organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.internal_exam_codes ENABLE ROW LEVEL SECURITY;

-- Student reads their own active (un-consumed, un-voided, un-expired) codes.
CREATE POLICY student_read_active_codes
  ON public.internal_exam_codes
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    AND consumed_at IS NULL
    AND voided_at IS NULL
    AND expires_at > now()
    AND deleted_at IS NULL
  );

-- Admin reads codes for their org.
CREATE POLICY admin_read_org_codes
  ON public.internal_exam_codes
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = auth.uid() AND u.deleted_at IS NULL
    )
  );

-- Admin direct UPDATE — supports tooling that may touch rows outside the
-- canonical RPCs. Production writes go via SECURITY DEFINER RPCs.
CREATE POLICY admin_update_org_codes
  ON public.internal_exam_codes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = auth.uid() AND u.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.is_admin()
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = auth.uid() AND u.deleted_at IS NULL
    )
  );

GRANT SELECT, UPDATE ON public.internal_exam_codes TO authenticated;
