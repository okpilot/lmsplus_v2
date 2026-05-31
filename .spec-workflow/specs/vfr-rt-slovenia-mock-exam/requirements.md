# Requirements Document — VFR RT Slovenia Mock Exam

## Introduction

VictorOne offers an English Phraseology exam to PPL(A) students seeking the Slovenia VFR Radiotelephony qualification. The exam is currently administered manually by an examiner via a third-party "Safe Exam Browser" environment with proctoring over MS Teams. This spec brings the exam in-house as a timed, computer-graded mock-exam mode inside the existing LMS — students can self-practice the exam under the same time pressure and scoring rules they will face in the real session, with immediate per-part feedback.

The official exam structure (per VictorOne's `English_Phraseology_Exam_Briefing_Package_1.pdf`):

- **30-minute total timer**, free navigation, edit-before-submit.
- **Part 1 — Aviation Acronyms** — 8 acronyms drawn at random from a closed list of 40. Student writes the meaning; acceptable-list normalized match.
- **Part 2 — Fill-in-the-Blank** — 9 short multi-turn ATC/pilot dialog tasks. Each task contains N blanks with canonical answers. Score per task is the mean of its blanks; Part 2 score is the mean of its 9 tasks.
- **Part 3 — Multiple-Choice** — 8 questions on number transmission, MAYDAY/PAN-PAN sequencing, position-report sequencing, traffic-pattern parts.
- **Pass criterion**: ≥75% on EACH of the three parts (per-part, not aggregate).

This is v1: just the mock-exam feature. Course-model refactor and per-part practice drills are deferred to a future spec. VFR RT content lives in a dedicated `easa_subjects` row created via seed, alongside the existing PPL subjects — no course-tagging changes yet.

## Alignment with Product Vision

`docs/plan.md` Phase 4 lists "additional licence-specific exam modes" as a downstream goal. The existing `mock_exam` and `internal_exam` modes both prove the timed-exam shape (timer, frozen question IDs in `quiz_sessions.config.question_ids`, per-mode RPC, completion report). VFR RT is the first mode that needs **non-multiple-choice question types** and **per-part scoring**, so the work serves a dual purpose: ship one product (VFR RT for VictorOne) and unlock future Slovenia-, EASA-, and country-specific exam modes that require similar shapes (e.g., DGAC FCL.055 French RT, UK CAA RT exam).

Steering doc `product.md` lists "in-house mock exam fidelity" as a foundational pillar of the EASA training pipeline — every published exam mode must match the rules of the real exam exactly so that practice scores predict real-exam outcomes. The 30-min / per-part-75% / closed-acronym-list / per-blank-mean rules below are not parameters to tune — they are contract-bound to the briefing package.

## Requirements

### Requirement 1 — New question types: `short_answer` and `dialog_fill`

**User Story:** As an instructor authoring VFR RT content, I want to add questions that are NOT four-option multiple choice — specifically (a) acronym → meaning short answers and (b) multi-turn dialog tasks with blanked-out phrases — so that the mock exam mirrors the real exam's three parts.

#### Acceptance Criteria

1. WHEN a new question is created with `question_type = 'short_answer'` THEN the system stores a `canonical_answer` and zero-or-more `accepted_synonyms` (string array) on the question row.
2. WHEN a new question is created with `question_type = 'dialog_fill'` THEN the system stores a `dialog_template` containing pilot/ATC turns and `{{n|canonical; var1; var2}}` blank tokens, plus an ordered `blanks_config` array enumerating per-blank canonical + synonyms.
3. WHEN a question is created with `question_type = 'multiple_choice'` (default) THEN the existing `options` JSONB shape is unchanged — backward compatibility for all existing PPL questions.
4. IF the value of `question_type` is neither of the three enum values THEN the INSERT is rejected at the database CHECK constraint.
5. WHEN existing PPL questions are queried THEN they continue to function with no migration-time data changes other than the `question_type` column being defaulted to `'multiple_choice'`.

### Requirement 2 — `vfr_rt_exam` quiz-session mode

**User Story:** As a student preparing for the VictorOne VFR RT exam, I want to start a mock exam that locks in a randomly-sampled question set (8 + 9 + 8), starts a 30-minute timer, and prevents discard mid-attempt — so that the practice matches the proctored conditions.

#### Acceptance Criteria

1. WHEN a student starts a VFR RT mock exam THEN a `quiz_sessions` row is inserted with `mode = 'vfr_rt_exam'`, `time_limit_seconds = 1800`, `total_questions = 25`, and `config.question_ids` populated by the sampling algorithm in R4.
2. WHEN a `vfr_rt_exam` session is in progress THEN the discard Server Action (`apps/web/app/app/quiz/actions/discard.ts`) rejects the attempt with `'cannot_discard_vfr_rt_exam'` (mirrors the existing `internal_exam` protection).
3. WHEN the 30-minute timer elapses THEN any session still in progress is auto-completed with the answers submitted so far counted; unanswered blanks/questions score 0.
4. WHEN a student tries to start a `vfr_rt_exam` while another `vfr_rt_exam` session for the same student is still active THEN the existing in-flight session is resumed (no double-attempt), same idempotency pattern as `internal_exam`.
5. WHEN a `vfr_rt_exam` session is queried by anyone other than the owning student or an admin THEN RLS rejects the read.

### Requirement 3 — Per-part scoring and ≥75% pass criterion

**User Story:** As a student finishing a mock exam, I want to see exactly how I scored on each of the three parts AND know whether I would have passed under the real exam's per-part 75% rule — so that I can identify which part needs more practice.

#### Acceptance Criteria

1. WHEN the exam is graded THEN the result includes three separate per-part scores (`part1_pct`, `part2_pct`, `part3_pct`) AND a `passed_overall` boolean.
2. WHEN any single part scores below 75% THEN `passed_overall = false` regardless of the other parts' scores.
3. WHEN `passed_overall = true` THEN ALL three parts are ≥75%.
4. WHEN Part 1 (acronyms, short_answer) is graded THEN each acronym is scored 0 or 1 by acceptable-list normalized match (case-insensitive, whitespace/punctuation/hyphen collapsed; NO diacritic folding). Part 1 score = correct / 8.
5. WHEN Part 2 (dialog_fill) is graded THEN for each of the 9 tasks: task score = (blanks correct / blanks total) using the same normalized matching rule per-blank. Part 2 score = mean of the 9 task scores.
6. WHEN Part 3 (multiple_choice) is graded THEN each MC question is 0 or 1 by selected-option-id match. Part 3 score = correct / 8.
7. WHEN any unanswered question or unanswered blank exists at submission time THEN it scores 0 (no penalty escalation, no partial credit for "almost right").
8. WHEN the report page is rendered THEN it shows per-part scores, the 75% threshold line for each part, which parts failed, and the per-question/per-task breakdown so the student can review wrong answers.

### Requirement 4 — Mock sampling (8 + 9 + 8, frozen at session start)

**User Story:** As a student taking repeated mock attempts, I want each attempt to draw a different random set of questions from the available pool — so that I'm preparing for the exam's content space, not memorizing one specific permutation.

#### Acceptance Criteria

1. WHEN a `vfr_rt_exam` session starts THEN the RPC samples exactly 8 `short_answer` questions, 9 `dialog_fill` questions, and 8 `multiple_choice` questions from the VFR RT subject, mode `random()` per attempt.
2. WHEN sampling THEN duplicate question IDs across the three parts are prevented at the SQL level (per-part DISTINCT is guaranteed by `ORDER BY random() LIMIT`).
3. WHEN the sample is complete THEN the IDs are stored in `quiz_sessions.config.question_ids` as a flat ordered array (Part 1 first, then Part 2, then Part 3) for `get_quiz_questions()` lookup — and `config.parts` records the **exclusive** end-index boundaries (`{p1_end: 8, p2_end: 17, p3_end: 25}` where Part 1 = `question_ids.slice(0, 8)`, Part 2 = `slice(8, 17)`, Part 3 = `slice(17, 25)`).
4. WHEN the pool for any part is smaller than the required count THEN the RPC raises `insufficient_questions_for_vfr_rt_exam` with a structured detail (which part was short, how many were available) — mirrors the existing `insufficient_questions_for_exam` pattern from `start_internal_exam_session`.
5. WHEN the session resumes after a page reload THEN the same `question_ids` and the same Part-1/Part-2/Part-3 grouping are returned (no re-sampling).

### Requirement 5 — Admin authoring UI

**User Story:** As an admin authoring VFR RT content, I want to create and edit `short_answer` and `dialog_fill` questions using the existing admin question editor, with form fields adapted to each type — so that VFR RT authoring uses the same workflow as PPL authoring.

#### Acceptance Criteria

1. WHEN an admin opens the question editor THEN a question-type selector (segmented control or tabs) lets them choose `multiple_choice` (default for existing UX), `short_answer`, or `dialog_fill`.
2. WHEN `short_answer` is selected THEN the form shows: question text (the acronym, e.g. "A/C"), canonical answer (e.g. "Aircraft"), accepted synonyms (chip input), explanation, difficulty, status.
3. WHEN `dialog_fill` is selected THEN the form shows: dialog template editor (textarea or rich block editor accepting `[atc]` / `[pilot]` speaker tags and `{{n|canonical; syn1; syn2}}` blank tokens), parsed blanks preview with per-blank synonym editor, explanation, difficulty, status.
4. WHEN the dialog template is invalid (e.g., mismatched braces, missing canonical) THEN the form blocks submit and surfaces a parse error pointing at the offending token.
5. WHEN saving any question type THEN the existing Server Action (`upsertQuestion`) Zod-validates the type-specific shape before insert/update.
6. WHEN listing questions in the admin questions table THEN the type is shown as a column/badge so admins can filter to one type.

### Requirement 6 — Grader semantics

**User Story:** As a student writing "Air Traffic Control" vs "air-traffic-control" vs "air traffic control." for "ATC", I want all three accepted — so that minor formatting differences don't penalize me.

#### Acceptance Criteria

1. WHEN the grader compares a student answer to the canonical-plus-synonyms list THEN both sides are normalized identically: lowercased, leading/trailing whitespace trimmed, internal whitespace collapsed to single space, hyphens and underscores converted to space, ASCII punctuation (`.,;:!?"'()[]`) stripped, internal multi-space re-collapsed.
2. WHEN normalization produces an empty string THEN the answer is scored 0 (treat as blank).
3. WHEN the student answer normalizes to ANY entry in the canonical+synonyms set THEN the blank/question scores 1.
4. WHEN the answer contains non-ASCII characters with diacritics (e.g., Slovenian "č", "š", "ž") THEN diacritics are NOT folded — "č" ≠ "c". If a question must accept both forms, both are listed explicitly in the synonyms.
5. WHEN the grader runs THEN it runs server-side inside the submission RPC; client-side grading is informational only and MUST NOT be trusted for scoring.

## Non-Functional Requirements

### Code Architecture and Modularity

- **Single File Responsibility**: each new migration does exactly one architectural thing — one for the `question_type` enum + column, one for the `quiz_sessions.mode` CHECK extension, one for the `start_vfr_rt_exam_session` RPC, one for `submit_vfr_rt_exam_answers` RPC, one for `get_vfr_rt_exam_questions` if needed.
- **File size limits** (`code-style.md` §1): page.tsx ≤ 80 lines, components ≤ 150, hooks ≤ 80, utility ≤ 200, SQL migration ≤ 300.
- **No `any`** (`code-style.md` §5): question-type discriminated unions use Zod `.discriminatedUnion('question_type', ...)`.
- **No `useEffect` for data fetching**: exam-progress UI uses Server Components + Server Action submissions, identical pattern to existing `internal_exam` and `mock_exam`.
- **Reuse before new**: extend `start_internal_exam_session`'s sampling pattern, `complete_overdue_exam_session`'s auto-complete pattern, and `batch_submit_quiz`'s answer-write pattern wherever possible.

### Performance

- **Exam start RPC** completes in ≤ 500 ms on a warm database for an org with ≤ 500 questions per type (the realistic v1 pool size for VFR RT Slovenia).
- **Grader RPC** (per-session, on submit) completes in ≤ 1 s including the audit-event insert.
- **Sampling** uses `ORDER BY random() LIMIT N` directly in SQL (no in-process sort over a large pool).

### Security

- **`question_type` enforcement at DB level**: `CHECK (question_type IN ('multiple_choice','short_answer','dialog_fill'))`.
- **Correct answers stripped server-side**: a new RPC variant of `get_quiz_questions()` (or an extension of the existing one) returns the question shape WITHOUT `canonical_answer`, `accepted_synonyms`, or per-blank canonical strings for student-facing reads. The grader is the ONLY function that reads those columns from a SECURITY DEFINER context with `auth.uid()` checks (`docs/security.md` rules 1, 7).
- **`vfr_rt_exam` mode added to `quiz_sessions.mode` CHECK** with the existing 4 values preserved.
- **All new RPCs**: SECURITY DEFINER, `SET search_path = public`, manual `auth.uid()` check + RAISE if null (`docs/security.md` rule 7), `users.deleted_at IS NULL` filter on every actor/student lookup (rule 9), audit-event INSERT filters `deleted_at IS NULL` on `actor_role` subquery (rule 10).
- **No new permissive RLS SELECT policies** on `quiz_sessions` (rule 11). The existing student + admin + instructor policies cover the new mode.
- **Soft-delete**: never hard DELETE (`docs/security.md` rule 6). This spec adds no new tables — it adds columns to existing `quiz_session_answers` / `student_responses`, which already carry row-level `deleted_at`. Any new table introduced later must include a row-level `deleted_at` column.
- **Zod parse** on every new Server Action input (`docs/security.md` rule 4), including the discriminated-union `submit_vfr_rt_exam_answers` payload.
- **No `any` cast on RPC results** without runtime guards (`code-style.md` §5).
- **No raw error.message returned to client** — log server-side, return generic string (`code-style.md` §5 + `docs/security.md`).

### Reliability

- **Question IDs frozen at session start** — `config.question_ids` is set once and never re-sampled (existing pattern; satisfies §15 of `docs/security.md` on the immutable-write-once exception for the soft-delete-bypass case).
- **Timer is monotonic and server-derived** — UI computes remaining time from `quiz_sessions.started_at + time_limit_seconds` on the server; never trusts client wall-clock.
- **Submission is idempotent** — submitting the same session twice with the same answer set returns the same scores and does NOT double-write `student_responses` rows. Detect via `quiz_sessions.ended_at IS NOT NULL`; on the second call, return the prior result.
- **Auto-complete on overdue exam** — a stale `vfr_rt_exam` session past `started_at + time_limit_seconds + 30s` is auto-graded by the existing `complete_overdue_exam_session` machinery (extended to cover the new mode).
- **Answer write is atomic** — the submission RPC writes `quiz_session_answers` rows and updates `quiz_sessions` (correct_count, score_percentage, passed, ended_at) in a single transaction. On any error, rollback leaves the session in-progress.

### Usability

- **Exam landing page** explains the rules (30 min, per-part 75%, no penalty for blanks) BEFORE the timer starts; an explicit "Start exam" button begins the timer.
- **In-exam UI** shows: current part name (Part 1 / 2 / 3), question number within part (e.g. "Acronym 3 of 8"), remaining time, "Submit & Finish" button, free navigation between questions.
- **Per-part progress** visible at all times (e.g., a 3-segment bar showing how many in each part have been answered).
- **Result page** shows: 3 per-part bars with 75% threshold marker, pass/fail badge, per-question review with correct answer reveal and explanation.
- **Resume** — if the student reloads mid-exam, the same question set, the same timer (server-derived remaining), and any answers already submitted are restored.
- **Discard blocked** — the "Discard quiz" button is hidden when `mode === 'vfr_rt_exam'` (same as `internal_exam`).

---

*Cross-document references:* `tech.md` (data-flow patterns), `structure.md` (route folders), `product.md` (exam fidelity pillar), `docs/security.md` (rules 1, 4, 6, 7, 9, 10, 11), `code-style.md` (§1 file sizes, §5 mutations + casts, §6 server-action boundary, §7 test conventions).
