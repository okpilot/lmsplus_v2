# Requirements — Red-Team Quiz Session Bugs (Sub-Batch 1 of Group A)

## Context

Group A of the red-team backlog (umbrella issue #640) covers quiz session integrity. Two of the 13 Group A issues are real exploitable bugs; the rest are missing test coverage. This spec covers only the two bug fixes — Sub-Batch 1 in the Group A roadmap.

**Cadence:** Model B — ship Sub-Batch 1 now, re-plan remaining Group A work after.

## In Scope

### Issue #611 — quiz_sessions mutable-column immutability
**Vectors:** BL/BM/BN

**Vulnerability:** Trigger `trg_quiz_sessions_immutable_columns` (mig 079) freezes 10 columns but leaves `correct_count`, `score_percentage`, `passed`, `ended_at` mutable. Students can self-complete an exam with forged scores via direct PostgREST UPDATE under their existing RLS policy `students_own_sessions` (mig 001).

**Fix:** Extend the trigger's freeze list to include `correct_count`, `score_percentage`, `passed`, `ended_at`. Extend the bypass exemption to allow SECURITY DEFINER RPCs (`current_role = 'postgres'`) in addition to the existing `service_role` exemption.

**Acceptance criteria:**
1. Authenticated student calling `UPDATE quiz_sessions SET correct_count = N WHERE id = <own session>` raises an "immutable" exception.
2. Same for `score_percentage`, `passed`, `ended_at`.
3. SECURITY DEFINER RPCs (`batch_submit_quiz`, `complete_quiz_session`, `complete_overdue_exam_session`, `complete_empty_exam_session`) continue to update these columns successfully (regression check).
4. New red-team spec `quiz-session-mutable-columns.spec.ts` asserts (1)+(2) for each of the 4 columns AND verifies post-RPC values are correct.
5. `assertSessionStillLocked()` helper in `quiz-session-config-injection.spec.ts` is extended to cover the 4 new frozen columns (deep-equal coverage).

### Issue #629 — start_quiz_session p_mode validation
**Vector:** mode confusion via `mock_exam` or `internal_exam`

**Vulnerability:** `start_quiz_session(p_mode, ...)` (mig 080) accepts any value satisfying the `quiz_sessions.mode` CHECK constraint, which since mig 058 is `('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam')`. Only `start_exam_session` should produce `mock_exam` sessions, and `start_internal_exam_session` is the sole producer of `internal_exam` sessions. A student calling `start_quiz_session(p_mode := 'mock_exam', ...)` skips exam config validation (time limit, pass mark, distribution) and creates a fake exam session that downstream RPCs treat as legitimate. Same risk for `internal_exam`.

**Fix:** Reject `p_mode` values outside `{'smart_review', 'quick_quiz'}` with `RAISE EXCEPTION 'mode_not_allowed'`.

**Acceptance criteria:**
1. `start_quiz_session(p_mode := 'mock_exam', ...)` raises `mode_not_allowed`.
2. `start_quiz_session(p_mode := 'internal_exam', ...)` raises `mode_not_allowed` (live exam-class mode since mig 058, not future-proofing).
3. Existing `quick_quiz` and `smart_review` callers continue to work (regression check via existing tests).
4. New red-team spec `start-quiz-session-mode-confusion.spec.ts` asserts (1) and (2) and confirms no row is inserted on rejection.

## Out of Scope

- Other Group A issues (#615, #603, #562, #561, #560, #559, #557, #546, #257, #256, #551) — re-planned in subsequent sub-batches.
- Adding mutable-column protection to other tables (e.g., `student_responses`, `quiz_session_answers` — already immutable per their table policies).
- Refactoring the trigger function structure (column-level GRANT alternative considered and deferred — current trigger pattern is the project standard, mirrors `protect_users_sensitive_columns`).

## Non-Functional Requirements

- **Backwards compatibility:** Existing tests must continue to pass without modification (except `quiz-session-config-injection.spec.ts` which gains 4 columns in its `FROZEN_COLUMNS_SELECT` constant and `assertSessionStillLocked()` helper).
- **Migration ordering:** Both bug fixes are independent; can ship as separate PRs in either order. Recommend #629 first (smaller blast radius) so #611's larger trigger change rides on a green main.
- **Audit logging:** Both RPCs already write to `audit_events`; no new audit work needed.
- **Documentation:** `docs/database.md` "RPC summary" + "Soft-delete matrix" sections may need updates if they list trigger-protected columns. Verify during execution.
