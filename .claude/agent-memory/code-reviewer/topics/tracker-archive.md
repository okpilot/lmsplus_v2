# Code Reviewer — Tracker Archive
> Terminal-state rows and single-branch CLEAN runs moved here from MEMORY.md to stay under the 25KB injection cap.
> Rows are never deleted. States: PROMOTED, RESOLVED, FALSE POSITIVE, SATURATED.

## Single-branch CLEAN rounds

| Branch | Round | Commit | Notes |
|--------|-------|--------|-------|
| ci/claude-opus-review | R1 | 4ae83e8e | 5 files, CI workflow + config + rules + docs only. No TypeScript/React. Action pin version comments verified (checkout v7.0.1 SHA + claude-code-action v1.0.231 SHA both confirmed via GitHub API). No code-style violations. CLEAN. |
| ci/claude-opus-review | R2 | eb513817 | 3 files (workflow fixup + steering + decisions). No TypeScript/React. Fixup adds verdict marker, live-head guard, trims prose, updates Decision 78. pipeline.json `modelLiteralSites` entry verified: `expects: "opus"` → `claude-opus-5`, matches `--model claude-opus-5` in workflow. No code-style violations. CLEAN. |
| guards/mutation-harness-staged | R4 (confirming, ceiling override) | 0944dff5 | Comment-only commit. All four §10 sites verified against touchesStaged body — five inputs correct. No code violations in full range. |
| guards/mutation-harness-staged | R5 (final confirming round post-fixup) | a7865d77 | Rename-scope fix + stale MUTATION comments + new test + ci.yml comment. 26/26 tests pass. MUTATION comment claims verified against blobAt body and git() helper (throws on non-zero). No code violations. |
| docs/deletion-reviewer | R3 (post-CR-fix) | 6b479426 | Three CR fixes: "PR"→"commit" in .coderabbit.yaml (mirrors canonical code-style.md §7); tasks.md derivation command extended to include `code-review (skill)` grep; plan.md post-gate steps renumbered 7/8/9→8/9/10 (7 round-1 members now). All changes verified correct against canonical sources. No code violations. |
| docs/deletion-reviewer | R2 | faf4e987 | Docs/rules-only diff. All "six"→"seven" reviewer count transitions consistent; pipeline.test.mjs 98/0. Corpus-codification "Round 1 keeps six members" (L249) left as dated decision record per orchestrator instruction. No code violations. |
| docs/deletion-reviewer | R1 | 89a2550c | Docs/rules-only: adds deletion-reviewer as 7th round-1 gate member (Decision 80). pipeline.json+test consistent (6 gate-round agents, code-review skill dispatched separately). All mirrors updated. §10 numeric claim in decisions.md is empirical evidence for a design decision, not a diff count. No code violations. |
| guards/secrets-guard | R1 (1d05e0c0) | 1d05e0c0 | Docs/config/spec only: `.gitignore`, `docs/security.md`, `CLAUDE.md`, `agent-security-auditor.md`, `tasks.md`. All three mechanical guards exit 0. Runtime claims verified: `.gitignore` pattern confirmed in file; secret-literal grep confirmed fallback-only (run-security-auditor.sh L124/158); GH push protection enabled via gh api. No code-style violations. |
| guards/shared-diff-parser | R3 (final) | 02c86c07 | 22 files, all .mjs hooks + ci.yml + pipeline.json. File-size guard exit 0. All new functions ≤27L. 32/32 diff-parse + 42/42 title-leakage tests pass. No React components, no TS files, no barrel files. CLEAN. |
| guards/secrets-guard | R1 | 42cd2d5e | 6 files, docs+config only (.gitignore, CLAUDE.md, security.md, agent-security-auditor.md, .claude/rules/security.md, corpus tasks.md). No functions, no React, no TS. Both guards exit 0. CLEAN. |
| guards/secrets-guard | R3 (final) | 7d28cdd9 | 6 files, docs+config only. R3 fixup corrected false pre-commit-hook claim across 4 mirrors. Both guards exit 0. CLEAN. |
| guards/mutation-harness-jobs | R2 | 670c2379 | --jobs N, runPool, spawnSuite async, transitive staged scope walk. All function bodies under 30L, all test files under 500L, 20/20 jobs tests pass. No code violations in full range. |
| guards/shared-diff-parser | R2 | 8566ae9c | shared diff-parse.mjs + testkit + config controls. 15 files, all .claude/hooks/. All functions under 30L, max nesting 3, no .tsx/.ts app code. File size guard passes (exit 0). test-title leakage check clean. No code violations in full range. |

## Archived terminal rows

