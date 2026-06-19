# Handover — VFR RT Slovenia Mock Exam (#697)

_Last updated: 2026-06-19_

## TL;DR

**Phases A + B MERGED + live (dark). Phase C (Student UI) is BUILT on branch `feat/vfr-rt-phase-c` (tasks C.1–C.5, 9 commits, all gates green) — awaiting push → PR → manual eval (renderable UI, NOT auto-merged). Phases D–E not started. No blockers.**

`master` HEAD = `55e50398` (Phase B, PR #922). Branch `feat/vfr-rt-phase-c` off master carries all of Phase C: briefing/start flow, in-progress timed runner, results/review. Frontend-only — no migrations, no new RPCs (consumes the already-shipped 099/105/106/100 RPCs). Each slice ran plan-critic/impl-critic + the full post-commit fleet; security GOOD throughout (canonicals only via the `ended_at`-gated 106 RPC; all result components are Server Components). **Next: push → open PR → drive CI green + CodeRabbit clean (`/replycoderabbit`) → manual eval → merge. Then Phase D (admin authoring).**

---

## Where the feature stands

VFR RT = VFR Radiotelephony Slovenia mock exam. Spec at `.spec-workflow/specs/vfr-rt-slovenia-mock-exam/` (spec merged via PR #696, fixes via #829). Trunk-based, one PR per phase (A→E), feature stays **dark** post-merge (no `exam_configs` row ⇒ `exam_config_required`).

| Phase | Scope | Status |
|-------|-------|--------|
| **A — Database** | migs 094–106: question-type enum + columns, `vfr_rt_exam` mode, text/per-blank answers, all RPCs, 145 integration tests | ✅ **MERGED** (PRs #830, #841, #843) |
| **B — Server Actions + grader** | `startVfrRtExam`, `submitVfrRtExam`, `lib/grading/normalize-answer.ts`, constants, discard guard | ✅ **MERGED** (PR #922, squash `55e50398`) |
| **C — Student UI** | briefing page, runner shell, per-type renderers, part progress bar, results breakdown | 🟡 **BUILT on `feat/vfr-rt-phase-c`** — awaiting push/PR/eval |
| **D — Admin authoring** | discriminated-union schema, type selector, dialog-template parser/preview, upsert branch, list badge | ⬜ **← NEXT (after C merges)** |
| **E — Tests + red-team + ops** | Playwright lifecycle E2E, red-team (#825), pre-push sweep, launch | ⬜ |

### Phase A RPCs already shipped (Phase B calls these)
- `start_vfr_rt_exam_session(p_subject_id)` — mig 099
- `get_vfr_rt_exam_questions(p_session_id)` — mig 105 (session-derived IDs; explanations stripped; **no `ended_at` gate** by user decision so it also serves the Phase C review screen)
- `submit_vfr_rt_exam_answers(p_session_id, p_answers jsonb)` — mig 100
- `get_vfr_rt_exam_results(p_session_id)` — mig 103/106 (gated on `ended_at`, reveals canonicals post-completion)
- `normalize_answer(text)` SQL helper — mig 101 (B.1's TS grader must mirror this **exactly**)

---

## Blocker check (done 2026-06-19) — NONE block Phase B

The hard prereq **#611** (score-forgery column-grant) shipped 2026-06-05 — that's what unblocked Phase A. Phase A is merged, 145 integration tests green. All open VFR-RT issues are Phase A follow-up hardening or Phase E test backlog:

| # | What | Type | Action |
|---|------|------|--------|
| #825 | Red-team Phase A coverage gaps (vectors CX–DE) | testing | Phase E |
| #873 | VFR RT E2E success-path coverage (pool-seed infra) | testing | Phase E |
| #839 | `submit_vfr_rt_exam_answers` payload hardening (blank_index dedupe, expired-flag persist) | P2 | fold into Phase E |
| #828 | Enforce `blank_index ⇒ dialog_fill` invariant at write time | tech-debt | fold into Phase E |
| #827 | No partial unique index on active sessions (concurrent-start race) | tech-debt | fix before launch |

**Watch (not VFR, but adjacent):** #911 (P1) — internal-exam email link lands users in a half-authenticated stuck-loading state. It's an auth/session redirect-flow bug; VFR-RT's Phase C runner uses the same `/app/*` protected flow. If it's a general redirect defect (not email-specific), it could bite the runner. Doesn't block B.

---

## Phase B — MERGED (PR #922, squash `55e50398`, 2026-06-19)

All of B.1–B.5 implemented + reviewed clean (plan-critic, impl-critic, full post-commit fleet incl. red-team, semantic re-review). All-green CI + CodeRabbit APPROVED. No manual eval was possible — `vfr-rt-exam/` is actions-only, nothing renderable yet.

- **B.1** `lib/grading/normalize-answer.ts` — mirrors mig 101 `normalize_answer()` exactly (diacritics preserved).
- **B.2** `vfr-rt-exam/actions/start.ts` — wraps `start_vfr_rt_exam_session`; **returns** session (client navigates) — DEVIATION from design's server redirect, user-approved 2026-06-19 (design.md/tasks.md updated). All 5 RPC error tokens mapped.
- **B.3** `vfr-rt-exam/actions/submit.ts` (+ `_answer-mapping.ts`) — wraps `submit_vfr_rt_exam_answers`; tagless strict `z.union`; MC key = `selected_option_id` (mig 113); surfaces `expired` flag.
- **B.4** `exam-modes.ts` + swept all hard-coded consumers (session-storage validator, `result-summary` cast, `reports-utils` 2nd label map).
- **B.5** discard guard blocks `vfr_rt_exam`; extracted `_discard-guard.ts` (discard.ts back to 96 lines).

**Deferred from this cycle:** red-team E2E vectors EF/EG → folded into **#873**; error-token-map sweep (rule promoted count=3) → **#920**.

## ▶ RESUME POINT — Phase C (Student UI) — frontend-only, multi-file → full plan→critic→approve→execute pipeline

Phase B is merged, so Phase C is unblocked and **is the next thing to build**. All backend RPCs it needs are already live (see "Phase A RPCs already shipped" above). Start from `.spec-workflow/specs/vfr-rt-slovenia-mock-exam/tasks.md` tasks **C.1–C.5**:

| Task | Scope | Files (size caps from `code-style.md` §1) |
|------|-------|--------|
| **C.1 Briefing/landing** | Server Component reads active session → redirect to in-progress, else render briefing + Start button | `vfr-rt-exam/page.tsx` (≤80, composition) + `_components/vfr-rt-exam-briefing.tsx` |
| **C.2 In-progress runner** | SC reads session+answers → client `<VfrRtExamRunner>` (local answer state, part-nav, server-derived timer `started_at + 1800s`) | `in-progress/[sessionId]/page.tsx` (≤80) + `_components/vfr-rt-exam-runner.tsx` (≤150) + **refresh-resume test** (§7) |
| **C.3 Per-type renderers** | short-answer, dialog-fill (parse `[atc]`/`[pilot]` + `{{n}}` blanks → inline inputs), MC | `_components/{short-answer,dialog-fill,mc}-renderer.tsx` + **security test: no canonical strings in client props/HTML** |
| **C.4 Part progress bar** | 3-segment answered/total per part | `_components/part-progress.tsx` (≤80) + test |
| **C.5 Results + breakdown** | per-part bars w/ 75% marker, pass/fail badge, per-question review; calls `get_vfr_rt_exam_results` (NOT direct table reads); guard error → redirect to `/app/vfr-rt-exam` | `results/[sessionId]/page.tsx` (≤80) + `_components/results-breakdown.tsx` (≤150) + **boundary test 74.9→fail / 75.0→pass** |

**Phase C must-dos already flagged (don't lose these):**
- **C.5 (RESOLVED in build):** rather than extend the shared `report-question-row.tsx` (plan-critic flagged its single-slot MC shape can't show dialog_fill's per-blank review), Phase C ships a **dedicated `vfr-rt-review-row.tsx` + per-type sub-components** that render `response_text`/per-blank answers natively. The shared row was intentionally left untouched.
- **C.3** dialog-fill renderer must NOT leak canonicals into client props — template skeleton + blank index only (the C.3 test asserts seeded canonicals like "S5-ABC" / "descending to 2500 feet" are absent from props/HTML).
- **C.2** runner can consume the `expired` flag now returned by `submitVfrRtExam` to show a "time's up" confirmation.
- Watch **#911** (P1 internal-exam email half-auth stuck-loading) — same `/app/*` protected flow the runner uses; if it's a general redirect defect it could bite the runner.

**Suggested first slice:** C.1 + C.2 to get a clickable start→runner flow, then C.3–C.5. This is multi-file → run the requirement interview + plan-critic before executing.

---

## Locked decisions (user-confirmed — do not relitigate)
- Review RPC reveals canonicals **post-completion** only; two-RPC review shape (105 for display fields callable post-exam; 103/106 = keys+explanations).
- Dedicated `/app/vfr-rt-exam/` runner route.
- Part-2 scoring = mean per-question blank fraction (Decision 43 — spec wins over CR).
- `correct_count` is **row-level (per-blank)** across migs 100/102/103 — do NOT "fix" to per-question.
- `submit_quiz_answer` whitelist stays `(smart_review, quick_quiz)` only.
- "Launch" = prod `db push` + seed `exam_configs` row + nav PR (all manual, post-Phase-E).

## Gotchas / useful facts
- `easa_subjects` has **no** `deleted_at`/`org_id` (CR false-positive trap — hit twice).
- `questions.explanation_text` is **NOT NULL** by schema; null-passthrough only observable on `explanation_image_url`.
- `supabase db reset` wipes the E2E seed — re-run `pnpm --filter @repo/web exec tsx scripts/seed-e2e.ts`.
- Keep local `master` fast-forwarded before `coderabbit --base master`.
- Phase C results review uses a **dedicated `vfr-rt-review-row.tsx`** (not the shared `report-question-row.tsx`) — it renders `response_text`/per-blank answers + the gated key from `get_vfr_rt_exam_results`. The shared row's "Not answered" behavior for text rows is therefore moot for VFR RT (it's never used here).
- #367 WIP still STASHED ("367-wip protect" + patch backup at `../367-wip-backup-2026-06-10.patch`).

## Reference
- Spec tasks: `.spec-workflow/specs/vfr-rt-slovenia-mock-exam/tasks.md`
- Memory: `project-697-vfr-rt-implementation.md`
- Umbrella issue: **#697**
