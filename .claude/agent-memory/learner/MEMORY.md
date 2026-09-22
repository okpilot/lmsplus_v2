# Learner Agent Memory

> Cross-agent pattern synthesis + FP tracking. Update IN PLACE. Terminal rows → tracker-archive.md.

## Issue Frequency Tracker (active rows; terminal-state → tracker-archive.md)

Schema: Issue Type | Count | Last Seen | Status. Count=1: narrative in topic file.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Query missing student_id scope | 2 | 2026-03-15 | RULE CANDIDATE (2) → security.md (on 3rd) |
| Error path in existing function untested (count-error branch) | 8 | 2026-08-11 | RULE CANDIDATE (8) |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (deferred) |
| plpgsql body contains deferred-validation SQL (clean apply ≠ execution correctness) | 5 | 2026-08-24 | RULE CANDIDATE (5) |
| Integration-test count in plan.md goes stale on each test-adding commit | 7 | 2026-08-16 | RULE CANDIDATE (7) |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (2) |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 3 | 2026-06-24 | RULE CANDIDATE (3) |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE |
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 7 | 2026-09-19 | RULE CANDIDATE (7) — needs broadening; file-cap green masks function-cap violation |
| `vi.spyOn` spy restore hygiene gap (spy leaks across tests on assertion failure) | 2 | 2026-06-20 | RULE CANDIDATE |
| CLAUDE.md QA-pipeline section drifts when lefthook.yml changes | 3 | 2026-09-14 | RULE CANDIDATE (3) |
| Test-file split drops a test-branch guard or condition during the move | 2 | 2026-06-23 | RULE CANDIDATE |
| Conventional-commit subject/scope hook failures (uppercase subject start, compound scope/type) | 2 | 2026-06-24 | RULE CANDIDATE |
| docs/database.md "Last updated" footer changelog entry stale when database.md content changes | 2 | 2026-06-26 | RULE CANDIDATE |
| Rename/move leaves stale string references in source/test file inline comments | 3 | 2026-09-18 | RULE CANDIDATE (3) |
| Missing route entry in docs/plan.md route-structure tree after new route added | 2 | 2026-07-08 | RULE CANDIDATE |
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol |
| Regression test can't detect fix's own reversion (passes on unchanged artifact) | 5 | 2026-09-18 | RULE CANDIDATE (5) |
| Reviewer asserts code/test element absent or unreachable | 2 | 2026-08-16 | RULE CANDIDATE (2) → 2 agent DOs |
| Behavior-first test-title rename overclaims a stronger guarantee | 3 | 2026-08-09 | RULE CANDIDATE (3) → code-style.md §7 |
| Claim-correction commit updates a count but leaves its sibling stale | 12 | 2026-09-20 | RULE CANDIDATE (12). Detail: topic file |
| Reviewer fabricates external state claims (SHA/PR/issue/tag "doesn't exist") | 4 | 2026-09-22 | RULE CANDIDATE (4). CR (3×) + semantic-reviewer (1×: false "no v7 tag" claim) |
| check-test-title-leakage.mjs misses bare snake_case token in title | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note |
| Status/error-posture change leaves a sibling spec unrevised | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation |
| Post-commit gates miss new site violating a promoted §7 rule | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Proposed verification command silently verifies nothing | 7 | 2026-09-15 | RULE CANDIDATE (7). Detail: cross-agent-lessons.md |
| Rules-file bullet closes an enumeration of a structurally OPEN set | 15 | 2026-09-18 | RULE CANDIDATE (15) — text exists (§10 cl.2). Detail: topic file |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 5 | 2026-09-17 | RULE CANDIDATE (5). Topic file |
| Mutation-check executed but doesn't falsify the claim — unisolated or untargeted mutation | 7 | 2026-09-18 | RULE CANDIDATE (7). Detail: cross-agent-lessons.md |
| Verification/gate check accepts category-membership/substring, not exact identity | 5 | 2026-09-22 | RULE CANDIDATE (5). Topic file |
| Schema/spec validator has no closed key set — extra keys pass silently | 2 | 2026-09-07 | RULE CANDIDATE (2) → code-style.md §5. Draft in topic file |
| Orchestrator encodes its own unresolved proposal into a durable data file as settled fact | 1 | 2026-09-07 | WATCHING — data-file variant of row 74 (topic file) |
| Delimiter-scan parser matches first occurrence anywhere, not the paired/anchored one | 1 | 2026-09-07 | WATCHING |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE |
| Inline comment enumerating sibling files/call-sites by name | 2 | 2026-08-17 | RULE CANDIDATE |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) |
| Prose asserts an issue is open/closed without `gh issue view` | 5 | 2026-09-22 | RULE CANDIDATE (5) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Self-invalidating relative reference in durable rules/doc file | 4 | 2026-09-16 | RULE CANDIDATE (4) |
| Verification gate's pass condition is empty result — fails open on malformed input | 7 | 2026-09-18 | RULE CANDIDATE (7). Detail: cross-agent-lessons.md |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 4 | 2026-09-08 | RULE CANDIDATE (4). Detail: topic file |
| Post-cycle agent-memory delta written but not committed before push | 3 | 2026-08-20 | RULE CANDIDATE (3) |
| Derivation query replacing an open-set enumeration is unverified before publish | 3 | 2026-09-15 | RULE CANDIDATE (3) → §10 cl.2 addendum. Detail: topic file |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) |
| Empirical measurement correct for tested scenario but excludes the failure case | 4 | 2026-09-08 | RULE CANDIDATE (4) → §10 clause 5. Detail: topic file |
| Corrected claim partially retracted — old wording persists elsewhere | 18 | 2026-09-22 | RULE CANDIDATE (18). Detail: cross-agent-lessons.md |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) |
| check-mirror-sync.mjs cannot verify 2+ occurrences of one anchor WITHIN the same file | 1 | 2026-09-02 | WATCHING |
| Agent asserts a reduced-cycle exemption from a change's SHAPE, not the rule's PATH test | 3 | 2026-08-24 | RULE CANDIDATE (3) — 2 agent types |
| Unverified superlative/rank asserted about tracker data without re-deriving | 2 | 2026-08-30 | RULE CANDIDATE (2) |
| Mocked-Supabase test assertion vacuous about a chain-builder ARGUMENT | 2 | 2026-08-30 | RULE CANDIDATE (2) → code-style.md §7 |
| File brought exactly to its size cap, re-crossed by a same-commit fix | 2 | 2026-08-30 | RULE CANDIDATE (2) → agent-code-reviewer.md |
| Test title pins a silent-fallback/coercion defect as intended, inverted only when fixed | 3 | 2026-09-18 | RULE CANDIDATE (3) → code-style.md §7 |
| Quantified claim re a live/open data source goes stale post-write | 2 | 2026-09-02 | RULE CANDIDATE (2) → §10: pin to a commit SHA |
| CLAUDE.md docs-only exemption path list omits `.spec-workflow/specs/*/tasks.md` | 2 | 2026-09-02 | RULE CANDIDATE (2) → add to CLAUDE.md docs-only list |
| Orchestrator drafts its own unverified "because X"/attribution claim in comment prose | 4 | 2026-09-01 | RULE CANDIDATE (4). Detail: topic file |
| (8 count=1 WATCHING rows from 2026-09-02, pre-18757ddf, relocated) | — | 2026-09-02 | see tracker-archive.md "Live-table snapshot relocated 2026-09-02 (batch 4)" |
| Implementation-critic outright omitted pre-commit, no stated exemption — run post-hoc, found sound | 1 | 2026-09-06 | WATCHING — distinct from row 632 |
| Agent's own auto-injected rules-file copy is stale mid-session | 2 | 2026-09-06 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol. Detail: topic file |
| Sweep regex matches canonical form, silently skips alternative form | 3 | 2026-09-22 | RULE CANDIDATE (3). TEST_LINE_RE missed test.each/it.skip/.only; CLAUDE_PATH_RE missed .cjs/.ts/.py. Detail: topic file |
| Consistency check verifies A against B with no independent anchor — co-removing both passes clean | 4 | 2026-09-08 | RULE CANDIDATE → §7, draft in topic file |
| Agent's Bash-run destructive git cmd destroys ANOTHER agent's concurrent uncommitted work | 1 | 2026-09-08 | WATCHING — Bash hole. Topic file |
| Branch scope cited via unstable tracker-row IDs — several resolved wrong | 1 | 2026-09-08 | WATCHING — cite Issue-Type text instead |
| `cd` into a stale/removed worktree fails silently, write lands in the real repo | 1 | 2026-09-08 | WATCHING — Bash residual hole |
| doc-updater proposal echoes an example from its OWN dispatch prompt as a literal citation | 6 | 2026-09-18 | RULE CANDIDATE (6). Detail: cross-agent-lessons.md |
| Ratchet/baseline keyed on PATH not content — content-swap or rename escapes it | 2 | 2026-09-09 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Commit message claims file 'already carries/has X' when X landed same commit | 4 | 2026-09-16 | RULE CANDIDATE (4) → §10, verify via `git show HEAD~1:<path>` |
| Hook script's git-diff filter argument doesn't cover git's R(ename) status | 1 | 2026-09-10 | WATCHING — cousin of PROMOTED row 88 |
| Orchestrator's own SKIP-with-reason rests on a wrong stated premise, reversed by external reviewer | 1 | 2026-09-10 | WATCHING |
| Regex→hand-parser rewrite of a blocking gate: fix commit's own corpus-diff claim is insufficient | 2 | 2026-09-13 | RULE CANDIDATE (2). Detail: topic file |
| Concurrent agent-Bash mutation transiently modifies a tracked file; unrelated agent reports it | 1 | 2026-09-13 | WATCHING — 3rd Bash-hole materialization |
| Tracker/guard-candidate claim written against wrong git state (working-tree observed, tool reads index) | 2 | 2026-09-20 | RULE CANDIDATE (2) → verify against git index before recording |
| Fix to gate stage-1 changes input shape, breaking stage-2's assumption | 1 | 2026-09-14 | WATCHING. Detail: cross-agent-lessons.md |
| Orchestrator excludes a known-drift-prone rule-mirror from a sweep on an unverified claim | 1 | 2026-09-15 | WATCHING — false "has Read access" claim |
| Single-line grep false-negative on text present but line-wrapped mid-phrase | 2 | 2026-09-20 | RULE CANDIDATE (2). Topic file |
| Documented suppression/exemption cannot self-expire (diff-scanner can't count its retiring condition) | 1 | 2026-09-15 | WATCHING (#1282 deferred). Detail: cross-agent-lessons.md |
| semantic-reviewer bounds out a §10 cl.2 violation as "refinement" — CR-local catches it same round | 1 | 2026-09-15 | WATCHING — classification-boundary gap |
| Reviewer proposes max-scope remedy; split reveals a cheap in-scope mitigation the reviewer missed | 1 | 2026-09-15 | WATCHING |
| Reviewer reinterprets a false claim into a nearby true one — reports clean | 2 | 2026-09-15 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Mirror closing sentence cross-references consequence rather than stating inline | 1 | 2026-09-15 | WATCHING |
| doc-updater makes assertions without pasting verification command | 6 | 2026-09-18 | RULE CANDIDATE (6). Topic file |
| Command shipped per §10 cl.2 but accompanied by prose overclaiming its scope | 1 | 2026-09-15 | WATCHING — distinct from rows 62/83 |
| Live count in a dispatch prompt/repo grep goes stale mid-cycle from a sibling agent's parallel write | 2 | 2026-09-16 | WATCHING (2) — accepted async-dispatch limitation |
| `check-retracted-phrase.mjs` trigger gap — pure deletion bypasses hook even when survivor exists | 1 | 2026-09-15 | WATCHING |
| Config field silently disables entire config when maxLength exceeded — no diagnostic | 1 | 2026-09-15 | WATCHING |
| Trailing tag comment on a SHA-pinned GH Action doesn't match the resolved commit | 3 | 2026-09-16 | RULE CANDIDATE (3). Topic file |
| Pin's tag comment correct at authorship, drifts false when upstream tag is repointed later | 1 | 2026-09-16 | WATCHING — needs re-run/scheduled check |
| `vi.mock` targets an exact specifier; a migrated import path leaves it silently inert | 1 | 2026-09-16 | WATCHING — proved by mutation |
| `pnpm.overrides` pin forces a package below a DIFFERENT dependent's declared range, unnoticed | 1 | 2026-09-16 | WATCHING — SKIPPED (harmless) |
| `json.dumps` round-trip reformats tracked JSON file, masking real changes in noise | 3 | 2026-09-18 | RULE CANDIDATE (3) → agent-test-writer.md NEVER + dispatch CONSTRAINTS |
| False universal quantifier in new comment ("unlike every other case") falsified by sibling cases | 1 | 2026-09-16 | WATCHING |
| Reviewer miscounts function length by including JSDoc in the body line count | 2 | 2026-09-19 | RULE CANDIDATE (2) → agent-code-reviewer.md: count body only, first statement to closing `}` |
| Adding tests to mutation harness invalidates pre-existing exact-set `expectRed` specs | 16 | 2026-09-22 | RULE CANDIDATE (16). Run FULL harness on every test addition. Detail: cross-agent-lessons.md |
| `expectRed` member reddens via an earlier unrelated assertion — named mechanism never reached | 3 | 2026-09-18 | WATCHING — test goes red via earlier assertion; NOT row 97 |
| run-mutations.mjs grades committed HEAD, not the worktree | 1 | 2026-09-18 | WATCHING — commit before running |
| doc-updater miscounts its own pasted command output (correct artifact, wrong tally) | 1 | 2026-09-16 | WATCHING — distinct from row 109 (no-artifact variant) |
| git flags/options placed AFTER `--`, treated as pathspecs — git narrows silently, wrong conclusion drawn | 2 | 2026-09-16 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Prose claims exclusion prevents fail-open when exclusion IS the fail-open | 1 | 2026-09-16 | WATCHING |
| Doc summary/footer recapitulates content already present inline | 1 | 2026-09-16 | WATCHING |
| CR reviewer contradicts its own prior-round verdict on the same finding | 1 | 2026-09-16 | WATCHING |
| Taskless/draft spec carries stale rule-restatement — mirror table "ACTIVE specs only" unclear | 3 | 2026-09-22 | RULE CANDIDATE (3) — active-spec roster/count mirror missed on deletion-reviewer addition: 2 open specs + plan-critic caught corpus-codification tasks.md. Clarify "ACTIVE" in agent-workflow.md mirror table |
| Test fixture for compound AND-check vacuous about one conjunct — other half undetectable | 1 | 2026-09-17 | WATCHING |
| `--coverage` gap denominator rises when a new test carries its own MUTATION: comment | 1 | 2026-09-18 | WATCHING |
| Orchestrator propagates a numeric claim from an agent's review report into a committed artifact without re-deriving | 2 | 2026-09-18 | RULE CANDIDATE (2). Detail: topic file |
| `grep -cF` under this shell's ugrep wrapper misparses a multi-line pattern (newline read as OR) | 1 | 2026-09-18 | WATCHING — env tooling trap, use python3 str.count |
| Compound shell command's exit code is its LAST stage's — a trailing `grep -c` on zero matches masks a passing run as failed | 1 | 2026-09-18 | WATCHING — env tooling trap |
| Marker continuation line ending in comma swallows next unrelated parser token as ids | 1 | 2026-09-18 | WATCHING |
| New helper ships the exact defect class it was written to fix — first caller catches what 15 synthetic tests missed | 1 | 2026-09-18 | WATCHING |
| Wall-clock timer as non-vacuity guard — flake-prone on CI | 1 | 2026-09-18 | WATCHING — fixed with `vi.useFakeTimers` |
| Orchestrator derives red-team trigger from semantic intent instead of mechanical glob of changed paths | 1 | 2026-09-18 | WATCHING — lapse, not a rule gap |
| Plan Validation skips required `wc -l` growth check — over-cap baselined files re-crossed at pre-commit | 2 | 2026-09-19 | RULE CANDIDATE (2) — rule exists in §1; being skipped |
| Canonical rule file stale behind its own mirror (rule text ≠ pipeline.json encoding) | 2 | 2026-09-19 | RULE CANDIDATE (2) — validate trigger-condition text against pipeline.json |
| Spy/mock assertion vacuous about content — `.toHaveBeenCalled()` without argument check | 1 | 2026-09-19 | WATCHING |
| Orchestrator reads only first page of flat PR comments endpoint, reports partial count, pushes on it | 1 | 2026-09-19 | WATCHING — promote on next DISTINCT branch; target: agent-workflow.md |
| Orchestrator/plan-critic reasons to a specific DB error code without executing — local-grant drift invalidates the reasoning | 1 | 2026-09-19 | WATCHING |
| semantic-reviewer reports wrong file count in review header | 2 | 2026-09-19 | RULE CANDIDATE (2) — agent must derive via `git diff --name-only ... \| wc -l` |
| RULE 0 prose in spec tasks.md entry caught by CR-local | 1 | 2026-09-19 | WATCHING |
| Orchestrator misses a plan-stated doc edit during execution | 1 | 2026-09-19 | WATCHING |
| Cited SHA resolves locally but is a loose object — invisible on fresh clone / after gc | 1 | 2026-09-19 | WATCHING |
| Scope excluded by output-text filter (`grep -v`) not by path, silently drops lines quoting the excluded string | 3 | 2026-09-20 | RULE CANDIDATE (3) — exclusion must be a `':(exclude)<path>'` pathspec |
| Reviewer validates a PAST finding against a LATER commit state, calls it false positive | 1 | 2026-09-20 | WATCHING — finding-validation table requires naming the commit state |
| `check-retracted-phrase.mjs` tokeniser matches numbers and filenames only — phrase-blind beyond those tokens | 1 | 2026-09-20 | WATCHING — distinct from row 112 (deletion-bypass) |
| Deletion pass drops correction-annotation, leaving false body text standing | 1 | 2026-09-20 | WATCHING |
| Agent writes tomorrow's date (2AM host clock, UTC still prior day) in committed text | 1 | 2026-09-20 | WATCHING |
| `git cat-file -e` exits 128 for absent-path AND unresolvable-ref — probe conflates two states | 1 | 2026-09-22 | WATCHING — blobAt/git ls-tree is the fix |
| test-writer writes `GROUP: <id>` naming a mutation not yet encoded — `--coverage` exits non-zero on DANGLING id | 1 | 2026-09-22 | WATCHING |
| Runtime message/comment names narrower scope than actual transitive walk after scope expansion | 2 | 2026-09-22 | RULE CANDIDATE (2). P1 + P1b branches. Stale message text + stale header prose |
| Test comment uses positional cross-file reference ("above") when referent is in a different file | 1 | 2026-09-22 | WATCHING |
| Docstring/comment example claims code performs an operation it does not | 1 | 2026-09-22 | WATCHING |
| test-writer writes MUTATION: annotations without GROUP: linkage — orchestrator must encode and link | 1 | 2026-09-22 | WATCHING |
| Node.js readable stream appended as raw Buffer without setEncoding — multi-byte chars corrupt at chunk boundaries | 1 | 2026-09-22 | WATCHING |
| Implementation/fixup agent writes new function exceeding 30-line cap — not caught before committing | 3 | 2026-09-22 | RULE CANDIDATE (3). guards/controls R1/R2/R3: 3 distinct functions. Broadens row 22 |
| Guard behavior wired/declared but not graded in mutation harness (expectRed/grading loop) | 4 | 2026-09-22 | RULE CANDIDATE (4). guards/controls R1+R2 + shared-diff-parser R1+R2. New code path added to existing guard without mutation annotation in the same commit. → §7 addendum |
| CI YAML parser's guard-lookup misses `- run:` list-item form — wired guard escapes registry | 1 | 2026-09-22 | WATCHING — guards/controls R1 code-review(skill) |
| Guard git-invocation output not normalized for git-config-sensitive options (color.ui, noprefix, textconv, ext-diff) | 1 | 2026-09-22 | WATCHING — shared-diff-parser R1 (semantic + code-review skill independently); fix kept widening to N sibling call sites in R2 |
| `Closes #N` keyword on a PR that drops the issue's own acceptance criteria | 1 | 2026-09-22 | WATCHING |
| Orchestrator checks only root `.gitignore` when verifying file exposure — misses nested `.gitignore` files | 1 | 2026-09-22 | WATCHING |
| CI workflow re-run reuses stale event payload — head.sha is the trigger event's, not live HEAD | 1 | 2026-09-22 | WATCHING — code-review(skill) ci/claude-opus-review |
| jq filter reads nullable field without null coalescing → exits non-zero on null (`.body` case) | 1 | 2026-09-22 | WATCHING — semantic-reviewer ci/claude-opus-review; fix: `(.field // "")` |

## Durable knowledge (cross-agent)

Bullets removed 2026-09-16 are relocated verbatim in `topics/cross-agent-lessons.md`.

- Promotion threshold = **2 distinct mechanisms**, different commits. Sweep-On-Rule-Promotion.
- Biggest recurring defect: partial fix to a sibling-file group. Topic file.
- WHY-clause falsity: check WHY clauses first on doc-only commits (row 60).
- SWEEP COMPLETENESS: paste enforcer output — "audited, all accurate" is unfalsifiable (§10 cl.5). Row 44.
- Decision 76: mechanical §10 enforcer has 50% FP rate on correction-context commits.
- 172 RULE CANDIDATE rows in tracker-archive.md (confirmed 2026-09-20) — each at promotion bar.
- guards/mutation-harness-staged (2026-09-22): ceiling (R3 APPLY). Row 63 (SATURATED, §10 cl.8) → 38, archived. Row 109 → 15. Row 52 → 5. POSITIVE: code-review (skill) caught git cat-file exit-code conflation (critical). 2 new WATCHING.
- guards/mutation-harness-jobs (2026-09-22): R2 clean. Row 108 → 16. New RULE CANDIDATE: scope-understatement after walk expansion (2 branches). 4 new WATCHING.
- guards/controls (2026-09-22): ceiling (R3 APPLY). Row 75 → 3. 2 new RULE CANDIDATEs (fixup function-length overrun; ungraded guard behaviors). 1 new WATCHING (CI YAML `- run:` form). implementation-critic CLEAN. doc-updater SKIPPED (CLAUDE.md §QA enumeration correctly rejected — data belongs in pipeline.json).
- guards/shared-diff-parser (2026-09-22): R3 clean. Row 148 → 4 (ungraded new path on R1+R2). 1 new WATCHING (git-config-sensitive parse). Partial-sibling-fix recurrence is SATURATED (CLAUDE.md rule already exists; archived row count+). POSITIVE: semantic + code-review(skill) independently caught the `--no-color` gap in R1 — gate redundancy worked.
- guards/secrets-guard (2026-09-22): R3 clean (docs + .gitignore fix only; no pre-commit guard built). Pattern "correction introduces a new false claim" recurred TWICE (R1 and R2 fixups) — SATURATED by §10 cl.8 (rule text already exists). 2 new WATCHING rows (Closes-#N drops acceptance criteria; nested .gitignore miss). POSITIVE: code-review (skill, opus) caught false claim in plan text that plan-critic, impl-critic, and semantic all missed in R1.
- Per-branch history (2026-09-18 to 2026-09-20): topics/cross-agent-lessons.md (search "Durable-knowledge bullets relocated").
- docs/deletion-reviewer (2026-09-22): R2 clean. Row 61 → 18 (learner.md same-file paraphrase left stale after Mission edit). Row 116 → 3, RULE CANDIDATE (2 open specs + plan-critic hit on corpus-codification tasks.md; all carried stale 6-member round-1 count). code-review (skill) caught 4 of 5 applied findings; semantic-reviewer 1. deletion-reviewer CLEAN. Recommendation: clarify "ACTIVE spec" definition in agent-workflow.md mirror table row.
- ci/claude-opus-review (2026-09-22): R3 clean. Row 43 → 5 (dismiss filter too broad: any bot review, not exact marker — code-review+semantic both caught it). Row 35 → 4 (semantic-reviewer false "no v7 tag" claim; row broadened to all reviewer types). 2 new WATCHING (stale workflow head.sha on re-run; jq nullable-body). POSITIVE: deletion-reviewer found 3 prose redundancies (Decision-78 restatements); doc-updater found steering tech.md omission; gate stopped R3 clean.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