| Pattern | First Seen | Count | Last Seen | Status |
|---------|-----------|-------|-----------|--------|
| Function > 30 lines in Server Action | 2026-03-20 (d93f924) | 2 | 2026-03-20 (6520962) | PROMOTED → code-style.md §3 (getFilteredCount 58L, toggleFlag 52L; both fixed) |
| New hook/utility file shipped without co-located test | 2026-03-21 (8771aa2) | 6 | 2026-08-30 (d2d3bdb3) | PROMOTED → code-style.md §7. 6th instance: `admin-report-helpers.ts`, RESOLVED same PR (`11cadfc2`). |
| Hook file > 80-line limit | 2026-03-21 (8771aa2) | 4 | 2026-04-27 (c656868) | PROMOTED (2026-09-09: mirror now `.claude/limits.json`). Fix = extract orchestration helper. use-study-config.ts 80L exactly at cap — still watch. |
| React component > 150-line limit | 2026-03-21 (8771aa2) | 6 | 2026-07-02 (03aae12d) | PROMOTED (2026-09-09: mirror now `.claude/limits.json`). rwy-2709-lh-pattern.tsx 155L was flagged BLOCKING (fix: extract RunwayBody). |
| Server Action file > 100-line limit | 2026-03-20 (d93f924) | 2 | 2026-06-07 (e9c2a36b) | RESOLVED. Watch: lookup.ts 112L; batch-submit.ts 100L exactly at cap. |
| E2E Playwright hermiticity (hard-delete without restoration) | 2026-04-30 | 2 | 2026-04-30 | RESOLVED — afterEach soft-delete pattern established; no recurrence. |
| §10 false "always" claim in mechanic-rewrite commits | 2026-09-06 (43b1b9a5) | 1 | 2026-09-07 (1bf29e9d) | RESOLVED (d58572c8). |
| Ambiguous "reset" scope in mechanic-rewrite prose | 2026-09-07 (092fab98) | 1 | 2026-09-07 | RESOLVED (4efa42a7). Line 31 reads "does NOT reset the round counter M". |
| Numbered-clause list broken by mid-sequence insertion | 2026-09-09 (63c2356d) | 1 | 2026-09-09 (0cc1a4bb) | RESOLVED — code-style.md §10 reads 1..7 clean at HEAD. |
| §10 "already lists its deletion set" overclaim | 2026-09-15 (16382b62) | 1 | 2026-09-15 | FALSE POSITIVE. Claim was TRUE: tasks.md:292-299 enumerates four targets. |
| §10 cl.2: rules-text names extent-quantifier targets as a closed list | 2026-09-16 (1ef2eabf) | 1 | 2026-09-16 (a4ecd165) | RESOLVED (a4ecd165). §10 cl.7 now explicitly declares the set OPEN, marks `most`/`every`/`neither` as ILLUSTRATIONS. |
| RULE 0 archaeology/rationale added to a rules file | 2026-09-17 (chore/pre-push-review-gate) | 1 | 2026-09-17 | RESOLVED (4df13859). Sentence deleted from agent-workflow.md. |
| §10 cl.3 threshold drift — canonical updated, mirror used old language | 2026-09-17 (chore/pre-push-review-gate) | 1 | 2026-09-17 | RESOLVED (4df13859). automerge.md line 31 now reads "different rounds or branches". |
| §10 cl.8 false "most … above" extent claim in fixup comment | 2026-09-18 (c74eb914) | 1 | 2026-09-18 | RESOLVED (8d769b4e R3). Direction claim removed; "imported by guard suites elsewhere in this job" — verified TRUE (14 importers). |
| §10 false count in Decision entry + false MUTATION/GROUP claim in own test | 2026-09-18 (chore/validate-mutation-group-refs) | 1 | 2026-09-18 | RESOLVED (R2 fixup). Decision 75 stale count removed; derivation command provided. |
| Tracker RESOLVED cell describes a fix that didn't happen | 2026-09-14 (ab310cc9) | 1 | 2026-09-14 | RESOLVED (9a79ec78). impl-critic/MEMORY.md row claimed ff562c9f "made the commit-msg entry DEFER" — it had only extended the enumeration. |
| §10 cl.5 prose incoherence introduced while fixing a cl.2 count violation | 2026-09-14 (b9481952) | 1 | 2026-09-14 | RESOLVED (7d653f1b). decisions.md footer now reads "the unpinned mechanisms are named rather than counted". |
| §10 CI comment overstates harness redundancy | 2026-09-14 (98469ba0) | 1 | 2026-09-14 | RESOLVED (5b47604c). False "re-grade what the merge-base already proved" justification now marked FALSE in-comment. |
| §10 cl.8 Decision entry quotes diff text not in cited commit | 2026-09-19 (docs/parked-and-next-work f0e9597d) | 1 | 2026-09-19 | RESOLVED (d5c39b60 R3). Evidence rewritten: no quoted phrases, claims verified by execution. |
| §10 cl.7 Decision count stale at HEAD | 2026-09-19 (docs/parked-and-next-work) | 1 | 2026-09-19 | RESOLVED (d5c39b60 R3). Decision 76 now says "60 of the 120 non-merge commits" (no percentage). |
| §10 cl.8 section header universalised in tense-fix correction | 2026-09-20 (docs/schedule-cr-local-retirement d9577924) | 1 | 2026-09-20 | RESOLVED (5093b387). New header: "findings it catches that our internal agents miss, and its own failure modes". |

