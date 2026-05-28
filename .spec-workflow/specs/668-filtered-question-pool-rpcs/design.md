# Design — Filtered Question-Pool RPCs (#678 + #679)

## Overview

Introduce one shared SQL pool helper plus two thin aggregating RPCs. Both consumer functions become thin RPC callers. Count==quiz consistency is structural (single pool definition).

## Migration: `supabase/migrations/20260528000001_filtered_question_pool_rpcs.sql`

### `_filtered_question_pool` (shared internal helper)

```sql
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
    -- topic/subtopic scope: NULL array = unconstrained; non-NULL = matched with ANY
    -- (empty array matches nothing for that dimension); OR across dimensions
    AND (
      (p_topic_ids IS NULL AND p_subtopic_ids IS NULL)
      OR (p_topic_ids IS NOT NULL AND q.topic_id = ANY (p_topic_ids))
      OR (p_subtopic_ids IS NOT NULL AND q.subtopic_id = ANY (p_subtopic_ids))
    )
    -- per-user filters, UNION semantics; NULL/empty p_filters = whole scoped pool
    AND (
      p_filters IS NULL
      OR cardinality(p_filters) = 0
      OR ('unseen' = ANY (p_filters) AND NOT EXISTS (
            SELECT 1 FROM student_responses sr
            WHERE sr.student_id = auth.uid() AND sr.question_id = q.id))
      OR ('incorrect' = ANY (p_filters) AND EXISTS (
            SELECT 1 FROM fsrs_cards fc
            WHERE fc.student_id = auth.uid()
              AND fc.last_was_correct = false
              AND fc.question_id = q.id))
      OR ('flagged' = ANY (p_filters) AND EXISTS (
            SELECT 1 FROM active_flagged_questions af
            WHERE af.student_id = auth.uid() AND af.question_id = q.id))
    )
$$;
```

Notes:
- SECURITY INVOKER → `questions` RLS (`tenant_isolation`) auto-scopes org + `deleted_at IS NULL`; the explicit `status='active' AND deleted_at IS NULL` mirror `get_question_counts`/`start_exam_session` (defense in depth).
- Explicit `student_id = auth.uid()` on `student_responses` is **required** by §3 (two permissive SELECT policies: `students_read_responses` + `instructors_read_students` → RLS alone would over-scope to the instructor policy). On `fsrs_cards` (single `students_own_cards` policy) and `active_flagged_questions` (security_invoker view, single underlying policy, already filters `deleted_at IS NULL`), the explicit scope is defense-in-depth, **not** §3-mandated.
- `auth.uid()` NULL (unauthenticated) → `questions` RLS returns no rows → empty pool. Safe.

### `get_random_question_ids` (#679)

```sql
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
VOLATILE                       -- random() is volatile
SET search_path = public
AS $$
  SELECT p.id
  FROM public._filtered_question_pool(p_subject_id, p_topic_ids, p_subtopic_ids, p_filters) p
  ORDER BY random()
  LIMIT LEAST(GREATEST(p_count, 0), 500)  -- defense in depth: mirrors Zod cap in start.ts
$$;
```

### `get_filtered_question_counts` (#678)

```sql
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
```

### Grants + comments

```sql
GRANT EXECUTE ON FUNCTION public._filtered_question_pool(uuid, uuid[], uuid[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_question_ids(uuid, uuid[], uuid[], int, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_filtered_question_counts(uuid, uuid[], uuid[], text[]) TO authenticated;

COMMENT ON FUNCTION public._filtered_question_pool(uuid, uuid[], uuid[], text[]) IS
  'Internal: active, org-scoped, subject/topic/subtopic + per-user-filter (UNION) question pool. SECURITY INVOKER; filters scope student_id = auth.uid() (§3). Used by get_random_question_ids and get_filtered_question_counts so count == quiz (#678/#679/#668). Prefer the wrapper RPCs over calling directly (direct calls may hit the PostgREST 1000-row cap).';
COMMENT ON FUNCTION public.get_random_question_ids(uuid, uuid[], uuid[], int, text[]) IS
  'Up to p_count random IDs from the filtered question pool. Server-side ORDER BY random() avoids the 1000-row cap that biased client-side sampling (#679/#668).';
COMMENT ON FUNCTION public.get_filtered_question_counts(uuid, uuid[], uuid[], text[]) IS
  'Per-(topic, subtopic) counts over the filtered question pool. Total = sum(n). Replaces client-side counting that truncated at the 1000-row cap (#678/#668).';
```

## TypeScript changes

### `apps/web/lib/queries/quiz.ts`
- Rewrite `getRandomQuestionIds` to call `rpc<{ id: string }[]>(supabase, 'get_random_question_ids', { p_subject_id, p_topic_ids: topicIds ?? null, p_subtopic_ids: subtopicIds ?? null, p_count: count, p_filters: activeFilters })`, where `activeFilters = filters?.filter(f => f !== 'all') ?? []`. Guard `Array.isArray(data) ? data.map(r => r.id) : []`; log + `[]` on error.
- **Drop the `userId` opts field** (RPC uses `auth.uid()`).
- Delete `filterUnseen`, `filterIncorrect`, `filterFlagged`, the local `UntypedClient`/`UntypedQuery` types, and any now-unused `QuestionIdRow`/`QuestionFilterRef` imports. (Verify in impact analysis below.)

