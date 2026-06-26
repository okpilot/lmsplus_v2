-- Migration 134: optional question-type filter on the shared filtered question
-- pool + get_random_question_ids (Study Mode — feat/study-mode-mc).
--
-- Study Mode builds an MC-only practice set. To give that set an HONEST count and
-- selection, the pool must be restrictable to a single question_type. We add a new
-- trailing optional parameter `p_question_type text DEFAULT NULL` to the shared
-- helper `_filtered_question_pool` and to its sampling wrapper
-- `get_random_question_ids`. NULL (the default, and what every existing caller
-- passes) means "no type restriction" — so the live quiz/exam path is unaffected.
-- Study Mode passes 'multiple_choice'.
--
-- Signature change (N1): adding a parameter changes the function's argument list.
-- CREATE OR REPLACE cannot change the argument list, and leaving the old overload
-- alive would make PostgREST/SQL calls ambiguous — so the old exact signatures are
-- DROPPED first, then recreated with the new trailing param. Precedent: the calc-
-- mode (mig 20260611000400) and has-image (mig 20260614000001) param additions did
-- the same DROP+recreate. Drop the dependent wrapper before the shared helper.
--
-- get_filtered_question_counts is intentionally NOT modified here: its body calls
-- the pool with the prior positional arity, which resolves to the new function via
-- the p_question_type DEFAULT NULL (no type restriction) — preserving its behavior.
--
-- _filtered_question_pool is SECURITY INVOKER (RLS applies; per-user filters scope
-- student_id = auth.uid() per security.md §3). The org/active-user/soft-delete and
-- status='active' guards are unchanged and re-emitted verbatim from mig
-- 20260614000001 (the LATEST definition) — only the new type predicate is added.

DROP FUNCTION IF EXISTS public.get_random_question_ids(uuid, uuid[], uuid[], int, text[], text, text);
DROP FUNCTION IF EXISTS public._filtered_question_pool(uuid, uuid[], uuid[], text[], text, text);

---------------------------------------------------------------------------
-- Internal helper: the shared, filtered, org-scoped question pool.
---------------------------------------------------------------------------
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
            WHERE sr.student_id = auth.uid()
              AND sr.question_id = q.id))
      OR ('incorrect' = ANY (p_filters) AND EXISTS (
            SELECT 1 FROM fsrs_cards fc
            WHERE fc.student_id = auth.uid()
              AND fc.last_was_correct = false
              AND fc.question_id = q.id))
      OR ('flagged' = ANY (p_filters) AND EXISTS (
            SELECT 1 FROM active_flagged_questions af
            WHERE af.student_id = auth.uid()
              AND af.question_id = q.id))
    )
$$;

---------------------------------------------------------------------------
-- #679 — random sampling from the filtered pool.
-- VOLATILE because random() is volatile.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_random_question_ids(
  p_subject_id    uuid,
  p_topic_ids     uuid[],
  p_subtopic_ids  uuid[],
  p_count         int,
  p_filters       text[],
  p_calc_mode     text DEFAULT 'all',
  p_has_image     text DEFAULT 'all',
  p_question_type text DEFAULT NULL
)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY INVOKER
VOLATILE
SET search_path = public
AS $$
  SELECT p.id
  FROM public._filtered_question_pool(p_subject_id, p_topic_ids, p_subtopic_ids, p_filters, p_calc_mode, p_has_image, p_question_type) p
  ORDER BY random()
  -- Server-side cap of 500 mirrors the Zod schema in apps/web/app/app/quiz/actions/start.ts.
  -- Defense in depth: the RPC is GRANT EXECUTE TO authenticated, so a direct caller could
  -- bypass the Server Action's Zod validation and pass an arbitrarily large (or NULL)
  -- p_count. COALESCE(p_count, 0) clamps NULL to 0 first — otherwise LIMIT NULL removes the
  -- cap entirely and turns ORDER BY random() into an unbounded sort. LEAST(..., 500) then
  -- prevents an unbounded workload (CLAUDE.md "never trust client input"); 500 matches the
  -- canonical max quiz size.
  LIMIT LEAST(GREATEST(COALESCE(p_count, 0), 0), 500)
$$;

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._filtered_question_pool(uuid, uuid[], uuid[], text[], text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_question_ids(uuid, uuid[], uuid[], int, text[], text, text, text) TO authenticated;

---------------------------------------------------------------------------
-- Comments
---------------------------------------------------------------------------
COMMENT ON FUNCTION public._filtered_question_pool(uuid, uuid[], uuid[], text[], text, text, text) IS
  'Internal: active, org-scoped, subject/topic/subtopic + per-user-filter (UNION) question pool, AND-restricted by p_calc_mode {all|only|exclude} on has_calculations (#837), p_has_image {all|only|exclude} on question_image_url presence (#864), and an optional p_question_type (NULL = no restriction; Study Mode passes ''multiple_choice''). SECURITY INVOKER; filters scope student_id = auth.uid() (§3). Used by get_random_question_ids and get_filtered_question_counts so count == quiz (#678/#679/#668). Prefer the wrapper RPCs over calling directly (direct calls may hit the PostgREST 1000-row cap).';

COMMENT ON FUNCTION public.get_random_question_ids(uuid, uuid[], uuid[], int, text[], text, text, text) IS
  'Up to LEAST(COALESCE(p_count, 0), 500) random IDs from the filtered question pool (NULL p_count yields 0 rows). p_calc_mode {all|only|exclude} AND-restricts on has_calculations (#837); p_has_image {all|only|exclude} AND-restricts on question_image_url presence (#864); optional p_question_type AND-restricts to a single type (NULL = no restriction; Study Mode passes ''multiple_choice''). Server-side ORDER BY random() avoids the 1000-row cap that biased client-side sampling (#679/#668); the 500 cap (mirroring the Zod schema in start.ts) prevents a direct caller from bypassing the Server Action with a NULL or arbitrarily large p_count.';
