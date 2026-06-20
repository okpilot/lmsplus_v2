# HANDOVER — VFR RT Training (resume context)

> ⚠️ **SUPERSEDED 2026-06-20 — all "START HERE" loose ends below are DONE.** The 3 tsc fixes, 24 tests, deleted_at fix, docs+Decision 45, tasks.md, and learner all landed (commits `5f392339`→`8270ea05` on `feat/vfr-rt-training`). The agreed next step (testing deep-dive #925) is now IN PROGRESS on branch `feat/925-app-integration-tier` — see `.spec-workflow/specs/925-app-integration-tier/HANDOVER.md`. **When resuming vfr-rt itself, start at Phase 2** (`tasks.md` N1–N10), AFTER #925 lands. The rest of this file is kept for historical context only.
>
> Written 2026-06-20, end of the Phase 1 build session. Branch: `feat/vfr-rt-training` (off `master` @ `55e50398`). Read this + `tasks.md` to resume.

## ▶ START HERE NEXT SESSION (agreed order)

1. **Finish Phase 1's uncommitted loose ends first (~5 min)** — the 3 `tsc` fixes + commit (fix + 24 tests + docs) + run the **learner** + mark `tasks.md` done. Details in "⚠️ UNCOMMITTED working-tree state" below.
2. **Then go deep on #925 — the testing deep-dive (P0).** Do this BEFORE VFR RT Phases 2/5/6 (they add migrations and share the same app-layer integration blind spot). A query against a non-existent column passed unit tests + tsc + biome + 3 plan-critic rounds + BOTH a Sonnet and an Opus impl-critic — only semantic reasoning caught it. Establish the app-layer DB read-path integration tier (and promote the column-existence guard rule) before building more on this foundation.

(User agreed 100% to this order, 2026-06-20.)

## TL;DR

We pivoted VFR RT from the rejected bespoke mock-exam UI (parked PR #923, `feat/vfr-rt-phase-c`, NOT on master) to a **training-first** feature that **reuses the existing `/app/quiz` Study UI**. Phase 1 (dedicated `/app/vfr-rt` page, nav item, RT removed from quiz picker, MC-only) is **committed and review-clean**, but has **uncommitted follow-on work** (a bug fix + 24 new tests that fail `tsc` + docs) that must be finished first.

## Committed on `feat/vfr-rt-training`

- `344c12d1` feat — Phase 1 `/app/vfr-rt` practice page (reuses quiz study UI, MC-only)
- `a7c47014` docs — the `vfr-rt-training` spec (requirements/design/tasks, 7 phases)
- `1b3e46ac` chore — **Multi-Round Review Discipline + model-tier** added to `agent-critic.md` + `agent-workflow.md`

## ⚠️ UNCOMMITTED working-tree state — FINISH THIS FIRST

1. **Bug fix (done, uncommitted):** `apps/web/app/app/vfr-rt/actions/get-rt-subject.ts` — removed `.is('deleted_at', null)` (easa_subjects has no such column → query errored at runtime, would break `/app/vfr-rt`). Caught by semantic-reviewer; confirmed via live DB.
2. **24 new tests from test-writer (uncommitted) — THEY FAIL `tsc`.** Three exact fixes needed:
   - `apps/web/app/app/vfr-rt/_components/vfr-rt-config-form.test.tsx` — add `beforeEach` to the `from 'vitest'` import (TS2593 at line ~65).
   - `apps/web/app/app/vfr-rt/_hooks/use-vfr-rt-start-utils.test.ts:77` — `const [message] = confirmSpy.mock.calls[0]` → `const message = confirmSpy.mock.calls[0]?.[0]` (TS2488).
   - `apps/web/app/app/vfr-rt/actions/get-rt-subject.test.ts:66` — `result.parts[0].id` → `result.parts[0]?.id` (TS2532).
   - After fixes: `pnpm check-types` + `cd apps/web && npx vitest run app/app/vfr-rt` must be green (102 vfr-rt tests were green pre-tsc-fix).
3. **Docs not yet applied** (doc-updater proposed; APPLY corrected versions):
   - `docs/plan.md` — add a "VFR RT Training — Phase 1 — 2026-06-20" section + bump footer date. **Correct two doc-updater inaccuracies:** we did NOT reuse `QuizConfigForm` (too coupled — we reused leaf `TopicTree` + `QuestionCount` and built `VfrRtConfigForm`); and `quiz-subject-queries.test.ts` was **extended**, not new.
   - `docs/decisions.md` — add **Decision 45**: "VFR RT training reuses quiz Study UI on a dedicated `/app/vfr-rt` route (bespoke exam UI parked); training before exam."
4. **Learner NOT yet run** for this post-commit cycle — run it (it will likely promote the column-existence rule; see #925).
5. **Spec `tasks.md` statuses NOT updated** — mark 0.1, 0.2, 1.1–1.5 done (Phase 1 complete).

### Suggested next-session commit sequence
- `fix(vfr-rt): drop dead deleted_at filter on easa_subjects (runtime error)` — get-rt-subject.ts
- `test(vfr-rt): add Phase 1 coverage (start-utils, get-rt-subject, config-form)` — the 3 fixed test files
- `docs(vfr-rt): record Phase 1 + Decision 45` — plan.md + decisions.md
- Then run the **learner**.

## Open findings — disposition

- **semantic-reviewer SUGGESTION** (deleted_at filter) → **FIXED** (uncommitted).
- **code-reviewer WARNING** (`use-vfr-rt-start.ts handleStart` 39 lines > 30) → **SKIP**, reason: extracting a one-call 10-line helper would diverge from the established `handleStart` shape in quiz/exam hooks; consistency wins. (Not deferred — explicit skip.)
- **doc-updater** plan.md + Decision 45 → **APPLY** next session (see above).
- **test-writer** → 24 tests added (need the 3 tsc fixes).

## P0 follow-up filed

- **#925 (P0, tech-debt+testing):** "app-layer DB queries have ZERO integration coverage — schema-contract bugs escape every test." The `deleted_at` bug is the trigger. Includes **Phase 1.6** (add an RT read-path integration test) + promote the column-existence guard rule (red-team count=3, now in prod). **User wants a genuine deep dive on testing, not a patch.**

## The big architectural decisions (locked this session)

- VFR RT = **reuse quiz Study UI**, separate `/app/vfr-rt` page + nav item; RT removed from quiz picker. NOT a bespoke UI. (See [[feedback-reuse-quiz-ui-for-vfr-rt]].)
- **Training before mock exam.** The timed exam returns later as an *exam-mode* on the same shared UI (parked #923 bespoke UI is throwaway, keep only ideas).
- **5 question types** (per the VictorOne briefing PDF): P1 `short_answer`, P2 `dialog_fill`, P3 = `multiple_choice` (numbers) + **`ordering`** (MAYDAY/position drag-to-order) + **`diagram_label`** (drag labels onto a drawn 27/09 pattern). Part 3 is NOT all MC — the two new drag types use **dnd-kit** (approved; seed the diagram for now).
- **Phases:** 1 page/nav (done) → 2 backend non-MC (get_quiz_questions + grader + batch_submit refactor) → 3 runner renders short/dialog → 4 report → 5 ordering → 6 diagram_label → 7 cleanup. Each manual-evaled. See `tasks.md` N1–N10 (binding cross-cutting notes from 3 plan-critic rounds — e.g. DROP+recreate for RETURNS-TABLE changes; batch_submit MC guards are unconditional and must be made type-conditional + refactored to per-type helpers; COUNT(DISTINCT question_id) for report pagination).

## Eval environment (Phase 1, currently live)

- Local Docker Supabase reset + grant-fix (`/tmp/fix-local-grants.sql`) + seeded via `apps/web/scripts/seed-vfr-rt-training-eval.ts` (10 MC RT questions, no exam_config).
- Dev server on :3000. Student `student@lmsplus.local` / `student123!`, admin `admin@lmsplus.local` / `admin123!`. Start: `http://localhost:3000/app/vfr-rt`.
- **NOTE:** the `get-rt-subject` fix is uncommitted but ON DISK, so eval works now. If you reset/rebuild, ensure the fix is present.

## Process note for next session

- The Multi-Round Review Discipline is now binding: plan-critic gets coverage→stability rounds, floor 2/3, ceiling 4→escalate; **Opus for critics on security-path/high-stakes gates** (Phases 2/5/6 touch migrations → use Opus critics). impl-critic exempt from the floor.
