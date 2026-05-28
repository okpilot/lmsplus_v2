# Requirements Document — Quiz Sessions RPC-Only Immutability

> **STATUS: SUPERSEDED (2026-05-28).** These requirements are not being delivered as a single spec. The work was split:
> - **R1 (block all client UPDATEs via trigger column extension)** — partially in progress; the 5 score-related columns are tracked under the `redteam-quiz-session-bugs` spec (PR 2) / issue #611 as migration `082_quiz_sessions_immutable_score_columns.sql`. Initial 10-column trigger shipped as mig `079`.
> - **R2 (`discard_quiz_session` SECURITY DEFINER RPC)** — not currently planned. `apps/web/app/app/quiz/actions/discard.ts` continues to write `quiz_sessions.deleted_at` directly under RLS.
> - **R3 (write-handshake on completion RPCs)** — not currently planned (depends on R2's session-variable mechanism).
>
> Do not use this document to drive new implementation. See `tasks.md` for the full split list and `design.md` for invalid premises (e.g. `quiz_drafts.UNIQUE(student_id)` was dropped by mig `20260313000018`). Live successor: `.spec-workflow/specs/redteam-quiz-session-bugs/`.

## Introduction

Issue #611 (HIGH severity) describes an exam-score forgery vector: an authenticated student can directly UPDATE their own active `quiz_sessions` row via PostgREST and forge `correct_count`, `score_percentage`, `passed`, and `ended_at` — completing the session with arbitrary scores and bypassing `batch_submit_quiz` entirely. The vector is exploitable today because the `students_update_sessions` RLS policy (mig `20260313000023`) permits broad UPDATE on the row owner's own active sessions without column restrictions, and the `trg_quiz_sessions_immutable_columns` trigger (mig `079` / `20260502000001`) explicitly leaves these columns mutable for the SECURITY DEFINER completion RPCs.

This spec closes the gap by making `quiz_sessions` writes **RPC-only**: no client-direct UPDATE on any column is permitted, including the existing soft-delete (`deleted_at`) flow. All session-state changes — completion, scoring, discard — must go through SECURITY DEFINER RPCs that explicitly opt-in to writing via a session-variable handshake the immutability trigger checks.

The pre-implementation audit (2026-05-05) confirmed: (a) only `quiz_sessions` exhibits this RLS-too-broad / column-not-restricted pattern in the schema, (b) only `apps/web/app/app/quiz/actions/discard.ts:61` writes `quiz_sessions` from authenticated client code today (and only the `deleted_at` column), and (c) the four score-related columns have zero direct-write callers — they are already RPC-only in practice, not by enforcement.

## Alignment with Product Vision

Steering doc `tech.md` declares as a core architectural pattern: *"Defense in depth — proxy guard + Server Action guard + RLS + DB triggers + RPC auth checks. No layer trusts another."* This spec strengthens the RLS + DB-trigger layer for `quiz_sessions` so that even if higher layers (proxy, Server Action) are bypassed, the database refuses direct writes. Steering doc `product.md` lists exam-score integrity as a foundational requirement for CAA Part ORA compliance (immutable audit trail, regulatory accountability) — this fix prevents exam-pass forgery, which would otherwise compromise the trustworthiness of the whole training-record system.

## Requirements

### Requirement 1 — Block all client-direct UPDATEs on `quiz_sessions`

**User Story:** As a system administrator, I want every UPDATE on `quiz_sessions` from an authenticated user session to be rejected at the database layer, so that exam scores and session state cannot be forged via direct PostgREST writes.

#### Acceptance Criteria

1. WHEN an authenticated user (PostgREST role `authenticated`) issues `UPDATE quiz_sessions SET <any column> WHERE id = <own session>` THEN the database SHALL reject the statement (RLS rejection or trigger exception).
2. WHEN the rejection occurs THEN the system SHALL leave every column unchanged on the target row.
3. IF the user is not the row owner THEN the database SHALL still reject the UPDATE (existing RLS guarantee preserved).
4. WHEN a service-role connection (admin client, used in test cleanup) updates `quiz_sessions` THEN the database SHALL allow the UPDATE (the service-role exemption that exists today is preserved).
5. WHEN a SECURITY DEFINER RPC opts in to writing via the session-variable handshake THEN the database SHALL allow the UPDATE for the duration of that RPC's transaction only.

### Requirement 2 — Provide a SECURITY DEFINER RPC for session discard

**User Story:** As a student, I want to discard an active quiz session I no longer want to complete, so that it no longer appears in my active-session list and does not block resuming a fresh session.

#### Acceptance Criteria

1. WHEN a student calls `discard_quiz_session(p_session_id uuid)` for a session they own that is active (`ended_at IS NULL`, `deleted_at IS NULL`) THEN the RPC SHALL set `deleted_at = now()` on that row.
2. WHEN the discard succeeds AND the session has an associated `quiz_drafts` row THEN the RPC SHALL remove the draft in the same transaction (atomic with the session soft-delete).
3. WHEN the discard succeeds THEN the RPC SHALL emit an `audit_events` row of type `quiz.session_discarded`.
4. IF the caller is not authenticated (`auth.uid()` is null) THEN the RPC SHALL raise `not_authenticated`.
5. IF the caller is not the row owner THEN the RPC SHALL raise `not_authorized` and make no changes.
6. IF the session is already ended (`ended_at IS NOT NULL`) THEN the RPC SHALL raise `session_already_ended` and make no changes.
7. IF the session is already discarded (`deleted_at IS NOT NULL`) THEN the RPC SHALL be idempotent — it SHALL return without raising and make no changes (matches existing `record_login` idempotency precedent).
8. WHEN the session mode is `internal_exam` THEN the RPC SHALL raise `internal_exam_not_discardable` (preserves the existing behavior of `discardQuiz` Server Action, which today blocks discard for internal exams).

### Requirement 3 — Preserve existing legitimate completion RPCs

**User Story:** As a student, I want to complete a quiz session normally (submit final answers, see score), so that the score is recorded against my training record.

#### Acceptance Criteria

1. WHEN a student calls `batch_submit_quiz` and the session is eligible for completion THEN the RPC SHALL update `correct_count`, `score_percentage`, `passed`, and `ended_at` as it does today.
2. WHEN `complete_quiz_session`, `complete_empty_exam_session`, or `complete_overdue_exam_session` is called by a legitimate caller THEN those RPCs SHALL update the previously-mutable columns as they do today.
3. WHEN any of the four RPCs in (1)–(2) executes its UPDATE THEN it SHALL set the session-variable handshake in the same transaction so the immutability trigger permits the write.
4. IF a developer adds a new RPC that writes to `quiz_sessions` AND forgets the handshake THEN the database SHALL reject the UPDATE at runtime (no silent failure path).

### Requirement 4 — Refactor the discard Server Action to use the new RPC

**User Story:** As a developer maintaining `apps/web/app/app/quiz/actions/discard.ts`, I want the Server Action to call the discard RPC rather than perform direct UPDATE + DELETE, so that the discard flow remains atomic and matches the new RPC-only architecture.

#### Acceptance Criteria

1. WHEN the Server Action `discardQuiz(sessionId)` is invoked THEN it SHALL call `supabase.rpc('discard_quiz_session', { p_session_id: sessionId })`.
2. WHEN the RPC returns success THEN the Server Action SHALL return success to the caller without performing any direct PostgREST writes against `quiz_sessions` or `quiz_drafts`.
3. WHEN the RPC raises an error code matching one of `not_authenticated` / `not_authorized` / `session_already_ended` / `internal_exam_not_discardable` THEN the Server Action SHALL map the error to a domain-specific message and return `{ success: false, error: <message> }`.
4. IF the RPC raises any other error THEN the Server Action SHALL log via `console.error('[discardQuiz] RPC error:', err.message)` and return a generic `{ success: false, error: 'Failed to discard quiz' }` (per code-style.md §5 — sanitize error messages; string matches the existing user-visible contract asserted by the current test at `discard.test.ts:183`).

### Requirement 5 — Red-team coverage for vectors BL / BM / BN

**User Story:** As a security reviewer, I want red-team tests proving the database rejects direct exam-score forgery attempts, so that any future regression of the RLS or trigger layer is caught in CI before reaching production.

#### Acceptance Criteria

1. WHEN the red-team spec at `apps/web/e2e/redteam/quiz-session-mutable-columns.spec.ts` runs THEN it SHALL exercise three attack cases (BL: `correct_count` + `ended_at` forge, BM: `passed = true` forge, BN: `score_percentage = 100` forge).
2. WHEN each attack runs THEN the spec SHALL: log in as a student, start a session via the legitimate flow, attempt the direct UPDATE via PostgREST as that student, assert the UPDATE is rejected (RLS or trigger error), and assert the session row is unchanged via service-role read-back.
3. WHEN the spec finishes THEN it SHALL clean up via service-role admin client (per the e2e-spec hermiticity rule in `code-style.md` §7).
4. WHEN the spec runs in CI on the redteam workflow (`pnpm --filter @repo/web e2e:redteam`) THEN all three attacks SHALL pass.

### Requirement 6 — Documentation and steering doc alignment

**User Story:** As a future developer reading the schema docs, I want `docs/database.md` and related references to reflect the new RPC-only architecture for `quiz_sessions`, so that I do not introduce a future bug by reading stale documentation.

#### Acceptance Criteria

1. WHEN the migration lands THEN `docs/database.md` §3 immutability matrix SHALL show the `quiz_sessions` row with all 15 columns frozen and zero mutable, citing both the original mig (`079` / `20260502000001`) and the new mig.
2. WHEN the migration lands THEN `docs/database.md` SHALL include a `discard_quiz_session` row in the RPC summary index.
3. WHEN the migration lands THEN `docs/database.md` SHALL note that `quiz_sessions` soft-delete is performed via `discard_quiz_session` RPC (no direct client UPDATE).
4. WHEN the migration lands THEN `docs/security.md` SHALL document the session-variable trigger handshake as the canonical "RPC writes through immutability trigger" pattern (it is the first instance of this pattern in the codebase).
5. WHEN the migration lands THEN `docs/decisions.md` SHALL contain a decision-log entry describing the RPC-only architecture choice and citing issue #611.

## Non-Functional Requirements

### Code Architecture and Modularity

- **Single Responsibility Principle**: The new `discard_quiz_session` RPC SHALL only perform discard operations (session soft-delete + draft cleanup + audit emit). It SHALL NOT take on responsibilities owned by other RPCs (e.g., session completion, scoring).
- **Modular Design**: The trigger function SHALL implement only the immutability check + session-variable bypass. The bypass mechanism SHALL be a single, named primitive (e.g., `app.quiz_sessions_writable`) reusable in any future RPC that legitimately writes the table.
- **Dependency Management**: The Server Action `discardQuiz` SHALL depend on a single RPC contract; no direct PostgREST writes against `quiz_sessions` or `quiz_drafts` from application code post-fix.

### Performance

- The session-variable handshake adds one `set_config(...)` call per legitimate RPC UPDATE — sub-millisecond overhead, negligible against existing query latency.
- The new trigger condition (`current_setting('app.quiz_sessions_writable', true) = 'true'`) is evaluated only on UPDATEs of the trigger's column list, not on SELECTs or INSERTs.

### Security

- The session-variable handshake SHALL use the LOCAL flag (`set_config(name, value, true)`) so the bypass clears at end of transaction. It SHALL NOT use session-level configuration that could persist across calls.
- The trigger SHALL preserve the existing `current_role = 'service_role'` exemption so admin-client test cleanup is unaffected.
- The new `discard_quiz_session` RPC SHALL include the standard SECURITY DEFINER guard set: explicit `auth.uid()` IS NULL check raising `not_authenticated`, `SET search_path = public`, and `AND deleted_at IS NULL` filter on every soft-deletable-table SELECT (per `docs/security.md` §15).
- The audit-event INSERT inside `discard_quiz_session` SHALL filter `deleted_at IS NULL` on any user/session FK lookup populating `actor_id` / session-derived columns (per `.claude/rules/security.md` §10).

### Reliability

- The `discard_quiz_session` RPC SHALL be idempotent on already-discarded sessions (Requirement 2.7).
- The atomicity of session soft-delete + draft hard-delete SHALL be guaranteed by Postgres transaction semantics within the RPC body (vs the current sequential Server Action implementation, which can leave drafts orphaned if step 2 fails).
- All new error codes SHALL be domain-specific and stable (`not_authenticated`, `not_authorized`, `session_already_ended`, `internal_exam_not_discardable`) so the Server Action can map them reliably.

### Usability

- No user-visible UX change. The discard button continues to work identically; only the underlying mechanism changes.
- Error messages surfaced to the user remain unchanged: existing `discardQuiz` test assertions on returned error strings SHALL continue to pass after the refactor (or be updated in the same commit if the underlying RPC error is preferable).
