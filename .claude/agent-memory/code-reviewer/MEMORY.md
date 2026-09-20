# Code Reviewer — Memory

> Native subagent memory index. Tracker first, durable knowledge second, topic pointers last.
> Update rows/bullets IN PLACE. No session logs — git holds history (`git log -p`).

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---------|-----------|-------|-----------|---------------------|
| Function > 30 lines in Server Action | 2026-03-20 (d93f924) | 2 | 2026-03-20 (6520962) | PROMOTED → code-style.md §3 (getFilteredCount 58L, toggleFlag 52L; both fixed) |
| New hook/utility file shipped without co-located test | 2026-03-21 (8771aa2) | 6 | 2026-08-30 (d2d3bdb3) | PROMOTED → code-style.md §7. 6th instance: `admin-report-helpers.ts`, RESOLVED same PR (`11cadfc2`). See [tracker-notes](topics/tracker-notes.md#new-hook-utility-file-shipped-without-co-located-test). |
| Hook file > 80-line limit | 2026-03-21 (8771aa2) | 4 | 2026-04-27 (c656868) | PROMOTED (2026-09-09: mirror now `.claude/limits.json`, not code-style.md §1). Fix = extract orchestration helper. use-study-config.ts 80L exactly at cap — WATCH. See [tracker-notes](topics/tracker-notes.md#hook-file-80-line-limit). |
| React component > 150-line limit | 2026-03-21 (8771aa2) | 6 | 2026-07-02 (03aae12d) | PROMOTED (2026-09-09: mirror now `.claude/limits.json`, not code-style.md §1). BLOCKING: rwy-2709-lh-pattern.tsx 155L (fix: extract RunwayBody). See [tracker-notes](topics/tracker-notes.md#react-component-150-line-limit). |
| Feature modes (study/exam) wired into one hook/component | 2026-04-13 (exam PR2) | 2 | 2026-04-26 (34194aa) | RULE CANDIDATE — extract mode logic once file passes 120L (hook) or 200L (component). |
| Server Action file > 100-line limit | 2026-03-20 (d93f924) | 2 | 2026-06-07 (e9c2a36b) | RESOLVED. WATCHING: lookup.ts 112L; batch-submit.ts 100L exactly at cap. |
| Utility function > 30 lines | 2026-05-31 (c879a259) | 33 | 2026-09-19 (feat/corpus-update-expected R3) | WATCHING. See [tracker-notes](topics/tracker-notes.md#utility-function-30-lines). |
| Deep nesting > 3 levels | 2026-03-27 (75ffa51) | 3 | 2026-07-10 (df045384) | WATCHING (ConsentForm JSX 4-deep; ensureOtherOrgBank cb150e26 3-branch conditional at indent 4 — fix = early-return chain; topic-tree-actions.ts df045384: nested startTransition pushed setTopics to See [tracker-notes](topics/tracker-notes.md#deep-nesting-3-levels). |
| Utility file > 200-line limit | 2026-04-27 (c656868) | 7 | 2026-08-30 (464fd213) | WATCHING. SPLIT CANDIDATE: quiz-session-storage.ts 279L; quiz-submit.ts 239L. See [tracker-notes](topics/tracker-notes.md#utility-file-200-line-limit). |
| E2E Playwright hermiticity (hard-delete without restoration) | 2026-04-30 (from §7) | 2 | 2026-04-30 | RESOLVED — afterEach soft-delete pattern established; no recurrence. |
| `waitForTimeout` in E2E specs | 2026-06-06 (test/isolation-hygiene) | 1 | 2026-06-06 | WATCHING (exam-recovery.spec.ts — fixed in same commit; tracking for recurrence). |
| E2E spec > 500-line limit | 2026-08-20 (b67beccf) | 2 | 2026-09-01 (4341ab8f) | RULE CANDIDATE (2). Full history → [file-size-watch-log](topics/file-size-watch-log.md). Mechanism: additive `describe`/`beforeAll` growth on files already near cap. See [tracker-notes](topics/tracker-notes.md#e2e-spec-500-line-limit). |
| §10 false "always" claim in mechanic-rewrite commits | 2026-09-06 (43b1b9a5) | 1 | 2026-09-07 (1bf29e9d) | RESOLVED (d58572c8). See [tracker-notes](topics/tracker-notes.md#10-false-always-claim-in-mechanic-rewrite-commits). |
| Ambiguous "reset" scope in mechanic-rewrite prose | 2026-09-07 (092fab98) | 1 | 2026-09-07 (092fab98) | RESOLVED (4efa42a7). Line 31 now reads "does NOT reset the round counter M" — objects are explicit (baseline vs. M counter). Collision removed, not relocated. |
| Class-sweep "complete" overclaim — surviving instance outside documented exceptions | 2026-09-07 (4a9769fc) | 3 | 2026-09-17 (chore/record-mechanical-lever R2) | RULE CANDIDATE (3). First: fullpush.md:14 "it runs after all four report" (4a9769fc). See [tracker-notes](topics/tracker-notes.md#class-sweep-complete-overclaim-surviving-instance-outside-do). |
| Numbered-clause list broken by mid-sequence insertion (rules file) | 2026-09-09 (63c2356d) | 1 | 2026-09-09 (0cc1a4bb) | RESOLVED (0cc1a4bb) — code-style.md §10 reads 1..7 clean at HEAD. |
| §10 compliance-ratio/quote drift in a newly-authored data file's own comments | 2026-09-09 (7ca1f522) | 3 | 2026-09-09 (0cc1a4bb) | RULE CANDIDATE (3). 2 fixed; 1 open (`declaresUseServer` JSDoc). See [tracker-notes](topics/tracker-notes.md#10-compliance-ratio-quote-drift-in-a-newly-authored-data-fil). |
| §10 cl.5 fixup commit's own sweep leaves an adjacent stale claim | 2026-09-09 (aa10d2b5) | 1 | 2026-09-09 (aa10d2b5) | WATCHING. See [tracker-notes](topics/tracker-notes.md#10-cl-5-fixup-commit-s-own-sweep-leaves-an-adjacent-stale-cl). |
| Numbered DO-NOT/BLOCKING list gains a GAP when an item is deleted without renumbering | 2026-09-09 (7ca1f522) | 1 | 2026-09-09 (0cc1a4bb) | WATCHING. See [tracker-notes](topics/tracker-notes.md#numbered-do-not-blocking-list-gains-a-gap-when-an-item-is-de). |
| Spec-only / agent-memory-only delta: all checks pass | 2026-09-17 (chore/record-mechanical-lever) | 2 | 2026-09-17 | CLEAN. No TypeScript code in diff. |
| Hook-test mutation-claim encoding delta: all checks pass | 2026-09-17 (9c1ba910) | 7 | 2026-09-18 (chore/link-guard-claims) | CLEAN (7 branches, no BLOCKING/WARNING). See [tracker-notes](topics/tracker-notes.md#hook-test-mutation-claim-encoding-delta-all-checks-pass). |
| §10 false count in Decision entry + false MUTATION/GROUP claim in own test | 2026-09-18 (chore/validate-mutation-group-refs) | 1 | 2026-09-18 | RESOLVED (R2 fixup). Count removed; derivation command provided instead. |
| mutations.json-only + comment-rewrite delta: all checks pass | 2026-09-18 (chore/record-mechanical-lever R4) | 2 | 2026-09-18 | CLEAN R1+R2. |
| §10 stale function name in JSDoc after spawnSync→runNode migration | 2026-09-18 (fix/harden-fixture-spawn-helpers) | 1 | 2026-09-18 | WATCHING. JSDoc says "`spawnSync`"; code calls `runNode`. WARNING R1. |
| §10 cl.7 count doesn't match own derivation command | 2026-09-19 (feat/corpus-update-expected b61d839b) | 3 | 2026-09-20 (docs/single-source-corpus-plan R3) | RULE CANDIDATE (3). Inst 1: agent-code-reviewer.md "38" (correct: 35, no derivation). Inst 2: Decision 77 "five" (correct: 4 verified CR findings). Inst 3: tasks.md "decisions.md carries three of the lines" — grep shows 7 (correct pipeline-config count is 3, but derivation can't show that without noise-filtering). §10 cl.7. |
| §10 cl.8 section header universalised in a tense-fix correction, now false for items 6–9 | 2026-09-20 (docs/schedule-cr-local-retirement d9577924) | 1 | 2026-09-20 | RESOLVED (5093b387). |
| §10 cl.8 Decision entry quotes specific diff text that doesn't appear in the cited commit | 2026-09-19 (docs/parked-and-next-work f0e9597d) | 1 | 2026-09-19 | RESOLVED (d5c39b60 R3). |
| Agent/rules/docs-only delta (chore/pre-push-review-gate): all checks pass | 2026-09-17 (f885ed22) | 2 | 2026-09-17 (c3ad81b5) | CLEAN. |
| Tracker RESOLVED cell describes a fix that didn't happen — §10 false claim in agent-memory | 2026-09-14 (ab310cc9) | 1 | 2026-09-14 (ab310cc9) | RESOLVED (9a79ec78). |
| §10 cl.5 prose incoherence introduced while fixing a cl.2 count violation | 2026-09-14 (b9481952) | 1 | 2026-09-14 (b9481952) | RESOLVED (7d653f1b). |
| §10 CI comment overstates harness redundancy | 2026-09-14 (98469ba0) | 1 | 2026-09-14 (98469ba0) | RESOLVED (5b47604c). See [tracker-notes](topics/tracker-notes.md#10-ci-comment-overstates-harness-redundancy-false-for-prs-ad). |
| MUTATION: comment describes "passes silently" / "bypasses forEach" when mutation causes TypeError | 2026-09-14 (5b47604c) | 3 | 2026-09-14 (71adf5b0) | WATCHING. String fixtures hit TypeError on `.forEach()`, not "passes silently". See [tracker-notes](topics/tracker-notes.md#mutation-comment-describes-passes-silently-bypasses-foreach-). |
| §10 "already lists its deletion set" overclaim in a new Decision entry | 2026-09-15 (16382b62) | 1 | 2026-09-15 (16382b62) | FALSE POSITIVE. Claim was TRUE — tasks.md:292-299 enumerates four targets. |
| §10 cl.2: rules-text names extent-quantifier targets as a closed list | 2026-09-16 (1ef2eabf) | 1 | 2026-09-16 (a4ecd165) | RESOLVED (a4ecd165). |
| CR-local round-1 fixup on rules/docs-only commit: all checks pass | 2026-09-16 (f431ea74) | 1 | 2026-09-16 (f431ea74) | CLEAN. |
| §10 cl.2 fix for waiver audit's residue enumeration: all checks pass | 2026-09-16 (4c335a60) | 1 | 2026-09-16 (4c335a60) | CLEAN. |
| False-claim fixup on prose-path-guard branch — four fixes, no new claims | 2026-09-16 (82cdba3d) | 1 | 2026-09-16 (82cdba3d) | CLEAN. |
| Pin ./-prefix normaliser test (63cf80c0) | 2026-09-16 (63cf80c0) | 1 | 2026-09-16 (63cf80c0) | CLEAN. |
| Pin unpaired-angle placeholder end-to-end + CR mirror (3846352f) | 2026-09-16 (3846352f) | 1 | 2026-09-16 (3846352f) | CLEAN. |

| Prose-condensation drops a disjunct from a mirrored trigger condition | 2026-09-16 (docs/cut-injected-rules-corpus) | 1 | 2026-09-16 | WATCHING. CLAUDE.md §Post-commit condensed "new or changed" to "changed" — drops NEW-guard trigger. Sibling mirrors still say "new or changed". First observed condensation-path mirror desync. |
| RULE 0 archaeology/rationale added to a rules file | 2026-09-17 (chore/pre-push-review-gate) | 1 | 2026-09-17 | RESOLVED (4df13859). |
| §10 cl.3 threshold drift — canonical updated, mirror used old language in same-diff | 2026-09-17 (chore/pre-push-review-gate) | 1 | 2026-09-17 | RESOLVED (4df13859). |
| §10 cl.8 false "most … above" extent claim in round-1 fixup comment (fix/harden-fixture-spawn-helpers) | 2026-09-18 (c74eb914) | 1 | 2026-09-18 | RESOLVED (8d769b4e R3). |
| spawn.testkit.mjs — §10 runNode timeout comment: "none of guard-suite CI steps carries timeout-minutes" | 2026-09-18 (c74eb914) | 1 | 2026-09-18 | CLEAN. TRUE in scope. |
| Integration-fixture isolation (fix/integration-fixture-isolation): R1 clean, R2 one WARNING, R3 (ceiling) clean | 2026-09-18 | 3 | 2026-09-18 | RESOLVED R2 → R3 CLEAN. |
| fix/db-integration-fixture-isolation: fixture-namespace refactor, R1 one WARNING → R2 CLEAN | 2026-09-18 | 2 | 2026-09-18 | RESOLVED R1 → R2 CLEAN. |
| feat/corpus-b3-encode-retracted-phrase: mutation harness GROUP markers + dead-code removal | 2026-09-19 | 3 | 2026-09-19 | CLEAN R1+R2+R3. |
| §10 cl.7 Decision count stale at HEAD — window advanced when new commit was added | 2026-09-19 (docs/parked-and-next-work) | 1 | 2026-09-19 | RESOLVED (d5c39b60 R3). Endpoint pinned; R3 CLEAN. |
| RULE 0 archaeology in new rules file + §10 cl.7 count inconsistency (docs/schedule-cr-local-retirement) | 2026-09-19 (docs/schedule-cr-local-retirement) | 1 | 2026-09-20 (R5/b5902266) | RESOLVED (R5 CLEAN). R1 RULE 0 fixed; R2 "five"→fixed; R3 FPs; R4 git-grep syntax corrected; R5 CLEAN. See [tracker-notes](topics/tracker-notes.md#rule-0-archaeology-docs-schedule-cr-local-retirement). |
| §10 cl.8 PR-description misdescribes false claim type in the file it corrected | 2026-09-20 (docs/single-source-corpus-plan) | 2 | 2026-09-20 (55b61efc R2) | WATCHING. R1: setup-audit.md attributed wrong direction (Stop→Lefthook). R2 fixup: decisions.md attributed Lefthook when it said Stop. R3 ceiling round: WARNING §10 cl.7 — tasks.md "three of the lines" in decisions.md; grep shows 7 (3 pipeline-config lines are correct but derivation can't directly show "3" without noise-filtering). CEILING ROUND STOP. |

> Count increments only on a **distinct** mechanism. Rows transition state, never deleted.

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

## Topic pointers

- [commit-review-log](topics/commit-review-log.md) — per-commit review notes (read on demand).
- [file-size-watch-log](topics/file-size-watch-log.md) — full chronological file-size growth history (read on demand).
- [tracker-notes](topics/tracker-notes.md) — the evidence tail of every tracker row over 200 chars (read on demand).
