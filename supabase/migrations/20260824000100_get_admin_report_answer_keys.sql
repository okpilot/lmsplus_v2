-- get_admin_report_answer_keys — the ADMIN, org-scoped sibling of
-- get_report_answer_keys (mig 156, latest definition 20260702000700). The admin session
-- report renders non-MC questions (short_answer, dialog_fill, ordering, diagram_label) and
-- until now had no answer-key read path for them: get_admin_report_correct_options (mig 114)
-- returns the MC key only. New function name — no prior signature exists in
-- supabase/migrations/ under either CREATE OR REPLACE or DROP+CREATE — so CREATE OR REPLACE
-- is used here as the plain create form.
--
-- GUARDS: structure copied from get_admin_report_correct_options (20260619000400 L77-130) —
-- auth.uid() null-check, is_admin(), then the org lookup. That `SELECT organization_id INTO
-- v_org_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL` is the sanctioned FOLDED
-- form of the active-user / soft-deleted-caller gate (docs/security.md §11c guard table), and
-- the `v_org_id IS NULL` RAISE below is what makes the fold a gate: a soft-deleted admin
-- selects no row, so v_org_id stays NULL and the call fails closed. No standalone PERFORM
-- active-user check is added — that would duplicate the same read.
--
-- BODY: the four RETURN QUERY branches are copied VERBATIM from mig 156 (20260702000700
-- L56-121). They are scoped by `quiz_session_answers sa ... WHERE sa.session_id =
-- p_session_id`, so the session guard above is what bounds this RPC.
--
-- §15 carve-out: no q.deleted_at filter on the questions JOIN. (a) The immutable, write-once
-- column relied on is quiz_session_answers.question_id — quiz_session_answers is append-only
-- (no permitting UPDATE/DELETE policy; resubmits are ON CONFLICT DO NOTHING), so the
-- reachable question set is bounded by what was actually answered in a completed, in-org
-- session rather than by the deleted-at predicate. (b) This comment is that call-site
-- comment. (c) See docs/security.md §15 and docs/database.md §3 "Scoring Soft-Deleted
-- Questions". A question soft-deleted after it was answered must still reveal its key in the
-- historical admin report.
--
-- EXPOSURE DELTA (to the `authenticated` role, admins only via is_admin()):
--   * short_answer / dialog_fill — narrower in SCOPE than get_question_authoring_fields
--     (mig 116), which already returns canonical_answer and blanks_config to any org admin
--     for any question: this RPC is bounded to questions answered in a completed in-org
--     session. It is NOT a strict subset, however, because mig 116 filters
--     `q.deleted_at IS NULL` (20260619000600:85) while this RPC takes the §15 carve-out and
--     so also reveals keys for questions soft-deleted after they were answered.
--   * ordering / diagram_label — this is the FIRST admin-side read path for these keys:
--     mig 116 returns neither ordering_items nor diagram_config. The data CATEGORY is not new
--     to the `authenticated` role, since get_report_answer_keys (mig 156) already returns both
--     derived keys to the session owner; what is new is an admin reaching them.
--   * The column-level GRANT allowlist is untouched — ordering_items and diagram_config stay
--     REVOKE-gated from `authenticated`; SECURITY DEFINER is what reads them here.
--
-- No active-exam deny-by-default guard (the answer-oracle rule, docs/security.md §4 item 6):
-- that guard exists for RPCs that accept caller-supplied question ids and can therefore be
-- pointed at a live exam. This RPC takes only p_session_id and requires
-- `ended_at IS NOT NULL`, so it cannot be aimed at an in-progress session at all.
CREATE OR REPLACE FUNCTION get_admin_report_answer_keys(p_session_id uuid)
RETURNS TABLE (question_id uuid, question_type text, blank_index int, answer_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Look up the caller's organization_id. Folded active-user gate: the
  -- `deleted_at IS NULL` predicate means a soft-deleted admin resolves no row.
  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  -- Verify the session exists, belongs to the caller's org, and is completed
  IF NOT EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE id = p_session_id
      AND organization_id = v_org_id
      AND ended_at IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Session not found, not in caller org, or not completed';
  END IF;

  -- short_answer: ONE row per question.
  RETURN QUERY
  SELECT DISTINCT ON (q.id)
    q.id              AS question_id,
    q.question_type   AS question_type,
    NULL::int         AS blank_index,
    q.canonical_answer AS answer_key
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  WHERE sa.session_id = p_session_id
    AND q.question_type = 'short_answer'
  ORDER BY q.id;

  -- dialog_fill: ONE row PER BLANK.
  RETURN QUERY
  SELECT DISTINCT ON (q.id, (b->>'index')::int)
    q.id            AS question_id,
    q.question_type AS question_type,
    (b->>'index')::int AS blank_index,
    b->>'canonical' AS answer_key
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.blanks_config) AS b
  WHERE sa.session_id = p_session_id
    AND q.question_type = 'dialog_fill'
  ORDER BY q.id, (b->>'index')::int;

  -- ordering: ONE row PER SLOT — answer_key = canonical item text at that slot.
  RETURN QUERY
  SELECT DISTINCT ON (q.id, ord.idx)
    q.id              AS question_id,
    q.question_type   AS question_type,
    (ord.idx - 1)::int AS blank_index,
    ord.elem->>'text' AS answer_key
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.ordering_items) WITH ORDINALITY AS ord(elem, idx)
  WHERE sa.session_id = p_session_id
    AND q.question_type = 'ordering'
  ORDER BY q.id, ord.idx;

  -- diagram_label: ONE row PER ZONE — answer_key = the display TEXT of the
  -- label canonically assigned to that zone. 2-hop resolve: zone -> the
  -- diagram_config.answer entry for this zone_id -> its label_id -> that
  -- label's text in diagram_config.labels.
  RETURN QUERY
  SELECT DISTINCT ON (q.id, ord.idx)
    q.id              AS question_id,
    q.question_type   AS question_type,
    (ord.idx - 1)::int AS blank_index,
    (
      SELECT lbl->>'text'
      FROM jsonb_array_elements(q.diagram_config->'labels') AS lbl
      WHERE lbl->>'id' = (
        SELECT ca->>'label_id'
        FROM jsonb_array_elements(q.diagram_config->'answer') AS ca
        WHERE ca->>'zone_id' = ord.elem->>'id'
        LIMIT 1
      )
      LIMIT 1
    ) AS answer_key
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.diagram_config->'zones') WITH ORDINALITY AS ord(elem, idx)
  WHERE sa.session_id = p_session_id
    AND q.question_type = 'diagram_label'
  ORDER BY q.id, ord.idx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_report_answer_keys(uuid) TO authenticated;
