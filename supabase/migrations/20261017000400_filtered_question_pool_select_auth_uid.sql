-- #1414: wrap auth.uid() in (select ...) so Postgres plans it as an InitPlan evaluated once
-- per statement, not once per row (Supabase lint 0003 auth_rls_initplan).
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- CREATE OR REPLACE keeps existing GRANTs and COMMENTs; only the auth.uid() row filters change.
-- Body copied from its latest definition (20260626000100, 7-arg signature).

CREATE OR REPLACE FUNCTION public._filtered_question_pool(
  p_subject_id    uuid,
  p_topic_ids     uuid[],
  p_subtopic_ids  uuid[],
  p_filters       text[],
  p_calc_mode     text DEFAULT 'all',
  p_has_image     text DEFAULT 'all',
  p_question_type text DEFAULT NULL
)
RETURNS TABLE (id uuid, topic_id uuid, subtopic_id uuid)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT q.id, q.topic_id, q.subtopic_id
  FROM questions q
  WHERE q.subject_id = p_subject_id
    AND q.status = 'active'
    AND q.deleted_at IS NULL
    -- Topic/subtopic scope:
    --   both arrays NULL          → unconstrained (whole subject pool)
    --   non-NULL array            → match its members via = ANY
    --   empty non-NULL array      → matches nothing for that dimension
    --   semantics across the two  → OR (a question matching either dimension is in scope;
    --                                   keeps leaf-topic questions with NULL subtopic_id)
    AND (
      (p_topic_ids IS NULL AND p_subtopic_ids IS NULL)
      OR (p_topic_ids IS NOT NULL AND q.topic_id = ANY (p_topic_ids))
      OR (p_subtopic_ids IS NOT NULL AND q.subtopic_id = ANY (p_subtopic_ids))
    )
    -- Calc-mode (#837): subtractive AND-restriction, independent of (and applied on top
    -- of) the per-user OR filters below. 'all' / NULL / any unknown value → unrestricted
    -- (fail-open: this is a content filter, not a security boundary, and the Server Action
    -- Zod enum already constrains the app path to {all,only,exclude}). has_calculations is
    -- NOT NULL DEFAULT false, so no NULL handling is needed.
    AND CASE p_calc_mode
          WHEN 'only'    THEN q.has_calculations = true
          WHEN 'exclude' THEN q.has_calculations = false
          ELSE true
        END
    -- has-image (#864): subtractive AND-restriction on question_image_url presence,
    -- same fail-open semantics as calc-mode. question_image_url is a nullable TEXT
    -- column (NULL = no image), so 'only' = IS NOT NULL, 'exclude' = IS NULL.
    AND CASE p_has_image
          WHEN 'only'    THEN q.question_image_url IS NOT NULL
          WHEN 'exclude' THEN q.question_image_url IS NULL
          ELSE true
        END
    -- Study Mode (feat/study-mode-mc): optional single-question_type restriction.
    -- NULL = no restriction (every existing caller). Study Mode passes
    -- 'multiple_choice' so the MC-only practice set has an honest count and pool.
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
    -- Per-user filters, UNION semantics. NULL or empty p_filters = whole scoped pool.
    -- student_responses has TWO permissive SELECT policies (students_read_responses +
    -- instructors_read_students), so the explicit student_id = auth.uid() scope is
    -- LOAD-BEARING per security.md §3. fsrs_cards / active_flagged_questions have a
    -- single applicable policy each — the explicit scope there is defense-in-depth.
    AND (
      p_filters IS NULL
      OR cardinality(p_filters) = 0
      OR ('unseen' = ANY (p_filters) AND NOT EXISTS (
            SELECT 1 FROM student_responses sr
            WHERE sr.student_id = (select auth.uid())
              AND sr.question_id = q.id))
      OR ('incorrect' = ANY (p_filters) AND EXISTS (
            SELECT 1 FROM fsrs_cards fc
            WHERE fc.student_id = (select auth.uid())
              AND fc.last_was_correct = false
              AND fc.question_id = q.id))
      OR ('flagged' = ANY (p_filters) AND EXISTS (
            SELECT 1 FROM active_flagged_questions af
            WHERE af.student_id = (select auth.uid())
              AND af.question_id = q.id))
    )
$$;
