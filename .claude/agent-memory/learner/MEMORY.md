# Learner Agent Memory

> Cross-agent pattern synthesis + FP tracking. Update IN PLACE. Terminal rows → tracker-archive.md.

## Issue Frequency Tracker (active rows; terminal-state → tracker-archive.md)

Schema: Issue Type | Count | Last Seen | Status. Count=1: narrative in topic file.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Query missing student_id scope | 2 | 2026-03-15 | RULE CANDIDATE (2) → security.md (on 3rd) |
| Error path in existing function untested (count-error branch) | 8 | 2026-08-11 | RULE CANDIDATE (8). |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (deferred). |
| plpgsql body contains deferred-validation SQL (clean apply ≠ execution correctness) | 5 | 2026-08-24 | RULE CANDIDATE (5). |
| Integration-test count in plan.md goes stale on each test-adding commit | 7 | 2026-08-16 | RULE CANDIDATE (7). |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (2) |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE. |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 3 | 2026-06-24 | RULE CANDIDATE (3). |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE. |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE |
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 7 | 2026-09-19 | RULE CANDIDATE (7) — needs broadening. File-cap green masks function-cap violation; need independent check. |
| `vi.spyOn` spy restore hygiene gap (spy leaks across tests on assertion failure) | 2 | 2026-06-20 | RULE CANDIDATE. |
| CLAUDE.md QA-pipeline section drifts when lefthook.yml changes | 3 | 2026-09-14 | RULE CANDIDATE (3). |
| Test-file split drops a test-branch guard or condition during the move | 2 | 2026-06-23 | RULE CANDIDATE. |
| Conventional-commit subject/scope hook failures (uppercase subject start, compound scope/type) | 2 | 2026-06-24 | RULE CANDIDATE |
| docs/database.md "Last updated" footer changelog entry stale when database.md content changes | 2 | 2026-06-26 | RULE CANDIDATE |
| Rename/move leaves stale string references in source/test file inline comments | 3 | 2026-09-18 | RULE CANDIDATE (3). |
| Missing route entry in docs/plan.md route-structure tree after new route added | 2 | 2026-07-08 | RULE CANDIDATE |
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol |
| Regression test can't detect fix's own reversion (passes | 5 | 2026-09-18 | RULE CANDIDATE (5) |
| Reviewer asserts code/test element absent or unreachable | 2 | 2026-08-16 | RULE CANDIDATE (2) → 2 agent DOs |
| Behavior-first test-title rename overclaims a stronger | 3 | 2026-08-09 | RULE CANDIDATE (3) → code-style.md §7 |
| Claim-correction commit updates a count but leaves its | 11 | 2026-09-15 | RULE CANDIDATE (11). Detail: topic file |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't | 3 | 2026-08-19 | RULE CANDIDATE (3) |
| check-test-title-leakage.mjs misses bare snake_case token | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note |
| Status/error-posture change leaves a sibling spec | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation |
| Post-commit gates miss new site violating a promoted §7 | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Proposed verification command silently verifies nothing | 7 | 2026-09-15 | RULE CANDIDATE (7). Detail: cross-agent-lessons.md |
| Fix commit correcting §10 violations introduces fresh §10 | 76 | 2026-09-20 | PROMOTED → §10 cl.8 (rule already written). Pattern persists — 5 rounds this branch. Propose SATURATED state in agent-memory.md for "rule written, behavioral, irreducible". Detail: topic file |
| Rules-file bullet closes an enumeration of a structurally OPEN set | 15 | 2026-09-18 | RULE CANDIDATE (15) — text exists (§10 cl.2). Detail: topic file |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 5 | 2026-09-17 | RULE CANDIDATE (5). Topic file. |
| Mutation-check executed but doesn't falsify the claim — unisolated or untargeted mutation | 7 | 2026-09-18 | RULE CANDIDATE (7). Detail: cross-agent-lessons.md |
| Verification/gate check accepts category-membership/substring, not exact identity | 4 | 2026-09-14 | RULE CANDIDATE (4). Topic file. |
| Schema/spec validator has no closed key set — extra keys pass silently | 2 | 2026-09-07 | RULE CANDIDATE (2) → code-style.md §5. Draft in topic file |
| Orchestrator encodes its own unresolved proposal into a durable data file as settled fact | 1 | 2026-09-07 | WATCHING — data-file variant of row 74 (topic file) |
| Delimiter-scan parser matches first occurrence anywhere, not the paired/anchored one | 1 | 2026-09-07 | WATCHING — `dc9789f9`. Log and watch |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE |
| Inline comment enumerating sibling files/call-sites by | 2 | 2026-08-17 | RULE CANDIDATE |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) |
| Prose asserts an issue is closed/resolved without `gh issue view` | 4 | 2026-08-19 | RULE CANDIDATE (4) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Self-invalidating relative reference in durable rules/doc file | 4 | 2026-09-16 | RULE CANDIDATE (4) |
| Verification gate's pass condition is empty result — fails open on malformed input | 7 | 2026-09-18 | RULE CANDIDATE (7). Detail: cross-agent-lessons.md |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 4 | 2026-09-08 | RULE CANDIDATE (4). Detail: topic file |
| Correct advice with invented rationale (false WHY) | 10 | 2026-09-17 | PROMOTED → § Finding Validation. Post-promotion recurrence. Topic file. |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) |
| Derivation query replacing an open-set enumeration is unverified before publish | 3 | 2026-09-15 | RULE CANDIDATE (3) → §10 cl.2 addendum. Detail: topic file |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence |
| Empirical measurement correct for tested scenario but excludes the failure case | 4 | 2026-09-08 | RULE CANDIDATE (4) → §10 clause 5. Detail: topic file |
| Corrected claim partially retracted — old wording persists elsewhere | 15 | 2026-09-17 | RULE CANDIDATE (15). Detail: cross-agent-lessons.md |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 32 | 2026-09-18 | RULE CANDIDATE (32). Detail: topic file |
| check-mirror-sync.mjs cannot verify 2+ occurrences of one anchor WITHIN the same file | 1 | 2026-09-02 | WATCHING. Log and watch |
| Agent asserts a reduced-cycle exemption from a change's SHAPE, not the rule's PATH test | 3 | 2026-08-24 | RULE CANDIDATE (3) — 2 agent types |
| Unverified superlative/rank asserted about tracker data without re-deriving | 2 | 2026-08-30 | RULE CANDIDATE (2) |
| Mocked-Supabase test assertion vacuous about a chain-builder ARGUMENT | 2 | 2026-08-30 | RULE CANDIDATE (2) → code-style.md §7 |
| File brought exactly to its size cap, re-crossed by a same-commit fix | 2 | 2026-08-30 | RULE CANDIDATE (2) → agent-code-reviewer.md |
| Test title pins a silent-fallback/coercion defect as intended, inverted only when fixed | 3 | 2026-09-18 | RULE CANDIDATE (3) → code-style.md §7 |
| Quantified claim re a live/open data source goes stale post-write | 2 | 2026-09-02 | RULE CANDIDATE (2) → §10: pin to a commit SHA |
| CLAUDE.md docs-only exemption path list omits `.spec-workflow/specs/*/tasks.md` | 2 | 2026-09-02 | RULE CANDIDATE (2) → add to CLAUDE.md docs-only list |
| Orchestrator drafts its own unverified "because X"/attribution claim in comment prose | 4 | 2026-09-01 | RULE CANDIDATE (4). Detail: topic file |
| (8 count=1 WATCHING rows from 2026-09-02, pre-18757ddf, relocated) | — | 2026-09-02 | see tracker-archive.md "Live-table snapshot relocated 2026-09-02 (batch 4)" |
| Implementation-critic outright omitted pre-commit, no stated exemption — run post-hoc, found sound | 1 | 2026-09-06 | WATCHING — distinct from row 632. Log and watch |
| Agent's own auto-injected rules-file copy is stale mid-session | 2 | 2026-09-06 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol. Detail: topic file |
| Verification evidence answers a different proposition — real check, wrong question | 12 | 2026-09-20 | PROMOTED → code-style.md §7 (proposed). Post-promotion recurrence ×2 (rounds 1+2 this branch: semantic-reviewer [GOOD] anchored on model-tier token, missed dispatch-shape clause). Topic file. |
| Sweep regex matches canonical form, silently skips alternative form | 2 | 2026-09-18 | RULE CANDIDATE (2). TEST_LINE_RE missed test.each/it.skip/.only — chore/validate-mutation-group-refs. Detail: topic file |
| Consistency check verifies A against B with no independent anchor — co-removing both passes clean | 4 | 2026-09-08 | RULE CANDIDATE → §7, draft in topic file |
| Agent's Bash-run destructive git cmd destroys ANOTHER agent's concurrent uncommitted work | 1 | 2026-09-08 | WATCHING — Bash hole. Topic file. |
| Branch scope cited via unstable tracker-row IDs — several resolved wrong | 1 | 2026-09-08 | WATCHING — cite Issue-Type text instead. Detail: topic file |
| `cd` into a stale/removed worktree fails silently, write lands in the real repo | 1 | 2026-09-08 | WATCHING — Bash residual hole. Detail: topic file |
| doc-updater proposal echoes an example from its OWN dispatch prompt as a literal citation | 6 | 2026-09-18 | RULE CANDIDATE (6). Agent treats own context as factual over grepping the artifact. Detail: cross-agent-lessons.md |
| Ratchet/baseline keyed on PATH not content — content-swap or rename escapes it | 2 | 2026-09-09 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Commit message claims file 'already carries/has X' when X landed same commit | 4 | 2026-09-16 | RULE CANDIDATE (4) → §10, verify via `git show HEAD~1:<path>` |
| Commit-message count computed pre-edit; own edits make it stale on arrival | 7 | 2026-09-17 | PROMOTED → §10 cl.7. Recurred four times post. Detail: topic file |
| Hook script's git-diff filter argument doesn't cover git's R(ename) status | 1 | 2026-09-10 | WATCHING — cousin of PROMOTED row 88. Detail: topic file |
| Orchestrator's own SKIP-with-reason rests on a wrong stated premise, reversed by an external reviewer round | 1 | 2026-09-10 | WATCHING. Detail: topic file |
| Regex→hand-parser rewrite of a blocking gate: fix commit's own corpus-diff claim is insufficient | 2 | 2026-09-13 | RULE CANDIDATE (2). Detail: topic file |
| Concurrent agent-Bash mutation transiently modifies a tracked file; unrelated agent reports it | 1 | 2026-09-13 | WATCHING — 3rd Bash-hole materialization. Topic file |
| MUTATION: comment overclaims which mechanisms the test pins | 10 | 2026-09-18 | PROMOTED → code-style.md §7. Post-promotion recurrence x4. Detail: cross-agent-lessons.md |
| Tracker row written against staged/draft code state — corrected before commit lands | 1 | 2026-09-14 | WATCHING. Detail: topic file |
| Fix to gate stage-1 changes input shape, breaking stage-2's assumption | 1 | 2026-09-14 | WATCHING. Detail: cross-agent-lessons.md |
| Mutation-harness anchor orphaned by cosmetic reformat — exits 2 grading nothing | 4 | 2026-09-18 | PROMOTED → test-writer.md § Mutation-check. Post-promotion recurrence ×2. |
| Agent terminal message self-referential with no prior report body delivered | 9 | 2026-09-16 | PROMOTED → § Delegation Protocol. RESOLVED-WATCH 2026-09-16 (10 clean dispatches). Topic file. |
| Orchestrator excludes a known-drift-prone rule-mirror from a sweep on an unverified claim | 1 | 2026-09-15 | WATCHING — false "has Read access" claim. Topic file. |
| Single-line grep false-negative on text present but line-wrapped mid-phrase | 2 | 2026-09-20 | RULE CANDIDATE (2). YAML block scalar (2026-09-15) + prose mid-phrase wrap (2026-09-20, docs/schedule-cr-local-retirement). Topic file. |
| Documented suppression/exemption cannot self-expire (diff-scanner can't count its retiring condition) | 1 | 2026-09-15 | WATCHING (#1282 deferred). Detail: cross-agent-lessons.md |
| semantic-reviewer bounds out a §10 cl.2 violation as "refinement" — CR-local catches it same round | 1 | 2026-09-15 | WATCHING — classification-boundary gap. Detail: cross-agent-lessons.md |
| Reviewer proposes max-scope remedy; split reveals a cheap in-scope mitigation the reviewer missed | 1 | 2026-09-15 | WATCHING — 6753ad76 CR-local round 3. Topic file. |
| Reviewer reinterprets a false claim into a nearby true one — reports clean | 2 | 2026-09-15 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Mirror closing sentence cross-references consequence rather than stating inline | 1 | 2026-09-15 | WATCHING — efe89098 SUGGESTION. Log and watch. |
| doc-updater makes assertions without pasting verification command | 6 | 2026-09-18 | RULE CANDIDATE (6). Topic file. |
| Command shipped per §10 cl.2 but accompanied by prose overclaiming its scope | 1 | 2026-09-15 | WATCHING — distinct from rows 62/83. Detail: cross-agent-lessons.md |
| Live count in a dispatch prompt/repo grep goes stale mid-cycle from a sibling agent's parallel write | 2 | 2026-09-16 | WATCHING (2) — accepted async-dispatch limitation. Detail: cross-agent-lessons.md |
| `check-retracted-phrase.mjs` trigger gap — pure deletion bypasses hook even when survivor exists | 1 | 2026-09-15 | WATCHING — `21a33700`. Topic file. |
| Config field silently disables entire config when maxLength exceeded — no diagnostic | 1 | 2026-09-15 | WATCHING — `b0ea0d58`. Topic file. |
| Trailing tag comment on a SHA-pinned GH Action doesn't match the resolved commit | 3 | 2026-09-16 | RULE CANDIDATE (3). Topic file. |
| Pin's tag comment correct at authorship, drifts false when upstream tag is repointed later | 1 | 2026-09-16 | WATCHING — needs re-run/scheduled check. Topic file. |
| `vi.mock` targets an exact specifier; a migrated import path leaves it silently inert | 1 | 2026-09-16 | WATCHING — `ac213f98` Sentry move, proved by mutation. Detail: cross-agent-lessons. |
| `pnpm.overrides` pin forces a package below a DIFFERENT dependent's declared range, unnoticed | 1 | 2026-09-16 | WATCHING — `ac213f98` undici/jsdom, SKIPPED (harmless). Detail: cross-agent-lessons. |
| `json.dumps` round-trip reformats tracked JSON file, masking real changes in noise | 3 | 2026-09-18 | RULE CANDIDATE (3) → agent-test-writer.md NEVER + dispatch CONSTRAINTS. |
| False universal quantifier in new comment ("unlike every other case") falsified by sibling cases | 1 | 2026-09-16 | WATCHING — `fa43f72c`. Log and watch. |
| Reviewer miscounts function length by including JSDoc in the body line count | 2 | 2026-09-19 | RULE CANDIDATE (2) → agent-code-reviewer.md: count body only, from first statement to closing `}`. |
| Adding tests to mutation harness invalidates pre-existing exact-set `expectRed` specs | 14 | 2026-09-19 | RULE CANDIDATE (14). Run FULL harness; check all expectRed sets on every test addition. Detail: cross-agent-lessons.md |
| `expectRed` member reddens via an earlier unrelated assertion — named mechanism never reached | 3 | 2026-09-18 | WATCHING. Test goes red via earlier assertion; mechanism never reached. NOT row 97 (overclaim in SET not comment). |
| run-mutations.mjs grades committed HEAD, not the worktree | 1 | 2026-09-18 | WATCHING. Commit before running; stale worktree gives wrong verdict. |
| doc-updater miscounts its own pasted command output (correct artifact, wrong tally) | 1 | 2026-09-16 | WATCHING — distinct from row 109 (no-artifact variant). |
| git flags/options placed AFTER `--`, treated as pathspecs — git narrows silently, wrong conclusion drawn | 2 | 2026-09-16 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Prose claims exclusion prevents fail-open when exclusion IS the fail-open | 1 | 2026-09-16 | WATCHING — f431ea74: insights.md audit excluded .claude/hooks/, claiming this... |
| Doc summary/footer recapitulates content already present inline | 1 | 2026-09-16 | WATCHING — f431ea74: decisions.md footer recapitulated Decisions 71-65 below their own bodies. |
| CR reviewer contradicts its own prior-round verdict on the same finding | 1 | 2026-09-16 | WATCHING — f431ea74: CR pass 1 called two markers "real waivers", pass 2 call... |
| `git show <merge>` combined diff silently omits paths matching a parent | 2 | 2026-09-19 | RULE CANDIDATE (2) — use `--diff-merges=first-parent`. rule text exists; enforcement gap. |
| Taskless/draft spec carries stale rule-restatement — mirror table "ACTIVE specs only" unclear | 1 | 2026-09-17 | WATCHING — active vs draft boundary unspecified. Log and watch. |
| Test fixture for compound AND-check vacuous about one conjunct — other half undetectable | 1 | 2026-09-17 | WATCHING — test-writer caught it. Log and watch. |
| `--coverage` gap denominator rises when a new test carries its own MUTATION: comment | 1 | 2026-09-18 | WATCHING — `chore/encode-retracted-phrase-claims`. Detail: topic file |
| Orchestrator propagates a numeric claim from an agent's review report into a committed artifact without re-deriving | 2 | 2026-09-18 | RULE CANDIDATE (2). Detail: topic file |
| `grep -cF` under this shell's ugrep wrapper misparses a multi-line pattern (newline read as OR) | 1 | 2026-09-18 | WATCHING — env tooling trap, use python3 str.count. Detail: topic file |
| Compound shell command's exit code is its LAST stage's — a trailing `grep -c` on zero matches masks a passing run as failed | 1 | 2026-09-18 | WATCHING — env tooling trap. Detail: topic file |
| Marker continuation line ending in comma swallows next unrelated parser token as ids | 1 | 2026-09-18 | WATCHING — chore/validate-mutation-group-refs. Log and watch. |
| New helper ships the exact defect class it was written to fix — first caller catches what 15 synthetic tests missed | 1 | 2026-09-18 | WATCHING — `assertUsable` read `r.error` before `r.status`. Log and watch. |
| Wall-clock timer as non-vacuity guard — flake-prone on CI | 1 | 2026-09-18 | WATCHING — fixed with `vi.useFakeTimers`. Log and watch. |
| Orchestrator derives red-team trigger from semantic intent instead of mechanical glob of changed paths | 1 | 2026-09-18 | WATCHING — lapse, not a rule gap. Log and watch. |
| Plan Validation skips required `wc -l` growth check — over-cap baselined files re-crossed at pre-commit | 2 | 2026-09-19 | RULE CANDIDATE (2). Rule exists in §1; being skipped. Needs plan-critic/impl-critic checklist entry. |
| Canonical rule file stale behind its own mirror (rule text ≠ pipeline.json encoding) | 2 | 2026-09-19 | RULE CANDIDATE (2) — propose: validate trigger-condition text against pipeline.json. |
| Spy/mock assertion vacuous about content — `.toHaveBeenCalled()` without argument check | 1 | 2026-09-19 | WATCHING — fix/redteam-seed-atomicity, CR-local. |
| Orchestrator reads only first page of flat PR comments endpoint, reports partial count, pushes on it | 1 | 2026-09-19 | WATCHING. Count reconciled 2→1: the branch run scored the PR #1315 event twice — once directly, once via `feedback-read-every-review-thread`, whose `originSessionId` is that same session. One event. Promote on the next DISTINCT branch. Target when promoted: agent-workflow.md. |
| Orchestrator/plan-critic reasons to a specific DB error code without executing — local-grant drift invalidates the reasoning | 1 | 2026-09-19 | WATCHING — 42501 reasoned; P0001 actual (RAISE); fix-local-grants.sql re-gran... |
| semantic-reviewer reports wrong file count in review header (checked 3 on 9-file diff, 5 on 10-file diff) | 2 | 2026-09-19 | RULE CANDIDATE (2, rounds 1+3 same branch). Agent must derive via `git diff --name-only ... \| wc -l`, not from reading. |
| RULE 0 prose in spec tasks.md entry caught by CR-local | 1 | 2026-09-19 | WATCHING — parallelisation entry trimmed to its derivations. Log and watch. |
| Orchestrator misses a plan-stated doc edit during execution | 1 | 2026-09-19 | WATCHING — doc-updater caught Usage block omission that was explicitly in the approved plan. Log and watch. |
| Cited SHA resolves locally but is a loose object — invisible on fresh clone / after gc | 1 | 2026-09-19 | WATCHING — `33c8ff79` (docs/parked-and-next-work) passed `git rev-parse --verify` locally; not reachable from any ref. |
| Scope excluded by output-text filter (`grep -v`) not by path, silently drops lines quoting the excluded string | 3 | 2026-09-20 | RULE CANDIDATE (3) — twice by orchestrator, once by reviewer self-catching. Exclusion must be a `':(exclude)<path>'` pathspec, not `\| grep -v <string>`. |
| Reviewer validates a PAST finding against a LATER commit state, calls it false positive | 1 | 2026-09-20 | WATCHING — docs/schedule-cr-local-retirement: 3 real findings dismissed as FP by reading post-fix HEAD. Finding-validation table already requires naming the commit state; gap is enforcement. |
| `check-retracted-phrase.mjs` tokeniser matches numbers and filenames only — phrase-blind beyond those tokens | 1 | 2026-09-20 | WATCHING — distinct from row 112 (deletion-bypass). Phrases without numbers or filenames pass unchecked. Log and watch. |

## Durable knowledge (cross-agent)

Bullets removed 2026-09-16 are relocated verbatim in `topics/cross-agent-lessons.md`.

- Promotion threshold = **2 distinct mechanisms**, different commits. Sweep-On-Rule-Promotion.
- Biggest recurring defect: partial fix to a sibling-file group. Topic file.
- Compaction history: 2026-09-01/02/13/15/16 batches → archive/topic file.
- WHY-clause falsity: explanatory sentences are less-verified than facts (row 60). Check WHY clauses first on doc-only commits.
- SWEEP COMPLETENESS: "audited, all accurate" is unfalsifiable (§10 cl.5) — paste the enforcer's output. Row 44.
- File-deletion-falsifies-mirror (2026-09-17): deleting a .sh hook leaves the mirror-sync table claiming it fires. Log and watch.
- POSITIVE (fix/db-integration-fixture-isolation, 2026-09-18): round 2 clean. Rows 118/41/82++. New WATCHING: Plan Validation wc-l skip.
- test/non-vacuous-integration-negatives (2026-09-19): ceiling. Rows 140/22/41++.
- POSITIVE (fix/redteam-seed-atomicity, 2026-09-19): round 2 clean. Row 143 → 2 RULE CANDIDATE. Rows 141-144 new WATCHING.
- feat/corpus-b3-encode-retracted-phrase (2026-09-19): round 3 clean. Row 82 → 8. Row 145 → 2 RULE CANDIDATE. Row 121 → 14.
- feat/corpus-update-expected (2026-09-19): round 3 clean. Row 82 → 10 PROMOTED §7. Row 120 → 2. Row 41 → 68 (2 fresh §10 in correction context). Row 40 → 5. New WATCHING: orchestrator misses plan-stated doc edit.
- docs/parked-and-next-work (2026-09-19): round 3 clean (ceiling hit, round 3 had 0 findings). Row 41 → 71 (3 fresh §10 in correction context; Decision 76 refutes mechanical enforcer: 50% FP rate). Row 129 → 2 RULE CANDIDATE. Row 141 → 2 RULE CANDIDATE. New WATCHING: loose-SHA citation (row 149).
- docs/schedule-cr-local-retirement (2026-09-20): post-split pass 3 clean. Row 41 → 76 → PROMOTED §10 cl.8 (rule existed; propose SATURATED state in agent-memory.md). Row 82 → 12. Row 103 → 2 RULE CANDIDATE. Rows 150-152 new WATCHING. [GOOD]-gate mitigation (dispatch prompt requiring anchor non-match scope) reduced round-3 false positives from 2 to 0. FINDING: 172 RULE CANDIDATE rows confirmed in tracker-archive.md — far above the ~55 rough estimate; each is a pattern at promotion bar buried in the archive.
- Remaining bullets: topics/cross-agent-lessons.md (search "Durable-knowledge bullets relocated").

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
