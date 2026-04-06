-- Admin Dashboard KPIs RPC
-- Returns all 5 KPI values in a single JSON response

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis(
  p_range_days INT DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_org_id UUID;
  v_range_start TIMESTAMPTZ;
  v_total_students BIGINT;
  v_active_students BIGINT;
  v_sessions_count BIGINT;
  v_avg_mastery NUMERIC;
  v_weakest JSON;
  v_exam_ready BIGINT;
BEGIN
  -- Auth + admin check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Resolve caller's org
  SELECT organization_id INTO v_org_id
  FROM users WHERE id = v_uid AND deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- Clamp range (0 = all-time)
  IF p_range_days IS NULL OR p_range_days < 0 THEN
    p_range_days := 30;
  ELSIF p_range_days > 1095 THEN
    p_range_days := 1095;
  END IF;

  IF p_range_days = 0 THEN
    v_range_start := '-infinity'::timestamptz;
  ELSE
    v_range_start := now() - (p_range_days || ' days')::interval;
  END IF;

  -- 1. Total + active students (active = last_active_at within range)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE last_active_at >= v_range_start)
  INTO v_total_students, v_active_students
  FROM users
  WHERE organization_id = v_org_id AND role = 'student' AND deleted_at IS NULL;

  -- 2. Sessions this period (completed sessions in range)
  SELECT COUNT(*) INTO v_sessions_count
  FROM quiz_sessions
  WHERE organization_id = v_org_id
    AND ended_at IS NOT NULL
    AND deleted_at IS NULL
    AND ended_at >= v_range_start;

  -- 3-5. Mastery-based KPIs (always all-time)
  -- Build per-student-per-subject mastery, then derive avg mastery, weakest subject, and exam readiness
  WITH question_counts AS (
    SELECT subject_id, COUNT(DISTINCT id) AS total
    FROM questions
    WHERE organization_id = v_org_id AND status = 'active' AND deleted_at IS NULL
    GROUP BY subject_id
  ),
  correct_counts AS (
    SELECT sr.student_id, q.subject_id, COUNT(DISTINCT sr.question_id) AS correct
    FROM student_responses sr
    JOIN questions q ON q.id = sr.question_id
    WHERE q.organization_id = v_org_id AND q.status = 'active' AND q.deleted_at IS NULL
      AND sr.is_correct = true
    GROUP BY sr.student_id, q.subject_id
  ),
  student_subject_mastery AS (
    SELECT
      u.id AS student_id,
      qc.subject_id,
      qc.total,
      COALESCE(cc.correct, 0) AS correct,
      CASE WHEN qc.total > 0
        THEN ROUND(COALESCE(cc.correct, 0)::numeric / qc.total * 100)
        ELSE 0
      END AS mastery
    FROM users u
    CROSS JOIN question_counts qc
    LEFT JOIN correct_counts cc ON cc.student_id = u.id AND cc.subject_id = qc.subject_id
    WHERE u.organization_id = v_org_id AND u.role = 'student' AND u.deleted_at IS NULL
  ),
  -- Overall mastery per student (across all subjects)
  student_overall AS (
    SELECT
      student_id,
      ROUND(SUM(correct)::numeric / NULLIF(SUM(total), 0) * 100) AS mastery
    FROM student_subject_mastery
    GROUP BY student_id
  ),
  -- Average mastery per subject (for weakest subject ranking)
  -- Uses AVG of per-student percentages (not weighted) — deliberate for relative ranking
  subject_avg AS (
    SELECT subject_id, ROUND(AVG(mastery)) AS avg_mastery
    FROM student_subject_mastery
    GROUP BY subject_id
  )
  SELECT
    COALESCE((SELECT ROUND(AVG(mastery)) FROM student_overall), 0),
    (SELECT json_build_object('name', es.name, 'short', es.short, 'avgMastery', sa.avg_mastery)
     FROM subject_avg sa
     JOIN easa_subjects es ON es.id = sa.subject_id
     WHERE sa.avg_mastery IS NOT NULL
     ORDER BY sa.avg_mastery ASC
     LIMIT 1),
    COALESCE((SELECT COUNT(*) FROM (
      SELECT student_id
      FROM student_subject_mastery
      GROUP BY student_id
      HAVING BOOL_AND(mastery >= 90)
    ) exam_students), 0)
  INTO v_avg_mastery, v_weakest, v_exam_ready;

  RETURN json_build_object(
    'activeStudents', v_active_students,
    'totalStudents', v_total_students,
    'avgMastery', v_avg_mastery,
    'sessionsThisPeriod', v_sessions_count,
    'weakestSubject', v_weakest,
    'examReadyStudents', v_exam_ready
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_kpis(INT) TO authenticated;
