# Requirements Document — Internal Exam Mode

## Introduction

The school needs an **Internal Exam Mode** for graded, official assessments that count toward EASA PPL course completion. Practice Exam (already shipped, `mode='mock_exam'`) is for self-study and cannot serve as the official assessment because it has no admin gate, no per-attempt audit, and pollutes practice statistics.

Internal Exam Mode introduces an admin-issued, single-use, 24-hour code that unlocks one official attempt for one specific student on one specific subject. Each issued code is one attempt; retakes require a new code. Sessions cannot be discarded. Reports for internal exams are kept fully separate from practice and quiz reports.

The feature reuses the practice-exam stack (`exam_configs`, `quiz_sessions`, countdown timer, answer buffer, results card) by introducing a new mode value `internal_exam` and minimal mode-aware branching.

## Alignment with Product Vision

Per `docs/plan.md`, official internal assessments are a Phase 5+ requirement for ATO course delivery. This feature is a prerequisite for any "course completion" certificate the school issues, and is the foundation for a future EASA-recognised flow (out of scope here).

## Requirements

### Requirement 1 — Admin issues a single-use exam code

**User Story:** As an admin, I want to issue a one-time exam code to a specific student for a specific subject, so that I control when and for what subject they take the official exam.

#### Acceptance Criteria

1. WHEN an admin opens `/app/admin/internal-exams` AND clicks "Issue code" AND selects a student + subject THEN the system SHALL generate an 8-character alphanumeric code (uppercase, excluding ambiguous characters `0`, `O`, `I`, `1`).
2. IF no `exam_configs` row exists for the selected subject (or the row has `enabled=false` or is soft-deleted) THEN the system SHALL block issuance and display "Configure exam for this subject first" with a link to `/app/admin/exam-config`.
3. WHEN a code is generated THEN the system SHALL store it in plaintext in `internal_exam_codes` with `expires_at = issued_at + 24 hours`, `consumed_at = NULL`, `voided_at = NULL`.
4. WHEN issuance succeeds THEN the system SHALL display the code once in a copy-to-clipboard panel AND log an `internal_exam.code_issued` audit event with `actor_id = admin`, `student_id`, `subject_id`, `code_id`.
5. IF an admin issues a second code for the same `(student_id, subject_id)` while a prior code is still active (unconsumed + unexpired + not voided) THEN the system SHALL allow it (each code is a separate attempt) but SHALL surface a warning "Active code already exists, expires at HH:MM".

### Requirement 2 — Student starts an internal exam by entering the code

**User Story:** As a student, I want to see which official exams have been issued to me and start one by entering the code I received, so that I can sit the assessment.

#### Acceptance Criteria

1. WHEN a student opens the new top-level nav item "Internal Exam" AND views the **Available** tab THEN the system SHALL list every code where `student_id = auth.uid()` AND `consumed_at IS NULL` AND `voided_at IS NULL` AND `expires_at > now()` AND `deleted_at IS NULL`, showing **subject name + expiry timestamp only** (the code value itself MUST NOT be displayed).
2. WHEN the student clicks "Start" on an available row THEN the system SHALL open a modal prompting for the code value.
3. WHEN the student submits the code THEN the system SHALL call `start_internal_exam_session(p_code)` which validates: code exists, not consumed, not voided, not expired, `student_id = auth.uid()`, code's `subject_id` matches the row clicked. On success it SHALL create a `quiz_sessions` row with `mode='internal_exam'`, mark the code consumed (`consumed_at = now()`, `consumed_session_id = new session id`), and emit an `internal_exam.started` audit event.
4. IF validation fails THEN the system SHALL return a domain-specific error (`code_not_found`, `code_expired`, `code_already_used`, `code_voided`, `code_not_yours`) and SHALL NOT reveal whether the code exists for a different student.
5. WHEN the session is created THEN the student SHALL be redirected to the existing exam-session UI (`/app/quiz/session?id=...`) which SHALL render the same countdown timer, answer buffer, and navigation as practice exam, with the badge label "Internal Exam" instead of "Practice Exam".

### Requirement 3 — Internal exam cannot be discarded

**User Story:** As the school, I want the student to be unable to abandon a started internal exam, so that every issued attempt produces a final pass/fail record.

#### Acceptance Criteria

1. IF the student is in an active `mode='internal_exam'` session THEN the UI SHALL NOT render any "Discard" button or other client-side abandon path.
2. IF the existing `discard_quiz_session` (or equivalent) Server Action is called with a session whose `mode='internal_exam'` THEN it SHALL reject with error `cannot_discard_internal_exam` and SHALL NOT modify the session.
3. WHEN the student manually submits an internal exam with fewer than `total_questions` answered THEN the system SHALL accept the submission and treat unanswered questions as incorrect (score = `correct_count / total_questions`).
4. WHEN the session's `started_at + time_limit_seconds` deadline passes without submission THEN the existing `complete_overdue_exam_session` (extended for `internal_exam`) SHALL auto-complete the session, treating unanswered as incorrect, and emit `internal_exam.expired` audit event.

### Requirement 4 — Admin can void an unfinished code or session

**User Story:** As an admin, I want to void a code (and cancel its session if active), so that I can correct an erroneous issuance or terminate an in-progress attempt.

#### Acceptance Criteria

