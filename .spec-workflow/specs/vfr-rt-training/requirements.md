# Requirements Document — VFR RT Training (Practice Drills)

## Introduction

VFR RT Slovenia shipped as a **mock exam** (`vfr-rt-slovenia-mock-exam` spec): a timed, computer-graded, per-part-75% capstone. That spec explicitly deferred **per-part practice drills** to a future spec. This is that spec.

This feature adds an **untimed practice/training experience** for VFR RT — the day-to-day surface a student uses to *learn* the material before sitting the mock exam. Critically, it is **not a new UI**: it reuses the existing `/app/quiz` **Study-mode** experience (setup form → session runner with immediate per-question feedback → report), tweaked only for VFR RT's three parts and its non-multiple-choice question types.

Per the official VictorOne briefing package (`English_Phraseology_Exam_Briefing_Package_1.pdf`), the three parts decompose into **five** question types:

- **Part 1 — Aviation Acronyms** → `short_answer` (write the meaning of an acronym, drawn from a closed list of 40).
- **Part 2 — Fill-in-the-Blank** → `dialog_fill` (multi-turn ATC/pilot dialog with multi-word phrase blanks).
- **Part 3 — "Multiple-Choice"** (the brief's label is misleading) decomposes into THREE interactions:
  - number transmission → `multiple_choice` (exists),
  - MAYDAY/PAN-PAN & position-report **sequencing** → **`ordering`** (drag pieces into a numbered list) — NEW type,
  - traffic-pattern legs/turns → **`diagram_label`** (drag labels onto empty fields on a drawn left-hand pattern for RWY 27/09) — NEW type.

So this spec introduces **two brand-new drag-and-drop question types** (`ordering`, `diagram_label`) in addition to wiring up `short_answer`/`dialog_fill` in Study mode. There is no DnD tooling in the repo today — **dnd-kit** is added (touch-friendly; the real exam runs on iPad). The traffic-pattern diagram (image + drop-zone coordinates) is **seeded** for now, since admin authoring of the new types is out of scope.

The driving constraints from the product owner:

1. **VFR RT is its own menu item and its own page** — it must NOT live inside the generic `/app/quiz` page, and RT must NOT appear in the quiz subject dropdown.
2. **Reuse the quiz UI, do not reinvent it** — the VFR RT page is built from the same components as quiz Study mode; it should look and behave identically, save for the part structure and the new question types. A bespoke parallel UI (as built in the parked Phase C branch, PR #923) is explicitly rejected.
3. **Training before exam** — practice is the primary surface; the timed mock exam returns later as an *exam-mode* toggle on the same shared UI, not the bespoke tree.
4. **Build slowly with continuous manual eval** — each phase leaves the app in a coherent, demoable state.

### What already works (verified on `master`)

The generic quiz Study flow **already** handles VFR RT for multiple-choice:
- `get_random_question_ids` and `start_quiz_session` do **not** filter by `question_type` — RT questions of all three types already flow into a study session.
- A student can already select RT in the quiz subject picker, start a `quick_quiz` study session, and get MC questions with immediate feedback.

What does NOT work: the two non-MC types (`short_answer`, `dialog_fill`) render as empty cards because (a) `get_quiz_questions` returns only `options` (no `dialog_template`/blank data, no `question_type`), (b) the runner is MC-only, (c) there is no per-question grader for non-MC, and (d) the report is MC-only. Those four gaps are the whole of this spec.

## Alignment with Product Vision

`product.md` lists "in-house mock exam fidelity" and reuse-first architecture as pillars. This spec serves both: it makes VFR RT *learnable* (not just *testable*), and it does so by generalizing the existing quiz Study engine to non-MC question types — work that also unlocks future non-MC practice for any subject. It deliberately avoids a second divergent UI for the same task shape.

## Requirements

### Requirement 1 — Dedicated VFR RT page and menu item

**User Story:** As a student, I want a "VFR RT" item in the main menu that opens a dedicated practice page — separate from the generic Quiz page — so that radiotelephony training has its own home.

#### Acceptance Criteria

1. WHEN the student views the app navigation THEN a "VFR RT" menu item is present, linking to a dedicated route (`/app/vfr-rt`).
2. WHEN the student opens `/app/vfr-rt` THEN a setup page is shown that is visually and behaviorally consistent with the quiz Study-mode setup (same components, same styling).
3. WHEN the student opens the generic `/app/quiz` page THEN the VFR RT subject (`easa_subjects.code = 'RT'`) is **NOT** listed in the subject picker.
4. WHEN any code path enumerates "practice subjects" for the quiz page THEN RT is excluded by a single, centralized filter (not scattered per-call).
5. WHEN the VFR RT page is built THEN it is composed of the existing quiz Study components (config form, session runner, report) — no bespoke parallel components beyond what the new question types genuinely require.

### Requirement 2 — VFR RT practice setup (parts, not free topics)

**User Story:** As a student, I want to choose which of the three VFR RT parts to drill (Acronyms / Dialog / Multiple-Choice) and how many questions — so I can focus practice where I'm weak.

#### Acceptance Criteria

1. WHEN the setup page renders THEN the subject is fixed to VFR RT (no subject dropdown) and the selectable units are the three parts: Part 1 — Acronyms (`P1_ACRONYMS`), Part 2 — Dialog (`P2_DIALOG`), Part 3 — Multiple-Choice (`P3_MC`).
2. WHEN the student selects one or more parts and a question count THEN starting the session samples questions from exactly the selected parts, using the existing study-session start path (`start_quiz_session`, mode `quick_quiz`).
3. WHEN the student selects no part THEN the start action is blocked with a clear message (mirrors quiz "no subject" handling).
4. WHEN parts map to topics THEN the existing topic-based selection (`get_random_question_ids` by `topic_id`) is reused — parts ARE the RT subject's topics; no new sampling RPC is required for practice.
5. WHEN the setup page is shown THEN quiz Study-mode controls that do not apply to RT (e.g. a free subject dropdown) are hidden, while controls that do apply (question count, and any relevant filters) are reused as-is.

### Requirement 3 — Render all three question types in the runner

**User Story:** As a student practicing VFR RT, I want short-answer and dialog-fill questions to display and be answerable in the same runner as multiple-choice — so practice covers all three parts.

#### Acceptance Criteria

1. WHEN the session runner shows a `multiple_choice` question THEN it renders exactly as today (no regression to existing quiz behavior).
2. WHEN the runner shows a `short_answer` question THEN it renders the question text plus a free-text input for the answer.
3. WHEN the runner shows a `dialog_fill` question THEN it renders the dialog with the speaker turns and one input per blank, with the canonical answers **not** present in the delivered markup (canonical-stripped `{{n}}` display only).
4. WHEN the question payload is delivered to the client THEN it includes `question_type` and, for `dialog_fill`, the canonical-stripped `dialog_template` plus blank positions — and it NEVER includes `canonical_answer`, `accepted_synonyms`, or per-blank canonical strings.
5. WHEN the runner dispatches on question type THEN the dispatch lives in the shared runner so the change is a single code path (the generic quiz route, which no longer lists RT, is unaffected in practice).

### Requirement 4 — Immediate per-question feedback for all types

**User Story:** As a student, I want to submit one answer and immediately see whether it was right, plus the correct answer and the explanation — for every question type — so I learn as I go (the essence of Study mode).

#### Acceptance Criteria

1. WHEN a student submits a `multiple_choice` answer THEN the existing immediate-feedback path (`check_quiz_answer`) is used unchanged.
2. WHEN a student submits a `short_answer` answer THEN a server-side grader normalizes and matches it against the canonical+synonyms set (reusing `normalize_answer`, mig 101) and returns `is_correct` plus the revealed canonical answer and explanation.
3. WHEN a student submits a `dialog_fill` answer THEN each blank is graded per the same normalized match; the response returns per-blank correctness plus the revealed per-blank canonical answers and explanation.
4. WHEN feedback is shown THEN the Explanation tab renders `explanation_text` (and image) identically to MC, for all types.
5. WHEN grading runs THEN it runs **server-side** inside a SECURITY DEFINER RPC with an `auth.uid()` check and session-ownership + question-membership validation; client-side grading is never trusted.
6. WHEN an answer is recorded for the report THEN the recording path persists the student's `response_text` / per-blank responses for non-MC, matching how MC answers are persisted for the Study-mode report.

### Requirement 5 — Report renders all three types

**User Story:** As a student, after a practice session I want the end-of-session report to show every question — including short-answer and dialog-fill — with my answer vs. the correct answer and the explanation, so I can review.

#### Acceptance Criteria

1. WHEN the report renders a `multiple_choice` row THEN it renders exactly as today (no regression).
2. WHEN the report renders a `short_answer` row THEN it shows the student's response, the canonical answer (and accepted synonyms), correctness, and explanation.
3. WHEN the report renders a `dialog_fill` row THEN it shows the dialog with the student's per-blank fills vs. the correct per-blank answers, per-blank correctness, and explanation.
4. WHEN the report query loads questions THEN it returns the type-specific review data (canonical/synonyms for short_answer; per-blank canonical + student fills for dialog_fill) via a path that does not leak answer keys before submission.
5. WHEN the report row dispatches on type THEN the dispatch is additive — the MC path (`OptionsList`) is preserved as a sub-case.

### Requirement 6 — Grader semantics (shared with the mock exam)

**User Story:** As a student typing "Air Traffic Control" vs "air-traffic-control" for "ATC", I want all reasonable formattings accepted — using the **same** normalization the mock exam uses, so practice predicts exam outcomes.

#### Acceptance Criteria

1. WHEN the practice grader compares an answer THEN it uses the identical `normalize_answer` SQL helper (lowercase, trim, collapse whitespace, hyphen/underscore→space, strip ASCII punctuation; NO diacritic folding) used by `submit_vfr_rt_exam_answers`.
2. WHEN normalization yields an empty string THEN the answer scores 0 (treated as blank).
3. WHEN the normalized answer matches ANY entry in the canonical+synonyms set THEN it scores correct.
4. WHEN diacritics are present (Slovenian č/š/ž) THEN they are NOT folded; both forms must be listed explicitly as synonyms if both are accepted.

### Requirement 7 — `ordering` question type (Part 3 sequencing)

**User Story:** As a student practicing MAYDAY/PAN-PAN and position-report sequencing, I want to drag the pieces of the message into the correct numbered order — matching the real exam's drag-and-drop — so practice mirrors the test.

#### Acceptance Criteria

1. WHEN an `ordering` question is created THEN it stores an ordered list of items (the canonical sequence) on the question row.
2. WHEN an `ordering` question is delivered to the student THEN the items are returned **shuffled**, with no field revealing the correct position — the canonical order is never present in the student payload.
3. WHEN the runner renders an `ordering` question THEN the student drags items into a numbered vertical list (dnd-kit, touch-capable).
4. WHEN the student submits THEN a server-side grader compares the submitted item order to the canonical order and returns correctness (the reveal shows the correct order + explanation).
5. WHEN the report renders an `ordering` row THEN it shows the student's order vs. the correct order with the explanation.

### Requirement 8 — `diagram_label` question type (Part 3 traffic pattern)

**User Story:** As a student practicing the traffic-pattern legs and turns, I want to drag labels (upwind, crosswind, downwind, base, final, and the turns) onto the empty fields of a drawn left-hand pattern for RWY 27/09 — matching the real exam — so I learn the pattern visually.

#### Acceptance Criteria

1. WHEN a `diagram_label` question is created THEN it stores: a background image reference, an ordered set of drop-zones (each with a position), a pool of draggable labels, and the correct zone→label mapping.
2. WHEN a `diagram_label` question is delivered to the student THEN the payload includes the image, the zones (positions only), and the label pool — but NEVER the correct zone→label mapping.
3. WHEN the runner renders a `diagram_label` question THEN the background image shows with positioned drop-targets and a pool of draggable label chips; drag works on touch (iPad) and pointer, responsively.
4. WHEN the student submits THEN a server-side grader compares the submitted zone→label mapping to the canonical mapping and returns per-zone correctness (the reveal shows the correct mapping + explanation).
5. WHEN the report renders a `diagram_label` row THEN it shows the student's labeling vs. the correct labeling with the explanation.
6. WHEN the traffic-pattern content is provisioned THEN the diagram image + zones + label pool are **seeded** (admin authoring of this type is out of scope); the seeded image is a static asset for now.

## Non-Functional Requirements

### Code Architecture and Modularity

- **Reuse before new** — the VFR RT page is composed of existing quiz Study components imported directly; new code is limited to (a) the new route + nav entry, (b) the three type renderers, (c) the non-MC grader RPC + display-field extension to `get_quiz_questions`, (d) report sub-renderers. No bespoke runner, no bespoke report shell, no new session mode.
- **File size limits** (`code-style.md` §1): page.tsx ≤ 80, components ≤ 150, hooks ≤ 80, utility ≤ 200, SQL migration ≤ 300.
- **No `any`** (`code-style.md` §5): question-type discriminated unions use Zod `.discriminatedUnion('question_type', ...)`; RPC results runtime-guarded before use.
- **No `useEffect` for data fetching** — Server Components + Server Actions, identical to quiz Study mode.
- **No barrel files**; import shared quiz components directly from source.

### Security

- **Answer keys stay stripped pre-submission** — the student-facing question payload (`get_quiz_questions`) must never carry `canonical_answer`, `accepted_synonyms`, or per-blank canonical strings; the four answer-key columns remain column-REVOKE-gated (mig 094) and only the SECURITY DEFINER grader reads them (`docs/security.md` rules 1, 7).
- **New/extended grader RPC**: SECURITY DEFINER, `SET search_path = public`, manual `auth.uid()` check + RAISE if null (rule 7), `users.deleted_at IS NULL` active-caller gate (rule 11c / sibling-guard consistency), session-ownership scope (`student_id = auth.uid()`), question-membership validation against the session's frozen `config.question_ids`, soft-delete filters on every SELECT (rule 9 / §15 immutable-write-once carve-out where applicable).
- **Sibling-guard consistency** (`security.md` rule 11c): the practice grader's guard set must match `check_quiz_answer` and the VFR RT exam RPCs in the same family before commit.
- **`get_quiz_questions` change** is answer-exposure-sensitive — re-verify no answer-key column is added to its `RETURNS TABLE`/SELECT; the dialog template returned must be canonical-stripped.
- **Zod parse** on every new/extended Server Action input (rule 4), including the discriminated-union answer payload.
- **No raw `error.message` to client**; log server-side, return generic strings (`code-style.md` §5).

### Reliability

- **No regression to the generic quiz** — MC behavior in `/app/quiz` is byte-for-byte unchanged; the runner/report type-dispatch is purely additive and RT is removed from the quiz subject list so quiz never encounters non-MC questions in practice.
- **Server-side grading** is authoritative; the practice session remains untimed (study semantics) — no timer, free navigation, immediate feedback.
- **Idempotent re-answer** follows the existing Study-mode answer pipeline's semantics.

### Usability

- **Identical look to quiz Study mode** — same setup form shell, same session chrome (question/explanation/comments/statistics tabs), same report layout.
- **Part-scoped practice** — student picks parts (Acronyms / Dialog / MC) and a count; immediate feedback after each answer.
- **Review** — the report shows every question with the student's answer, the correct answer, and the explanation, per type.

## Out of Scope (this spec)

- The **timed mock exam** UI (returns later as an exam-mode toggle on the shared UI; the parked PR #923 bespoke UI is not used).
- **Admin authoring** of `short_answer`/`dialog_fill` questions (Phase D of the mock-exam spec / a separate effort) — practice content is seeded for eval.
- Any change to the mock-exam RPCs (`start_vfr_rt_exam_session`, `submit_vfr_rt_exam_answers`, `get_vfr_rt_exam_results`).
- New `quiz_sessions.mode` value — practice reuses `quick_quiz`.

---

*Cross-document references:* `design.md` (this spec), `vfr-rt-slovenia-mock-exam/*` (the deferred-from spec), `docs/security.md` (rules 1, 4, 6, 7, 9, 11, 11c, §15), `code-style.md` (§1, §5, §6, §7), `tech.md`/`structure.md` (route + data-flow patterns).
