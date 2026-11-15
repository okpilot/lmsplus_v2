-- create/update/delete_student_group: admin-only SECURITY DEFINER writes; delete is soft and cascades to active memberships. #1776

CREATE OR REPLACE FUNCTION public.create_student_group(
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_org  uuid;
  v_caller_role text;
  v_name        text := regexp_replace(p_name, '^\s+|\s+$', '', 'g');
  v_desc        text := NULLIF(regexp_replace(p_description, '^\s+|\s+$', '', 'g'), '');
  v_id          uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT u.organization_id, u.role INTO v_caller_org, v_caller_role
  FROM public.users u
  WHERE u.id = v_caller_id AND u.deleted_at IS NULL;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 80
     OR char_length(v_desc) > 500 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  BEGIN
    INSERT INTO public.student_groups (organization_id, name, description, created_by)
    VALUES (v_caller_org, v_name, v_desc, v_caller_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'group_name_taken';
  END;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_caller_org, v_caller_id, v_caller_role, 'student_group.created', 'student_group', v_id,
    jsonb_build_object('name', v_name)
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_student_group(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student_group(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_student_group(
  p_group_id uuid,
  p_name text,
  p_description text DEFAULT NULL
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
  v_name        text := regexp_replace(p_name, '^\s+|\s+$', '', 'g');
  v_desc        text := NULLIF(regexp_replace(p_description, '^\s+|\s+$', '', 'g'), '');
  v_old_name    text;
  v_old_desc    text;
  v_new_desc    text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_group_id IS NULL OR v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 80
     OR char_length(v_desc) > 500 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT u.organization_id, u.role INTO v_caller_org, v_caller_role
  FROM public.users u
  WHERE u.id = v_caller_id AND u.deleted_at IS NULL;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  SELECT g.name, g.description INTO v_old_name, v_old_desc
  FROM public.student_groups g
  WHERE g.id = p_group_id
    AND g.organization_id = v_caller_org
    AND g.deleted_at IS NULL
  FOR UPDATE;
  IF v_old_name IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  v_new_desc := CASE WHEN p_description IS NULL THEN v_old_desc ELSE v_desc END;

  IF v_old_name IS NOT DISTINCT FROM v_name AND v_old_desc IS NOT DISTINCT FROM v_new_desc THEN
    RETURN;
  END IF;

  BEGIN
    UPDATE public.student_groups
    SET name = v_name, description = v_new_desc, updated_at = now()
    WHERE id = p_group_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'group_name_taken';
  END;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_caller_org, v_caller_id, v_caller_role, 'student_group.updated', 'student_group', p_group_id,
    jsonb_build_object(
      'old_name', v_old_name, 'name', v_name,
      'old_description', v_old_desc, 'description', v_new_desc
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_student_group(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_student_group(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_student_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_org  uuid;
  v_caller_role text;
  v_name        text;
  v_removed     integer;
  v_user_ids    uuid[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT u.organization_id, u.role INTO v_caller_org, v_caller_role
  FROM public.users u
  WHERE u.id = v_caller_id AND u.deleted_at IS NULL;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  SELECT g.name INTO v_name
  FROM public.student_groups g
  WHERE g.id = p_group_id
    AND g.organization_id = v_caller_org
    AND g.deleted_at IS NULL
  FOR UPDATE;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  WITH removed AS (
    UPDATE public.student_group_members m
    SET deleted_at = now(), deleted_by = v_caller_id
    WHERE m.group_id = p_group_id AND m.deleted_at IS NULL
    RETURNING m.user_id
  )
  SELECT COALESCE(array_agg(user_id), '{}') INTO v_user_ids FROM removed;
  v_removed := cardinality(v_user_ids);

  UPDATE public.student_groups
  SET deleted_at = now(), deleted_by = v_caller_id, updated_at = now()
  WHERE id = p_group_id;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_caller_org, v_caller_id, v_caller_role, 'student_group.deleted', 'student_group', p_group_id,
    jsonb_build_object(
      'name', v_name, 'members_removed', v_removed, 'user_ids', to_jsonb(v_user_ids)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_student_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_student_group(uuid) TO authenticated;