## Single-branch CLEAN runs (not recurrent patterns)

| Branch / run | Date | Verdict |
|---|---|---|
| Spec-only / agent-memory-only delta (chore/record-mechanical-lever) | 2026-09-17 | CLEAN R1+R2. No TypeScript code in diff. |
| Agent/rules/docs-only delta (chore/pre-push-review-gate f885ed22, c3ad81b5) | 2026-09-17 | CLEAN. coderabbit-sync.md guard-trigger extension consistent; crlocal.md deletions clean. |
| Hook-test mutation-claim encoding delta (9c1ba910 + chore/link-guard-claims) | 2026-09-17-18 | CLEAN R1+R2+R3 + R1+R2. See tracker-notes. |
| mutations.json-only + comment-rewrite (chore/record-mechanical-lever R4, chore/encode-retracted-phrase-claims R2) | 2026-09-18 | CLEAN R1+R2. |
| spawn.testkit.mjs — §10 runNode timeout comment (c74eb914) | 2026-09-18 | CLEAN. TRUE: directive.test.mjs has timeout-minutes:5 but does not import spawn.testkit. |
| Integration-fixture isolation (fix/integration-fixture-isolation) | 2026-09-18 | R1 clean, R2 one WARNING (stale count → deleted), R3 (ceiling) clean. |
| fix/db-integration-fixture-isolation | 2026-09-18 | R1 WARNING (21-line diff count → deleted), R2 CLEAN. §1 RATCHET verified clean. |
| feat/corpus-b3-encode-retracted-phrase | 2026-09-19 | CLEAN R1+R2+R3. 493 tests pass, 0 dangling GROUP ids, --stats EXIT:0. |
| CR-local round-1 fixup on rules/docs-only commit (f431ea74) | 2026-09-16 | CLEAN. No BLOCKING, no WARNINGS. |
| §10 cl.2 fix for waiver audit residue enumeration (4c335a60) | 2026-09-16 | CLEAN. residue classes correctly marked ILLUSTRATIONS. |
| False-claim fixup on prose-path-guard branch (82cdba3d) | 2026-09-16 | CLEAN. Four fixes, no new claims. |
| Pin ./-prefix normaliser test (63cf80c0) | 2026-09-16 | CLEAN. |
| Pin unpaired-angle placeholder end-to-end + CR mirror (3846352f) | 2026-09-16 | CLEAN. New repo test non-vacuous. |
| RULE 0 archaeology in new rules file + §10 cl.7 count (docs/schedule-cr-local-retirement) | 2026-09-19-20 | R1 RULE 0 FIXED. R2-R5 CLEAN. git grep correct form: `git grep <pattern> <branch> -- <pathspec>` (branch after pattern, not before). |
| fix/learner-tracker-termination (R8-R11) | 2026-09-20-21 | CLEAN R8-R11. SATURATED state, all §10 claims verified. prose-claims/prose-paths EXIT:0. |
| guards/mutation-harness-staged R3 (CEILING) | 2026-09-22 (3f609574) | CLEAN. modeRun body improved 40→32L; no new function over 30L; touchesStaged 5 params + JSDoc → infra exception. Positive: scope predicates cleanly extracted as testable exports. |
| guards/shared-diff-parser R1 | 2026-09-22 | CLEAN. All 13 files in .claude/hooks/ + pipeline.json + ci.yml + tasks.md. No app code. All function bodies ≤30L, all params ≤3, nesting ≤3 levels, file-size guard passed. |
| ci/claude-opus-review | R3 | b758dca1 | Fixup: two `(.body // "")` jq null guards in claude-review.yml supersede shell step. CI workflow + pipeline.json + rules + docs + spec only. No TypeScript/React. No code-style violations. CLEAN. |
