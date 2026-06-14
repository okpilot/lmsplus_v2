-- has-image (#864): tri-state question_image_url filter for the student quiz builder.
--
-- Mirrors the calc-mode pattern (#837, mig 20260611000400). Adds p_has_image
-- {all|only|exclude} to the shared filtered-pool helper and both wrapper RPCs
-- (get_random_question_ids / get_filtered_question_counts). Like calc-mode, this
-- AND-restricts the pool (subtractive), independent of the per-user p_filters
-- (unseen/incorrect/flagged) which UNION/OR together.
--
-- Signature change: p_has_image is a NEW trailing parameter, so the prior
-- signatures (which already carry p_calc_mode) must be DROPPED before recreating
-- — CREATE OR REPLACE cannot change a function's argument list, and leaving the
-- old overloads alive would make calls ambiguous. Drop the two dependents before
-- the shared helper.

DROP FUNCTION IF EXISTS public.get_random_question_ids(uuid, uuid[], uuid[], int, text[], text);
DROP FUNCTION IF EXISTS public.get_filtered_question_counts(uuid, uuid[], uuid[], text[], text);
DROP FUNCTION IF EXISTS public._filtered_question_pool(uuid, uuid[], uuid[], text[], text);

---------------------------------------------------------------------------
-- Internal helper: the shared, filtered, org-scoped question pool.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._filtered_question_pool(
  p_subject_id   uuid,
  p_topic_ids    uuid[],
  p_subtopic_ids uuid[],
  p_filters      text[],
  p_calc_mode    text DEFAULT 'all',
  p_has_image    text DEFAULT 'all'
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
  p_subject_id   uuid,
  p_topic_ids    uuid[],
  p_subtopic_ids uuid[],
  p_count        int,
  p_filters      text[],
  p_calc_mode    text DEFAULT 'all',
  p_has_image    text DEFAULT 'all'
)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY INVOKER
VOLATILE
SET search_path = public
AS $$
  SELECT p.id
  FROM public._filtered_question_pool(p_subject_id, p_topic_ids, p_subtopic_ids, p_filters, p_calc_mode, p_has_image) p
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
-- #678 — per-(topic, subtopic) counts over the filtered pool.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_filtered_question_counts(
  p_subject_id   uuid,
  p_topic_ids    uuid[],
  p_subtopic_ids uuid[],
  p_filters      text[],
  p_calc_mode    text DEFAULT 'all',
  p_has_image    text DEFAULT 'all'
)
RETURNS TABLE (topic_id uuid, subtopic_id uuid, n bigint)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT p.topic_id, p.subtopic_id, count(*)::bigint AS n
  FROM public._filtered_question_pool(p_subject_id, p_topic_ids, p_subtopic_ids, p_filters, p_calc_mode, p_has_image) p
  GROUP BY p.topic_id, p.subtopic_id
$$;

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._filtered_question_pool(uuid, uuid[], uuid[], text[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_question_ids(uuid, uuid[], uuid[], int, text[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_filtered_question_counts(uuid, uuid[], uuid[], text[], text, text) TO authenticated;

---------------------------------------------------------------------------
-- Comments
---------------------------------------------------------------------------
COMMENT ON FUNCTION public._filtered_question_pool(uuid, uuid[], uuid[], text[], text, text) IS
  'Internal: active, org-scoped, subject/topic/subtopic + per-user-filter (UNION) question pool, AND-restricted by p_calc_mode {all|only|exclude} on has_calculations (#837) and p_has_image {all|only|exclude} on question_image_url presence (#864). SECURITY INVOKER; filters scope student_id = auth.uid() (§3). Used by get_random_question_ids and get_filtered_question_counts so count == quiz (#678/#679/#668). Prefer the wrapper RPCs over calling directly (direct calls may hit the PostgREST 1000-row cap).';

COMMENT ON FUNCTION public.get_random_question_ids(uuid, uuid[], uuid[], int, text[], text, text) IS
  'Up to LEAST(p_count, 500) random IDs from the filtered question pool. p_calc_mode {all|only|exclude} AND-restricts on has_calculations (#837); p_has_image {all|only|exclude} AND-restricts on question_image_url presence (#864). Server-side ORDER BY random() avoids the 1000-row cap that biased client-side sampling (#679/#668); the 500 cap (mirroring the Zod schema in start.ts) prevents a direct caller from bypassing the Server Action with an arbitrarily large p_count.';

COMMENT ON FUNCTION public.get_filtered_question_counts(uuid, uuid[], uuid[], text[], text, text) IS
  'Per-(topic, subtopic) counts over the filtered question pool. Total = sum(n). p_calc_mode {all|only|exclude} AND-restricts on has_calculations (#837); p_has_image {all|only|exclude} AND-restricts on question_image_url presence (#864). Replaces client-side counting that truncated at the 1000-row cap (#678/#668).';
