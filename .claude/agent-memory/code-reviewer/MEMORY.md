# Code Reviewer — Memory

> Native subagent memory index. Tracker first, durable knowledge second, topic pointers last.
> Update rows/bullets IN PLACE. No session logs — git holds history (`git log -p`).

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---------|-----------|-------|-----------|---------------------|
| Feature modes (study/exam) wired into one hook/component | 2026-04-13 (exam PR2) | 2 | 2026-04-26 (34194aa) | RULE CANDIDATE — extract mode logic once file passes 120L (hook) or 200L (component). |
| Utility function > 30 lines | 2026-05-31 (c879a259) | 36 | 2026-09-21 (guards/mutation-harness-staged R1) | WATCHING. See [tracker-notes](topics/tracker-notes.md#utility-function-30-lines). |
| Deep nesting > 3 levels | 2026-03-27 (75ffa51) | 3 | 2026-07-10 (df045384) | WATCHING. See [tracker-notes](topics/tracker-notes.md#deep-nesting-3-levels). |
| Utility file > 200-line limit | 2026-04-27 (c656868) | 7 | 2026-08-30 (464fd213) | WATCHING. SPLIT CANDIDATE: quiz-session-storage.ts 279L; quiz-submit.ts 239L. See [tracker-notes](topics/tracker-notes.md#utility-file-200-line-limit). |
| `waitForTimeout` in E2E specs | 2026-06-06 (test/isolation-hygiene) | 1 | 2026-06-06 | WATCHING (exam-recovery.spec.ts — fixed in same commit; tracking for recurrence). |
| E2E spec > 500-line limit | 2026-08-20 (b67beccf) | 2 | 2026-09-01 (4341ab8f) | RULE CANDIDATE (2). Mechanism: additive `describe`/`beforeAll` growth on files already near cap. See [file-size-watch-log](topics/file-size-watch-log.md). |
| Class-sweep "complete" overclaim — surviving instance outside documented exceptions | 2026-09-07 (4a9769fc) | 3 | 2026-09-17 (chore/record-mechanical-lever R2) | RULE CANDIDATE (3). First: fullpush.md:14 "it runs after all four report" (4a9769fc). See [tracker-notes](topics/tracker-notes.md#class-sweep-complete-overclaim-surviving-instance-outside-do). |
| §10 compliance-ratio/quote drift in a newly-authored data file's own comments | 2026-09-09 (7ca1f522) | 3 | 2026-09-09 (0cc1a4bb) | RULE CANDIDATE (3). 2 instances fixed; 1 still open at HEAD (`declaresUseServer` JSDoc misattributes a quoted line to the wrong file). See [tracker-notes](topics/tracker-notes.md#10-compliance-ratio-quote-drift-in-a-newly-authored-data-fil). |
| §10 cl.5 fixup commit's own sweep leaves an adjacent stale claim | 2026-09-09 (aa10d2b5) | 1 | 2026-09-09 (aa10d2b5) | WATCHING. Two adjacent stale claims left by a sweep commit; both re-derived and one confirmed by EXECUTION. See [tracker-notes](topics/tracker-notes.md#10-cl-5-fixup-commit-s-own-sweep-leaves-an-adjacent-stale-cl). |
| Numbered DO-NOT/BLOCKING list gains a GAP when an item is deleted without renumbering | 2026-09-09 (7ca1f522) | 1 | 2026-09-09 (0cc1a4bb) | WATCHING — `.claude/agents/code-reviewer.md`: BLOCKING list reads 1,[gap],3,4; stale "suppression #8" cross-ref. See [tracker-notes](topics/tracker-notes.md#numbered-do-not-blocking-list-gains-a-gap-when-an-item-is-de). |
| §10 stale function name in JSDoc after spawnSync→runNode migration | 2026-09-18 (fix/harden-fixture-spawn-helpers) | 1 | 2026-09-18 | WATCHING. check-prose-claims.repo.test.mjs (L62) and check-prose-paths.repo.test.mjs (L56) say "`spawnSync`, not `execFileSync`" — code calls `runNode`. Rationale still valid; named symbol is stale. |
| §10 false numeric detail in a learner-promotion prose example | 2026-09-19 (feat/corpus-update-expected b61d839b) | 2 | 2026-09-19 (docs/schedule-cr-local-retirement R2) | RULE CANDIDATE (2). Both §10 cl.7: counts stated without a derivation command. |
| MUTATION: comment describes "passes silently" / "bypasses forEach" when mutation causes TypeError | 2026-09-14 (5b47604c) | 3 | 2026-09-14 (71adf5b0) | WATCHING. 3 instances: string fixtures hit a TypeError on `.forEach()`, not "passes silently". See [tracker-notes](topics/tracker-notes.md#mutation-comment-describes-passes-silently-bypasses-foreach-). |
| Prose-condensation branch drops a disjunct from a mirrored trigger condition | 2026-09-16 (docs/cut-injected-rules-corpus) | 1 | 2026-09-16 | WATCHING. `CLAUDE.md § Post-commit review` condensed "new **or changed** `.claude/hooks/*.mjs` guard" → "changed" only — drops the NEW-guard trigger. First instance of mirror-desync from condensation (not a rule edit). |

> Count increments only on a **distinct** mechanism. Rows transition state, never deleted.
> Terminal rows (PROMOTED/RESOLVED/FALSE POSITIVE) and single-branch CLEAN runs → [tracker-archive](topics/tracker-archive.md).

## Durable knowledge

- **Scope is the commit diff only.** Flag size violations only when the commit introduced or worsened them (`+` lines in the hunk). Note pre-existing violations but don't flag them.
- **Test files** are exempt from line limits up to 500L (`.test.ts`/`.test.tsx`/`.spec.ts`). Shared test-infra helpers (`setup.ts`, `helpers/*.ts`, `seed.ts`) are utility files subject to the 200L cap.
- **Server Action exception:** file >100L holding 3+ focused exports (each ≤30L) + private helpers is acceptable.
- **`useEffect` exceptions:** ResizeObserver, click-outside, timer cleanup, and hydration guards are NOT data-fetching violations. Only flag `useEffect` that fetches data.
- **§5 mutations in test `finally` restore blocks:** `await admin.from(...).update(...)` without `{ error }` destructuring is a WARNING — silent restore failure corrupts next test run.
- **Migrations:** 300L cap. Single-function SECURITY DEFINER RPCs may exceed — documented exception in code-style.md §1 (mig 087 360L, mig 129 330L, mig 130 329L, mig 160 351L `submit_vfr_rt_exam_answers`). Header self-annotates the exception; reviewer confirms and passes.
- **Page files:** 80L cap, composition only — consistently honored.
- **Scope, exemptions and the long-form entries** (hook/script files, rules-only commits, MUTATION accuracy, platform-behavior claims, borderline watch files) — moved to [scope-and-exemptions](topics/scope-and-exemptions.md) on 2026-09-14 to stay under the 25 KB injection cap. Read it when a call is not obvious from the tracker.
- **`auth.getUser()` / auth SDK:** destructuring only `{ data }` is correct — §5 destructure rule applies to `.from()` table queries only.
- **`null as unknown as T` in integration tests** is a permitted null-injection pattern (not a §5 violation — that rule targets `req.body`, `formData`, `JSON.parse()` in prod code).
- **`unknown`-typed wire-shape + `typeof` runtime guards** (study-queries.ts, 14a8b9c5): the correct §5 cast-guard pattern for nullable `RETURNS TABLE` fields. Acknowledge, don't re-litigate.
- **code-reviewer scope is style/structure only.** Logic, security, RLS belong to semantic-reviewer.
- **Agent prompt / parser contract drift** is a WARNING — verify the agent prompt emits the token format the hook's verdict parser expects.
- **`Readonly<Props>` rule** (code-style.md §5+§8, WARNING). `Readonly<Readonly<...>>` double-wrap is harmless — WARNING not BLOCKING. Shadcn wrapper annotation expansion worsens line counts by 2-4L per component; note as pre-existing, split work is separate.
- **Hook/script files in `.claude/hooks/`** are NOT app code. File-size caps, missing-test rules apply when the file is added or grown by the diff; function-length, param, and nesting rules apply as usual. Infrastructure utilities with JSDoc are exempt from the 4-param limit (suppression #2); `touchesStaged(root, file, data, staged, readAt)` is the first 5-param case seen — JSDoc present, each param distinct, accepted on same terms.

## Topic pointers

- [commit-review-log](topics/commit-review-log.md) — per-commit review notes (read on demand).
- [file-size-watch-log](topics/file-size-watch-log.md) — full chronological file-size growth history (read on demand).
- [tracker-notes](topics/tracker-notes.md) — the evidence tail of every tracker row over 200 chars (read on demand).
- [tracker-archive](topics/tracker-archive.md) — terminal-state rows and single-branch CLEAN runs (read on demand).
- [scope-and-exemptions](topics/scope-and-exemptions.md) — exemptions, hook/script file rules, MUTATION accuracy notes (read on demand).