### `apps/web/app/app/quiz/actions/start.ts`
- Remove the `userId` argument from the `getRandomQuestionIds(...)` call. No other change.

### `apps/web/app/app/quiz/actions/lookup.ts`
- Rewrite `getFilteredCount` to call `rpc<{ topic_id: string; subtopic_id: string | null; n: number | string }[]>(supabase, 'get_filtered_question_counts', { p_subject_id: subjectId, p_topic_ids: topicIds ?? null, p_subtopic_ids: subtopicIds ?? null, p_filters: filters.filter(f => f !== 'all') })`.
- Aggregate rows into `{ count, byTopic, bySubtopic }` with `Number(r.n)` coercion (mirror `getSubjectsWithCounts`). Keep the auth gate and `FilteredCountSchema.parse`. Drop the `hasTopics/hasSubtopics` bail (SQL handles empties consistently).
- **Preserve the semantics comment** (carried from the old code): `// undefined → null to RPC = unconstrained (whole subject pool); [] → empty array = match nothing (topic_id = ANY('{}') is always false).`
- Remove imports of `buildQuestionQuery`, `groupCounts`, `applyFilters`.

### Call-site scoping (context — both correct)
- `use-quiz-config.ts` (count refetch) passes **all** subject topic/subtopic IDs → the badge reflects a whole-subject filtered count.
- `use-quiz-start.ts` converts empty selections to `undefined` before starting a quiz.
- So the `topicIds: []` + `subtopicIds: undefined` case is **test-only** in practice; aligning it to `count: 0` (match nothing) removes the count-vs-quiz divergence without affecting a real UI path.

### `apps/web/app/app/quiz/actions/lookup-helpers.ts`
- Delete `buildQuestionQuery` and `groupCounts`. If the file is then empty, delete the file (and its `.test.ts`).

### `apps/web/app/app/quiz/actions/filter-helpers.ts`
- Delete `applyFilters` and its local types. Delete the file (and its `.test.ts`) if empty.

## Tests

### `apps/web/lib/queries/quiz.test.ts`
- **Delete all 5 `getRandomQuestionIds` describe blocks** (≈ lines 189–513): the base suite, the `empty topic/subtopic arrays short-circuit` suite, the `OR logic` suite, the `flagged filter` suite, and the `filter error paths` suite. They pass the now-removed `userId` opt and set up multi-call `mockFrom` filter sequences.
- **Keep `mockFrom` in `vi.hoisted()`** — still used by the surviving `getSubjectsWithCounts` / `getTopicsForSubject` / `getSubtopicsForTopic` / `getTopicsWithSubtopics` suites.
- Add new `rpc`-mocked suite asserting: maps `{id}`→ids; passes `p_filters` without `'all'`; `p_topic_ids`/`p_subtopic_ids` are `null` when arrays undefined; `Array.isArray` guard (non-array → `[]`); error → `[]` + `console.error`.

### `apps/web/app/app/quiz/actions/lookup.test.ts`
- Switch the 8 `unseen/incorrect/flagged` behavior tests (≈ L277–418) from two-call `mockFrom` sequences to a single `mockRpc` returning grouped `{topic_id, subtopic_id, n}` rows.
- **Bail-logic block (≈ L494–538) — assertions change (intentional):**
  - L495 `topicIds=[]`, `subtopicIds=undefined` — expected flips **`count: 2` → `count: 0`** (empty array matches nothing).
  - L510 `subtopicIds=[]`, `topicIds=undefined` — expected flips **`count: 1` → `count: 0`**.
  - L525 both empty — stays `count: 0`, but switch from `mockFrom`-not-called to `mockRpc` (RPC is now always called).
  - Rename/retitle the block to describe the new semantics ("empty array = match nothing") and document the change in a test comment.
- Add: total/byTopic/bySubtopic aggregation; `Number(n)` coercion (string `n`); auth gate; invalid input → empty; error → empty.

### Deletions
- Delete `lookup-helpers.test.ts` and `filter-helpers.test.ts` (their functions are removed).

## Docs
- `docs/database.md` — RPC summary rows + full entries for the two public RPCs (params, returns, INVOKER + §3 note, migration ref, #678/#679/#668 rationale); note the internal `_filtered_question_pool`.
- `docs/plan.md` — mark #678 + #679 fixed under #668.

## Risks / edge cases
- **Counts row volume:** `get_filtered_question_counts` returns one row per distinct (topic, subtopic) — bounded by syllabus size (low hundreds), well under 1000. ✓
- **`random()` volatility:** `get_random_question_ids` marked `VOLATILE`.
- **NULL `p_filters`:** handled (`IS NULL OR cardinality = 0`).
- **Perf:** correlated `EXISTS` per pool row; `fsrs_cards` has `UNIQUE(student_id, question_id)`; verify/index `student_responses(student_id, question_id)` if slow (note only — correctness unaffected, pool bounded by subject size).
- **Edge-case behavior change:** explicit empty `topicIds` with undefined `subtopicIds` now yields 0 in both functions (previously `getFilteredCount` counted the whole subject). This is the intended count==quiz alignment.
- **Type cleanup:** deleting helpers may orphan shared types — verified in impact analysis before execution.
