-- exam_sittings + exam_sitting_candidates + exam_sitting_entries. Written only by SECURITY DEFINER RPCs. Status is generated.

CREATE TABLE public.exam_sittings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id),
  scheduled_at        timestamptz NOT NULL,
  mode                text NOT NULL CHECK (mode IN ('remote', 'in_person')),
  invigilator_id      uuid NOT NULL REFERENCES public.users(id),
  permitted_materials text CHECK (permitted_materials IS NULL OR char_length(permitted_materials) BETWEEN 1 AND 1000),
  started_at          timestamptz,
  started_by          uuid REFERENCES public.users(id),
  closed_at           timestamptz,
  closed_by           uuid REFERENCES public.users(id),
  created_by          uuid NOT NULL REFERENCES public.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  deleted_by          uuid REFERENCES public.users(id),
  ended_automatically boolean NOT NULL DEFAULT false,
  status              text GENERATED ALWAYS AS (
    CASE WHEN deleted_at IS NOT NULL THEN 'cancelled'
         WHEN closed_at IS NOT NULL THEN 'closed'
         WHEN started_at IS NOT NULL THEN 'open'
         ELSE 'scheduled' END
  ) STORED,
  CONSTRAINT exam_sittings_started_pair CHECK ((started_at IS NULL) = (started_by IS NULL)),
  CONSTRAINT exam_sittings_closed_pair CHECK ((closed_at IS NULL) = (closed_by IS NULL)),
  CONSTRAINT exam_sittings_deleted_pair CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
  CONSTRAINT exam_sittings_closed_needs_started CHECK (closed_at IS NULL OR started_at IS NOT NULL),
  CONSTRAINT exam_sittings_auto_ended CHECK (NOT ended_automatically OR closed_at IS NOT NULL OR deleted_at IS NOT NULL),
  CONSTRAINT exam_sittings_closed_not_cancelled CHECK (NOT (closed_at IS NOT NULL AND deleted_at IS NOT NULL)),
  UNIQUE (id, organization_id)
);
CREATE INDEX idx_exam_sittings_org_scheduled ON public.exam_sittings (organization_id, scheduled_at DESC);
CREATE INDEX idx_exam_sittings_invigilator ON public.exam_sittings (invigilator_id) WHERE deleted_at IS NULL;

CREATE TABLE public.exam_sitting_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sitting_id      uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES public.users(id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES public.users(id),
  FOREIGN KEY (sitting_id, organization_id) REFERENCES public.exam_sittings (id, organization_id)
);
CREATE UNIQUE INDEX exam_sitting_candidates_live_uniq
  ON public.exam_sitting_candidates (sitting_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_exam_sitting_candidates_user ON public.exam_sitting_candidates (user_id);

CREATE TABLE public.exam_sitting_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sitting_id      uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES public.users(id),
  subject_id      uuid NOT NULL REFERENCES public.easa_subjects(id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES public.users(id),
  FOREIGN KEY (sitting_id, organization_id) REFERENCES public.exam_sittings (id, organization_id),
  UNIQUE (id, organization_id, subject_id, user_id)
);
CREATE UNIQUE INDEX exam_sitting_entries_live_uniq
  ON public.exam_sitting_entries (sitting_id, user_id, subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_exam_sitting_entries_sitting ON public.exam_sitting_entries (sitting_id);
CREATE INDEX idx_exam_sitting_entries_user ON public.exam_sitting_entries (user_id);
CREATE INDEX idx_exam_sitting_entries_org_subject ON public.exam_sitting_entries (organization_id, subject_id);

ALTER TABLE public.exam_sittings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sittings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sitting_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sitting_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sitting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sitting_entries FORCE ROW LEVEL SECURITY;

-- No deleted_at filter: cancelled sittings stay listable for admins.
CREATE POLICY admin_read_org_exam_sittings ON public.exam_sittings
  FOR SELECT TO authenticated
  USING (
    (SELECT is_admin())
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL
    )
  );

CREATE POLICY admin_read_org_exam_sitting_candidates ON public.exam_sitting_candidates
  FOR SELECT TO authenticated
  USING (
    (SELECT is_admin())
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY user_read_own_exam_sitting_candidates ON public.exam_sitting_candidates
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

CREATE POLICY exam_sitting_candidates_select_active_caller ON public.exam_sitting_candidates
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));

CREATE POLICY admin_read_org_exam_sitting_entries ON public.exam_sitting_entries
  FOR SELECT TO authenticated
  USING (
    (SELECT is_admin())
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY user_read_own_exam_sitting_entries ON public.exam_sitting_entries
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

CREATE POLICY exam_sittings_select_active_caller ON public.exam_sittings
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY exam_sitting_entries_select_active_caller ON public.exam_sitting_entries
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));

REVOKE ALL ON public.exam_sittings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.exam_sitting_candidates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.exam_sitting_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, organization_id, scheduled_at, mode, invigilator_id, permitted_materials, status,
              started_at, closed_at, created_at, updated_at, deleted_at, ended_automatically)
  ON public.exam_sittings TO authenticated;
GRANT SELECT (id, organization_id, sitting_id, user_id, subject_id, added_at, deleted_at)
  ON public.exam_sitting_entries TO authenticated;
GRANT SELECT (id, organization_id, sitting_id, user_id, added_at, deleted_at)
  ON public.exam_sitting_candidates TO authenticated;