1. WHEN an admin clicks "Void" on an unconsumed code AND provides a reason THEN the system SHALL set `voided_at = now()`, `voided_by = admin`, `void_reason = reason` on the code row and emit `internal_exam.code_voided` audit event.
2. WHEN an admin clicks "Void" on a code whose session is **active** (consumed but not yet ended) THEN the system SHALL void the code AND end the session with `passed = false`, `ended_at = now()`, computing score from currently-buffered answers (treat unanswered as incorrect), AND emit both `internal_exam.code_voided` and `internal_exam.expired` audit events.
3. IF the code has been consumed AND its session is **already finished** (`ended_at IS NOT NULL`) THEN the system SHALL block the void action and display "Cannot void a finished attempt — record is final".
4. The void RPC SHALL require `is_admin()` and `auth.uid()` checks and SHALL run with `SECURITY DEFINER SET search_path = public`.

### Requirement 5 — Internal exam reports are fully separated from practice reports

**User Story:** As a student and as an admin, I want internal exam attempts visible only in the Internal Exam reports tab and absent from practice/quiz reports, so that official records are not mixed with practice data.

#### Acceptance Criteria

1. WHEN any student or admin views existing reports under `/app/reports` THEN the system SHALL NOT include rows where `quiz_sessions.mode = 'internal_exam'`.
2. WHEN a student opens the **My Reports** tab inside `/app/internal-exam` THEN the system SHALL list every `mode='internal_exam'` session for `student_id = auth.uid()` with: subject, attempt number (1-indexed by `started_at` per subject), started_at, ended_at, score, pass/fail badge, answered_count / total_questions.
3. WHEN an admin opens the admin internal exam dashboard THEN the system SHALL list all `mode='internal_exam'` sessions across the org (filterable by student / subject / status).
4. Each retake SHALL appear as a distinct row (no aggregation) — counted attempts come from distinct `quiz_sessions` rows linked to distinct `internal_exam_codes` rows.

### Requirement 6 — Top-level navigation entry

**User Story:** As a student, I want a clearly labelled top-level "Internal Exam" tab in the main navigation, so that I can find official exams without confusion with practice mode.

#### Acceptance Criteria

1. WHEN any authenticated student renders the main sidebar THEN it SHALL include a top-level item "Internal Exam" linking to `/app/internal-exam`, ordered between "Quiz" and "Reports".
2. WHEN any authenticated admin renders the admin sidebar THEN it SHALL include a top-level item "Internal Exams" linking to `/app/admin/internal-exams`, ordered after "Exam Config".
3. The labels for `mock_exam` and `internal_exam` SHALL come from a single `MODE_LABELS` constant in `apps/web/lib/constants/exam-modes.ts` (closes #544).

## Non-Functional Requirements

### Code Architecture and Modularity
- Reuse existing exam components, hooks, and server actions wherever possible. New code is constrained to: code-issuance/start/void RPCs, internal-exam admin pages, internal-exam student pages, mode-aware label constant, mode filter on existing report queries.
- File size: page.tsx ≤ 80 lines; components ≤ 150; Server Action files ≤ 100; hooks ≤ 80; SQL migrations ≤ 300.
- No barrel files. Tests co-located.

### Performance
- Code generation collision retry budget ≤ 5 attempts before erroring; expected collision probability is negligible (8-char alphanumeric ≈ 1 in 30^8).
- Available codes list limited to 100 rows per request (no pagination needed at expected scale).

### Security
- All new RPCs are `SECURITY DEFINER` with explicit `auth.uid()` check, `SET search_path = public`, and `deleted_at IS NULL` filters on every user/session/subject/exam_config lookup including audit-event INSERT subqueries (per `.claude/rules/security.md` rule 10).
- `internal_exam_codes` row-level security: student SELECT limited to own rows where `consumed_at IS NULL AND voided_at IS NULL AND expires_at > now() AND deleted_at IS NULL`, with the `code` column accessible in the row but not surfaced in any UI list view (the UI selects only `id, subject_id, expires_at`); admin full access scoped to `organization_id`. INSERT/UPDATE on the table only via SECURITY DEFINER RPCs (no direct policies).
- `mode='internal_exam'` added to `quiz_sessions.mode` CHECK constraint and to RLS where mode-discriminated.
- Audit events: `internal_exam.code_issued`, `internal_exam.started`, `internal_exam.completed`, `internal_exam.expired`, `internal_exam.code_voided` — all with `actor_role`, `actor_id`, `subject_id`, `student_id`, `code_id` (where applicable).
- Code values are stored plaintext (per product decision — admin must be able to look them up). Plaintext is acceptable because: codes are single-use, expire in 24h, scoped to one student, and surfaced only via admin-authenticated RPC.

### Reliability
- Code consumption is atomic: `start_internal_exam_session` performs the code-validity check, code-mark-consumed, and session-create within a single transaction (RPC runs in one statement).
- Auto-complete on overdue: existing `complete_overdue_exam_session` extended to accept `internal_exam`. The same idempotency guarantees apply.

### Usability
- Issued code is shown in a high-contrast copy-to-clipboard panel after generation, with a notice "This code will not be shown again — copy it now."
- Available exams tab shows expiry as relative time ("expires in 18h 22m") plus exact timestamp on hover.
- Submission confirmation modal explicitly warns "Unanswered questions will count as incorrect" when count < total at submit time.
