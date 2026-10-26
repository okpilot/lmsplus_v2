-- courses + course_enrolments: global course reference rows, org-scoped soft-deleted enrolments, set_user_enrolments RPC; drops unused legacy courses/lessons. #1635

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lessons) OR EXISTS (SELECT 1 FROM public.courses) THEN
    RAISE EXCEPTION 'legacy courses/lessons hold rows';
  END IF;
END $$;

DROP TABLE public.lessons;
DROP TABLE public.courses;

CREATE TABLE public.courses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]+$'),
  name       text NOT NULL,
  short      text NOT NULL,
  sort_order int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.courses (id, code, name, short, sort_order) VALUES
  ('c0a5e000-0000-4000-8000-000000000001', 'PPL_A',  'PPL(A)',  'PPL', 1),
  ('c0a5e000-0000-4000-8000-000000000002', 'VFR_RT', 'VFR RT',  'RT',  2),
  ('c0a5e000-0000-4000-8000-000000000003', 'ATPL_A', 'ATPL(A)', 'ATPL', 3);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses FORCE ROW LEVEL SECURITY;
CREATE POLICY courses_select ON public.courses
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
GRANT SELECT ON public.courses TO authenticated;

ALTER TABLE public.easa_subjects
  ADD COLUMN course_id uuid NOT NULL DEFAULT 'c0a5e000-0000-4000-8000-000000000001'
  REFERENCES public.courses(id);
UPDATE public.easa_subjects SET course_id = 'c0a5e000-0000-4000-8000-000000000002' WHERE code = 'RT';
CREATE INDEX idx_easa_subjects_course_id ON public.easa_subjects (course_id);

CREATE TABLE public.course_enrolments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES public.courses(id),
  enrolled_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX course_enrolments_active_uniq
  ON public.course_enrolments (user_id, course_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_course_enrolments_course_id ON public.course_enrolments (course_id);
CREATE INDEX idx_course_enrolments_organization_id ON public.course_enrolments (organization_id);

ALTER TABLE public.course_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrolments FORCE ROW LEVEL SECURITY;

CREATE POLICY user_read_own_enrolments ON public.course_enrolments
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

CREATE POLICY admin_read_org_enrolments ON public.course_enrolments
  FOR SELECT TO authenticated
  USING (
    (SELECT is_admin())
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY course_enrolments_select_active_caller ON public.course_enrolments
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));

GRANT SELECT ON public.course_enrolments TO authenticated;

INSERT INTO public.course_enrolments (organization_id, user_id, course_id)
SELECT u.organization_id, u.id, c.id
FROM public.users u
CROSS JOIN public.courses c
WHERE u.role = 'student' AND c.code IN ('PPL_A', 'VFR_RT')
ON CONFLICT (user_id, course_id) WHERE deleted_at IS NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_user_enrolments(
  p_user_id uuid,
  p_course_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_org  uuid;
  v_caller_role text;
  v_user_id     uuid;
  v_wanted      uuid[];
  v_added       uuid[];
  v_removed     uuid[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_user_id IS NULL OR p_course_ids IS NULL THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT u.organization_id, u.role INTO v_caller_org, v_caller_role
  FROM public.users u
  WHERE u.id = v_caller_id AND u.deleted_at IS NULL;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  -- Row lock serializes concurrent calls for one user.
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.id = p_user_id
    AND u.organization_id = v_caller_org
    AND u.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_wanted FROM unnest(p_course_ids) AS x;

  IF EXISTS (
    SELECT 1 FROM unnest(v_wanted) AS w(id)
    WHERE w.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = w.id)
  ) THEN
    RAISE EXCEPTION 'course_not_found';
  END IF;

  WITH removed AS (
    UPDATE public.course_enrolments e
    SET deleted_at = now(), deleted_by = v_caller_id
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND NOT (e.course_id = ANY (v_wanted))
    RETURNING e.course_id
  )
  SELECT COALESCE(array_agg(course_id), '{}') INTO v_removed FROM removed;

  WITH added AS (
    INSERT INTO public.course_enrolments (organization_id, user_id, course_id, enrolled_by)
    SELECT v_caller_org, p_user_id, w.id, v_caller_id
    FROM unnest(v_wanted) AS w(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.course_enrolments e
      WHERE e.user_id = p_user_id AND e.course_id = w.id AND e.deleted_at IS NULL
    )
    RETURNING course_id
  )
  SELECT COALESCE(array_agg(course_id), '{}') INTO v_added FROM added;

  IF cardinality(v_added) > 0 OR cardinality(v_removed) > 0 THEN
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (
      v_caller_org, v_caller_id, v_caller_role, 'user.enrolments_changed', 'user', p_user_id,
      jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed))
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_enrolments(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_enrolments(uuid, uuid[]) TO authenticated;
