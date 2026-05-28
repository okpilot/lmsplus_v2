-- Filtered question-pool RPCs for the student quiz builder (#678 + #679 / umbrella #668).
--
-- Replaces two client-side reads that silently truncated at the PostgREST 1000-row cap:
--   #679 — getRandomQuestionIds: fetched the whole pool, shuffled, sliced → biased sampling
--          past row 1000.
--   #678 — getFilteredCount:    fetched the pool to compute total + per-(topic, subtopic)
--          counts → wrong counts past row 1000.
--
-- Both call sites and the new RPCs derive from ONE shared SQL pool definition
-- (`_filtered_question_pool`), so for any (subject, topic, subtopic, filters) tuple
-- the badge count is guaranteed to equal the size of the pool that the quiz samples
-- from — fixing the long-standing AND-vs-OR + unseen-incorrect-mutex bug at the same time.
--
-- SECURITY INVOKER + `tenant_isolation` RLS on `questions` scopes the org membership
-- and `deleted_at IS NULL` automatically. The explicit `status = 'active'` and
-- `deleted_at IS NULL` mirror `get_question_counts`/`start_exam_session` as defense
-- in depth.

---------------------------------------------------------------------------
-- Internal helper: the shared, filtered, org-scoped question pool.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._filtered_question_pool(
  p_subject_id   uuid,
  p_topic_ids    uuid[],
  p_subtopic_ids uuid[],
  p_filters      text[]
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
  p_filters      text[]
)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY INVOKER
VOLATILE
SET search_path = public
AS $$
  SELECT p.id
  FROM public._filtered_question_pool(p_subject_id, p_topic_ids, p_subtopic_ids, p_filters) p
  ORDER BY random()
  -- Server-side cap of 500 mirrors the Zod schema in apps/web/app/app/quiz/actions/start.ts.
  -- Defense in depth: the RPC is GRANT EXECUTE TO authenticated, so a direct caller could
  -- bypass the Server Action's Zod validation and pass an arbitrarily large p_count.
  -- LEAST(..., 500) prevents an unbounded ORDER BY random() workload (CLAUDE.md "never
  -- trust client input"). 500 matches the canonical max quiz size.
  LIMIT LEAST(GREATEST(p_count, 0), 500)
$$;

---------------------------------------------------------------------------
-- #678 — per-(topic, subtopic) counts over the filtered pool.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_filtered_question_counts(
  p_subject_id   uuid,
  p_topic_ids    uuid[],
  p_subtopic_ids uuid[],
  p_filters      text[]
)
RETURNS TABLE (topic_id uuid, subtopic_id uuid, n bigint)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT p.topic_id, p.subtopic_id, count(*)::bigint AS n
  FROM public._filtered_question_pool(p_subject_id, p_topic_ids, p_subtopic_ids, p_filters) p
  GROUP BY p.topic_id, p.subtopic_id
$$;

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._filtered_question_pool(uuid, uuid[], uuid[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_question_ids(uuid, uuid[], uuid[], int, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_filtered_question_counts(uuid, uuid[], uuid[], text[]) TO authenticated;

---------------------------------------------------------------------------
-- Comments
---------------------------------------------------------------------------
COMMENT ON FUNCTION public._filtered_question_pool(uuid, uuid[], uuid[], text[]) IS
  'Internal: active, org-scoped, subject/topic/subtopic + per-user-filter (UNION) question pool. SECURITY INVOKER; filters scope student_id = auth.uid() (§3). Used by get_random_question_ids and get_filtered_question_counts so count == quiz (#678/#679/#668). Prefer the wrapper RPCs over calling directly (direct calls may hit the PostgREST 1000-row cap).';

COMMENT ON FUNCTION public.get_random_question_ids(uuid, uuid[], uuid[], int, text[]) IS
  'Up to LEAST(p_count, 500) random IDs from the filtered question pool. Server-side ORDER BY random() avoids the 1000-row cap that biased client-side sampling (#679/#668); the 500 cap (mirroring the Zod schema in start.ts) prevents a direct caller from bypassing the Server Action with an arbitrarily large p_count.';

COMMENT ON FUNCTION public.get_filtered_question_counts(uuid, uuid[], uuid[], text[]) IS
  'Per-(topic, subtopic) counts over the filtered question pool. Total = sum(n). Replaces client-side counting that truncated at the 1000-row cap (#678/#668).';
