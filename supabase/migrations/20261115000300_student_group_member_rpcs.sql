-- add/remove_student_group_members: admin-only SECURITY DEFINER bulk membership writes (1..500 distinct ids, soft delete on remove). #1776

CREATE OR REPLACE FUNCTION public.add_student_group_members(
  p_group_id uuid,
  p_user_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_org  uuid;
  v_caller_role text;
  v_group_id    uuid;
  v_added       uuid[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_group_id IS NULL OR p_user_ids IS NULL
     OR cardinality(p_user_ids) NOT BETWEEN 1 AND 500
     OR array_position(p_user_ids, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT x) FROM unnest(p_user_ids) AS x) <> cardinality(p_user_ids) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT u.organization_id, u.role INTO v_caller_org, v_caller_role
  FROM public.users u
  WHERE u.id = v_caller_id AND u.deleted_at IS NULL;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  -- Row lock serializes concurrent membership changes for one group.
  SELECT g.id INTO v_group_id
  FROM public.student_groups g
  WHERE g.id = p_group_id
    AND g.organization_id = v_caller_org
    AND g.deleted_at IS NULL
  FOR UPDATE;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF (
    SELECT count(*) FROM public.users u
    WHERE u.id = ANY (p_user_ids)
      AND u.organization_id = v_caller_org
      AND u.role = 'student'
      AND u.deleted_at IS NULL
  ) <> cardinality(p_user_ids) THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  WITH added AS (
    INSERT INTO public.student_group_members (organization_id, group_id, user_id, added_by)
    SELECT v_caller_org, p_group_id, w.id, v_caller_id
    FROM unnest(p_user_ids) AS w(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_group_members m
      WHERE m.group_id = p_group_id AND m.user_id = w.id AND m.deleted_at IS NULL
    )
    RETURNING user_id
  )
  SELECT COALESCE(array_agg(user_id), '{}') INTO v_added FROM added;

  IF cardinality(v_added) > 0 THEN
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (
      v_caller_org, v_caller_id, v_caller_role, 'student_group.members_added', 'student_group',
      p_group_id, jsonb_build_object('user_ids', to_jsonb(v_added))
    );
  END IF;

  RETURN cardinality(v_added);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_student_group_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_student_group_members(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_student_group_members(
  p_group_id uuid,
  p_user_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_org  uuid;
  v_caller_role text;
  v_group_id    uuid;
  v_removed     uuid[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_group_id IS NULL OR p_user_ids IS NULL
     OR cardinality(p_user_ids) NOT BETWEEN 1 AND 500
     OR array_position(p_user_ids, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT x) FROM unnest(p_user_ids) AS x) <> cardinality(p_user_ids) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT u.organization_id, u.role INTO v_caller_org, v_caller_role
  FROM public.users u
  WHERE u.id = v_caller_id AND u.deleted_at IS NULL;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  SELECT g.id INTO v_group_id
  FROM public.student_groups g
  WHERE g.id = p_group_id
    AND g.organization_id = v_caller_org
    AND g.deleted_at IS NULL
  FOR UPDATE;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  WITH removed AS (
    UPDATE public.student_group_members m
    SET deleted_at = now(), deleted_by = v_caller_id
    WHERE m.group_id = p_group_id
      AND m.user_id = ANY (p_user_ids)
      AND m.deleted_at IS NULL
    RETURNING m.user_id
  )
  SELECT COALESCE(array_agg(user_id), '{}') INTO v_removed FROM removed;

  IF cardinality(v_removed) > 0 THEN
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (
      v_caller_org, v_caller_id, v_caller_role, 'student_group.members_removed', 'student_group',
      p_group_id, jsonb_build_object('user_ids', to_jsonb(v_removed))
    );
  END IF;

  RETURN cardinality(v_removed);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_student_group_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_student_group_members(uuid, uuid[]) TO authenticated;
