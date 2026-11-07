-- Syllabus soft delete (E3b): easa_subjects / easa_topics / easa_subtopics.
-- Hard DELETE is impossible for `authenticated`; soft_delete_syllabus_item is the only delete path.
-- Residual: a child inserted concurrently with a parent delete is not serialised (only the target row is locked).

ALTER TABLE public.easa_subjects
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES public.users(id);
ALTER TABLE public.easa_topics
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES public.users(id);
ALTER TABLE public.easa_subtopics
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES public.users(id);

DROP POLICY admin_delete_subjects ON public.easa_subjects;
DROP POLICY admin_delete_topics ON public.easa_topics;
DROP POLICY admin_delete_subtopics ON public.easa_subtopics;

REVOKE DELETE ON public.easa_subjects, public.easa_topics, public.easa_subtopics FROM authenticated;

-- deleted_at / deleted_by writable by no authenticated path (easa_subjects already column-granted, mig 20261028000100).
REVOKE INSERT, UPDATE ON public.easa_topics FROM authenticated;
GRANT INSERT (subject_id, code, name, sort_order), UPDATE (subject_id, code, name, sort_order)
  ON public.easa_topics TO authenticated;
REVOKE INSERT, UPDATE ON public.easa_subtopics FROM authenticated;
GRANT INSERT (topic_id, code, name, sort_order), UPDATE (topic_id, code, name, sort_order)
  ON public.easa_subtopics TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_syllabus_item(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_admin_org  uuid;
  v_admin_role text;
  v_code       text;
  v_name       text;
  v_topic_code text;
  v_subject_id uuid;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT u.organization_id, u.role INTO v_admin_org, v_admin_role
  FROM public.users u
  WHERE u.id = v_admin_id AND u.deleted_at IS NULL;
  IF v_admin_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_table NOT IN ('easa_subjects', 'easa_topics', 'easa_subtopics') THEN
    RAISE EXCEPTION 'invalid_table';
  END IF;

  -- Lock the target first.
  IF p_table = 'easa_subjects' THEN
    SELECT s.code, s.name INTO v_code, v_name
    FROM public.easa_subjects s
    WHERE s.id = p_id AND s.deleted_at IS NULL
    FOR UPDATE;
    v_subject_id := p_id;
  ELSIF p_table = 'easa_topics' THEN
    SELECT t.code, t.name, t.subject_id INTO v_code, v_name, v_subject_id
    FROM public.easa_topics t
    WHERE t.id = p_id AND t.deleted_at IS NULL
    FOR UPDATE;
  ELSE
    SELECT st.code, st.name INTO v_code, v_name
    FROM public.easa_subtopics st
    WHERE st.id = p_id AND st.deleted_at IS NULL
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_table = 'easa_subjects' THEN
    IF EXISTS (SELECT 1 FROM public.easa_topics t
               WHERE t.subject_id = p_id AND t.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.questions q
                  WHERE q.subject_id = p_id AND q.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.exam_configs ec
                  WHERE ec.subject_id = p_id AND ec.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.quiz_sessions qs
                  WHERE qs.subject_id = p_id AND qs.ended_at IS NULL
                    AND (qs.deleted_at IS NULL OR qs.saved_at IS NOT NULL))
       OR EXISTS (SELECT 1 FROM public.internal_exam_codes iec
                  WHERE iec.subject_id = p_id AND iec.deleted_at IS NULL
                    AND iec.consumed_at IS NULL AND iec.voided_at IS NULL
                    AND iec.expires_at > now())
    THEN
      RAISE EXCEPTION 'in_use: subject % is referenced by live data', v_code;
    END IF;
  ELSIF p_table = 'easa_topics' THEN
    v_topic_code := v_code;
    IF EXISTS (SELECT 1 FROM public.easa_subtopics st
               WHERE st.topic_id = p_id AND st.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.questions q
                  WHERE q.topic_id = p_id AND q.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.exam_config_distributions d
                  JOIN public.exam_configs ec ON ec.id = d.exam_config_id
                  WHERE d.topic_id = p_id AND ec.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.exam_configs ec
                  WHERE ec.subject_id = v_subject_id AND ec.deleted_at IS NULL
                    AND v_topic_code IN (ec.parts_config->'part1'->>'topic_code',
                                         ec.parts_config->'part2'->>'topic_code',
                                         ec.parts_config->'part3'->>'topic_code'))
       OR EXISTS (SELECT 1 FROM public.quiz_sessions qs
                  WHERE qs.topic_id = p_id AND qs.ended_at IS NULL
                    AND (qs.deleted_at IS NULL OR qs.saved_at IS NOT NULL))
    THEN
      RAISE EXCEPTION 'in_use: topic % is referenced by live data', v_code;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.questions q
               WHERE q.subtopic_id = p_id AND q.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.exam_config_distributions d
                  JOIN public.exam_configs ec ON ec.id = d.exam_config_id
                  WHERE d.subtopic_id = p_id AND ec.deleted_at IS NULL)
    THEN
      RAISE EXCEPTION 'in_use: subtopic % is referenced by live data', v_code;
    END IF;
  END IF;

  IF p_table = 'easa_subjects' THEN
    UPDATE public.easa_subjects SET deleted_at = now(), deleted_by = v_admin_id
    WHERE id = p_id AND deleted_at IS NULL;
  ELSIF p_table = 'easa_topics' THEN
    UPDATE public.easa_topics SET deleted_at = now(), deleted_by = v_admin_id
    WHERE id = p_id AND deleted_at IS NULL;
  ELSE
    UPDATE public.easa_subtopics SET deleted_at = now(), deleted_by = v_admin_id
    WHERE id = p_id AND deleted_at IS NULL;
  END IF;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_admin_org, v_admin_id, v_admin_role,
    'syllabus.item_deleted', p_table, p_id,
    jsonb_build_object('code', v_code, 'name', v_name)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_syllabus_item(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_syllabus_item(text, uuid) TO authenticated;
