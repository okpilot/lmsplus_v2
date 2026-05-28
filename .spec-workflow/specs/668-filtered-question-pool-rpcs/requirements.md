# Requirements — Filtered Question-Pool RPCs (#668 instances #678 + #679)

> Umbrella: #668 (PostgREST max_rows=1000 truncation audit). This spec covers the two P1 quiz-area sites, batched into one PR.

## Problem

Two student-quiz functions read the active question pool with an unpaginated Supabase `.select()`, silently capped at PostgREST's 1000-row default:

- **#679 — `getRandomQuestionIds`** (`apps/web/lib/queries/quiz.ts`): fetches all matching question IDs, shuffles client-side, slices to `count`. For subjects with >1000 active questions, only the first 1000 rows are ever eligible → **biased sampling** (questions past row 1000 never served).
- **#678 — `getFilteredCount`** (`apps/web/app/app/quiz/actions/lookup.ts`): fetches the pool to compute total + per-topic/subtopic counts. For >1000 questions, **counts are wrong** (truncated).

Both also have **secondary truncation** on the per-user filter reads (`student_responses`, `fsrs_cards`, `active_flagged_questions`) via `.in('question_id', ids)` when the pool is large.

## Discovered defects (beyond truncation)

1. **Filter-semantics mismatch.** `getFilteredCount` intersects active filters (AND); `getRandomQuestionIds` unions them (OR). For the same UI selection the count badge and the actual quiz disagree. Worse, `unseen` (never answered) and `incorrect` (answered wrong) are **mutually exclusive**, so the AND of `unseen + incorrect` is always empty → count shows 0 while the quiz is non-empty.
2. **Topic/subtopic empty-array mismatch.** The two functions handle explicit empty `topicIds`/`subtopicIds` arrays differently, another source of count-vs-quiz divergence.
3. **Duplication.** `quiz.ts` re-implements the unseen/incorrect/flagged reads that `filter-helpers.ts` already provides.

## Decisions (confirmed with user, 2026-05-27)

- **Architecture:** server-side **SECURITY INVOKER RPCs** (mirroring `get_question_counts` from instance #3 and the `ORDER BY random() LIMIT` pattern from `start_exam_session`). Aggregation happens in SQL, so the RPC results stay under the 1000-row cap.
- **Filter semantics:** **align both to OR/union.** The count badge will match the quiz contents, fixing the `unseen + incorrect = 0` bug.

## Requirements

### R1 — Full-pool random selection (#679)
`getRandomQuestionIds` returns up to `count` IDs sampled uniformly from the **entire** active, non-deleted, subject/topic/subtopic-scoped, filter-matching pool — regardless of pool size.

### R2 — Correct filtered counts (#678)
`getFilteredCount` returns `{ count, byTopic, bySubtopic }` computed over the **entire** matching pool, never truncated.

### R3 — Count == quiz consistency
For any identical `(subjectId, topicIds, subtopicIds, filters)`, the total from R2 equals the size of the pool R1 samples from. Guaranteed structurally by deriving both from one shared SQL pool definition.

### R4 — Union filter semantics
A question is in the pool if it matches ANY active filter (`unseen` OR `incorrect` OR `flagged`). Empty/`['all']` filters → whole scoped pool.

### R5 — Security
- SECURITY INVOKER; RLS on `questions` (`tenant_isolation`) provides org scoping + `deleted_at IS NULL`.
- Per-user filter subqueries scope explicitly with `student_id = auth.uid()` (security.md §3 — `student_responses` has multiple permissive SELECT policies).
- No correct-answer columns selected (only `id`, `topic_id`, `subtopic_id`).
- `SET search_path = public` on every function.

### R6 — No behavioral regression for callers
`getRandomQuestionIds` still returns `string[]`; `getFilteredCount` still returns `FilteredCountResult`. Callers (`start.ts`, `use-filtered-count.ts`, `quiz-config-handlers.ts`) need no signature changes (except dropping the now-unused `userId` arg in `start.ts`).

## Acceptance criteria

- [ ] New migration adds `_filtered_question_pool`, `get_random_question_ids`, `get_filtered_question_counts` (all SECURITY INVOKER, `SET search_path = public`, granted to `authenticated`).
- [ ] `getRandomQuestionIds` and `getFilteredCount` call the RPCs; client-side pool fetch/shuffle/filter removed.
- [ ] Dead helpers removed: `buildQuestionQuery`, `groupCounts` (lookup-helpers.ts), `applyFilters` (filter-helpers.ts), and `quiz.ts`'s `filterUnseen/filterIncorrect/filterFlagged`; obsolete test files deleted.
- [ ] Unit tests rewritten to mock the `rpc` wrapper; assert param mapping (filters stripped of `all`; `null` for undefined arrays), result aggregation, `Array.isArray` guard, error→empty, auth gate.
- [ ] `docs/database.md` documents the new RPCs; `docs/plan.md` marks #678/#679.
- [ ] `pnpm check-types`, `pnpm lint`, full unit suite, `pnpm build` all green; migration applies on clean DB reset.
- [ ] red-team agent reviewed (migration + quiz actions touched); cross-user isolation verified.
