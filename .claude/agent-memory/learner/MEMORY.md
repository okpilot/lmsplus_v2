# Learner Agent Memory

> Cross-agent pattern synthesis + FP tracking. Update IN PLACE. Terminal rows → tracker-archive.md.

## Issue Frequency Tracker (active rows; terminal-state → tracker-archive.md)

Schema: Issue Type | Count | Last Seen | Status. Count=1: narrative in topic file.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Query missing student_id scope | 2 | 2026-03-15 | RULE CANDIDATE (2) → security.md (on 3rd) |
| Error path in existing function untested (count-error branch) | 8 | 2026-08-11 | RULE CANDIDATE (8). |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (deferred). |
| Red-team spec-count prose drift across multiple doc surfaces | 7 | 2026-07-03 | RESOLVED — rule DROPPED 2026-08-19 (#1222); doc-updater no longer chases stale counts |
| plpgsql body contains deferred-validation SQL (clean apply ≠ execution correctness) | 5 | 2026-08-24 | RULE CANDIDATE (5). |
| Integration-test count in plan.md goes stale on each test-adding commit | 7 | 2026-08-16 | RULE CANDIDATE (7). |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (2) |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE. |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 3 | 2026-06-24 | RULE CANDIDATE (3). |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE. |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE |
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 6 | 2026-09-01 | RULE CANDIDATE (6) — also on inline it()/test() bodies. Needs broadening before promotion. |
| `vi.spyOn` spy restore hygiene gap (spy leaks across tests on assertion failure) | 2 | 2026-06-20 | RULE CANDIDATE. |
| CLAUDE.md QA-pipeline section drifts when lefthook.yml changes | 3 | 2026-09-14 | RULE CANDIDATE (3). |
| Test-file split drops a test-branch guard or condition during the move | 2 | 2026-06-23 | RULE CANDIDATE. |
| Conventional-commit subject/scope hook failures (uppercase subject start, compound scope/type) | 2 | 2026-06-24 | RULE CANDIDATE |
| docs/database.md "Last updated" footer changelog entry stale when database.md content changes | 2 | 2026-06-26 | RULE CANDIDATE |
| Rename/move leaves stale string references in source/test file inline comments | 2 | 2026-07-02 | RULE CANDIDATE. |
| Missing route entry in docs/plan.md route-structure tree after new route added | 2 | 2026-07-08 | RULE CANDIDATE |
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol |
| Regression test can't detect fix's own reversion (passes | 4 | 2026-08-19 | RULE CANDIDATE (4) |
| Reviewer asserts code/test element absent or unreachable | 2 | 2026-08-16 | RULE CANDIDATE (2) → 2 agent DOs |
| Behavior-first test-title rename overclaims a stronger | 3 | 2026-08-09 | RULE CANDIDATE (3) → code-style.md §7 |
| Claim-correction commit updates a count but leaves its | 10 | 2026-09-14 | RULE CANDIDATE (10) — 5th branch. Round 3: "THREE mechanisms" count fixed in 1 of 4 places. Propose §10 addendum. Detail: topic file |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't | 3 | 2026-08-19 | RULE CANDIDATE (3) |
| check-test-title-leakage.mjs misses bare snake_case token | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note |
| Status/error-posture change leaves a sibling spec | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation |
| Post-commit gates miss new site violating a promoted §7 | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Proposed verification command silently verifies nothing | 6 | 2026-09-13 | RULE CANDIDATE (6) — 6th: `b6f78ae4` `--test-timeout`, inert against a sync busy-loop. Detail: cross-agent-lessons.md |
| Plan prose states unverified content-item count that | 3 | 2026-09-08 | RULE CANDIDATE (3) → §10 cl.2 addendum (counts are enumerations in disguise). Surface extends beyond plan.md |
| Fix commit correcting §10 violations introduces fresh §10 | 41 | 2026-09-14 | RULE CANDIDATE (41). 41st: `feat/mutation-harness` — `parseTap` counted `# SKIP` as red while file header claimed SKIP was excluded. Detail: topic file |
| Rules-file bullet closes an enumeration of a structurally OPEN set — falsified on each new discovery | 10 | 2026-09-10 | RULE CANDIDATE (10) — text exists (§10 cl.2). Chain in topic file |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 4 | 2026-09-14 | RULE CANDIDATE (4) — 4th: `feat/mutation-harness` §7 MUTATION: promotion sweep claimed "ALL accurate, each multi-mechanism one verified by execution." Six false claims appeared in the next guard written by the same author. Sweep was a PROSE READ; the harness existed and was not run. Propose `agent-learner.md § Sweep On Rule Promotion` addendum: "A sweep declared complete must state the command run and paste its output; when the promoted rule has a mechanical enforcer, run it." |
| Mutation-check executed but doesn't falsify the claim — unisolated or untargeted mutation | 6 | 2026-09-14 | RULE CANDIDATE (6). 6th: `feat/mutation-harness` — test asserts the function's DEFAULT RETURN VALUE (`false`), so deleting any conditional leaves the result unchanged; comment named a regex absent for 2 rewrites. Draft: cross-agent-lessons.md |
| Verification/gate check accepts category-membership or substring match, not exact identity — SWAP passes clean | 4 | 2026-09-14 | RULE CANDIDATE (4) — 4th: `survivors()` bare substring vs `reAdded()` token-boundary; `11807` survived as `1807`. Write worked example, code-style.md §7. Detail: cross-agent-lessons.md |
| Schema/spec validator has no closed key set — unreferenced/contradictory extra keys pass silently | 2 | 2026-09-07 | RULE CANDIDATE (2) → code-style.md §5 "Closed-Key Validation". Draft in topic file |
| Orchestrator encodes its own unresolved proposal into a durable data file as settled fact | 1 | 2026-09-07 | WATCHING — related to row 74 but a data-file value. `chore/pipeline-spec-as-data`. First occurrence; log and watch (topic file) |
| Delimiter-scan parser matches first occurrence anywhere, not the paired/anchored one | 1 | 2026-09-07 | WATCHING — `chore/pipeline-spec-as-data`, `dc9789f9`: `frontmatter()` swallowed ~190 lines after its closer was deleted. First occurrence; log and watch |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE (2) |
| Inline comment enumerating sibling files/call-sites by | 2 | 2026-08-17 | RULE CANDIDATE (2) |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE (2) |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) |
| Prose asserts an issue is closed/resolved without `gh issue view` | 4 | 2026-08-19 | RULE CANDIDATE (4) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Self-invalidating relative reference in durable rules/doc file | 3 | 2026-08-19 | RULE CANDIDATE (3) |
| Verification gate's pass condition is empty result — fails open on malformed input | 6 | 2026-09-14 | RULE CANDIDATE (6). 6th: `feat/mutation-harness` — `modeRun` returned 0 with no data files present; `validateDataFile` accepted `mutations: []`. Oracle reports "all caught" having graded nothing. Detail: cross-agent-lessons.md |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 4 | 2026-09-08 | RULE CANDIDATE (4) — text present (agent-workflow.md:719); enforcement gap. Detail: topic file |
| Correct advice with invented rationale (correct conclusion shields false WHY) | 6 | 2026-09-14 | RULE CANDIDATE (6). 6th: `9f3ae111` cycle — test-writer cited timeout "already covered end-to-end by HANG entry"; HANG is a return flip because hang cannot be survived (own note says so). Cross-agent class (rows 60+68 converge). Detail: topic file |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) |
| Derivation query replacing an open-set enumeration is unverified before publish (false negative) | 2 | 2026-09-02 | RULE CANDIDATE (2) → code-style.md §10 cl.2 addendum. Detail: topic file |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence |
| Doc-updater reports 1 stale claim; whole-block read finds more | 3 | 2026-09-07 | PROMOTED — rule already in `agent-doc-updater.md` § DO. Detail: topic file |
| Empirical measurement correct for tested scenario but excludes the failure case | 4 | 2026-09-08 | RULE CANDIDATE (4) → §10 clause 5. Detail: topic file |
| Corrected claim partially retracted — old wording persists elsewhere | 7 | 2026-09-14 | RULE CANDIDATE (7) — 7th: `9f3ae111` impl-critic found "91-mutation batch" surviving in JSON `note` field one object from the corrected comment; §10 cl.3 grep was skipped. Detail: topic file |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) → grep by name/path too |
| Subagent asserts a verification/write it did not perform — evidence invented, conclusion mostly true | 15 | 2026-09-10 | PROMOTED → agent-workflow.md § Finding Validation. Pasted-output requirement worked; naming alone did not. Detail: topic file |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 22 | 2026-09-14 | RULE CANDIDATE (22) — cl.6 taken by SHA-citation gate; propose cl.8. Detail: topic file |
| Coherent-but-false claim survives active same-paragraph edits across 3 same-day commits | 1 | 2026-09-02 | PROMOTED → code-style.md §10 cl.3 addendum + new cl.5 (`18757ddf`). Detail in topic file |
| check-mirror-sync.mjs cannot verify 2+ occurrences of one anchor WITHIN the same file | 1 | 2026-09-02 | WATCHING — `18757ddf` inserted 2 byte-identical clauses into one file; no mechanical check for same-file duplicate anchors. First occurrence; log and watch |
| Agent asserts a reduced-cycle exemption from a change's SHAPE, not the rule's PATH test | 3 | 2026-08-24 | RULE CANDIDATE (3) — 2 agent types |
| Unverified superlative/rank asserted about tracker data without re-deriving | 2 | 2026-08-30 | RULE CANDIDATE (2) |
| Mocked-Supabase test assertion vacuous about a chain-builder ARGUMENT | 2 | 2026-08-30 | RULE CANDIDATE (2) → code-style.md §7 |
| File brought exactly to its size cap, re-crossed by a same-commit fix | 2 | 2026-08-30 | RULE CANDIDATE (2) → agent-code-reviewer.md |
| Test title pins a silent-fallback/coercion defect as intended, inverted only when fixed | 2 | 2026-08-31 | RULE CANDIDATE (2) → code-style.md §7 |
| Quantified claim re a live/open data source goes stale post-write (same-commit amend OR later sibling commit) | 2 | 2026-09-02 | RULE CANDIDATE (2) → §10 rule 2: pin to a commit SHA + "re-derive at pickup" |
| CLAUDE.md docs-only exemption path list omits `.spec-workflow/specs/*/tasks.md` | 2 | 2026-09-02 | RULE CANDIDATE (2) → add `.spec-workflow/specs/**/tasks.md` to CLAUDE.md docs-only list |
| Orchestrator drafts its own unverified "because X"/attribution claim in comment prose | 4 | 2026-09-01 | RULE CANDIDATE (4) — enforcement gap: escaped impl-critic + full cycle. Detail: topic file |
| (8 count=1 WATCHING rows from 2026-09-02, pre-18757ddf, relocated) | — | 2026-09-02 | see tracker-archive.md "Live-table snapshot relocated 2026-09-02 (batch 4)" — grep there before re-adding a matching pattern |
| Implementation-critic outright omitted pre-commit, no stated exemption — run post-hoc, found sound | 1 | 2026-09-06 | WATCHING — distinct from row 632's INVENTED-exemption flavor. Log and watch |
| Agent's own auto-injected rules-file copy is stale mid-session | 2 | 2026-09-06 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol: re-read from disk when diff touches that file. Detail: topic file |
| Verification evidence answers a different proposition than the finding's claim — real check, wrong question | 2 | 2026-09-07 | RULE CANDIDATE (2) — state the proposition first. Distinct from rows 68/60 |
| Sweep regex matches canonical form, silently skips alternative form | 1 | 2026-09-07 | WATCHING — missed a parenthetical chain form. Distinct from rows 637/653. Detail: topic file |
| Consistency check verifies A against B with no independent anchor — co-removing from both passes clean | 4 | 2026-09-08 | RULE CANDIDATE, text drafted not written — code-style.md §7. Detail: cross-agent-lessons.md |
| Agent's Bash-run destructive git cmd (cleaning own contamination) destroys ANOTHER agent's concurrent uncommitted work | 1 | 2026-09-08 | WATCHING — 1st materialization of the named Bash residual hole. Detail: cross-agent-lessons.md |
| Branch scope cited via unstable tracker-row IDs (line# vs archive line# vs literal `(row NNN)`) — several resolved wrong | 1 | 2026-09-08 | WATCHING — cite Issue-Type text instead if recurs. Detail: cross-agent-lessons.md |
| Rename-blind `--name-only` pathspec derives a security-path floor or exemption — a rename's other half is invisible | 2 | 2026-09-08 | PROMOTED — fixed to `--name-status -M` at all 6 sites; swept clean 2026-09-08. Detail: cross-agent-lessons.md |
| `cd` into a stale/removed worktree fails silently, write lands in the real repo — self-caught via verify-after-mutation | 1 | 2026-09-08 | WATCHING — same Bash residual hole, distinct actor/race. Detail: cross-agent-lessons.md |
| doc-updater proposal echoes an illustrative example from its OWN dispatch prompt as a literal citation | 4 | 2026-09-14 | RULE CANDIDATE (4) — 4th: `feat/mutation-harness`, doc-updater claimed `--update-expected` flag is implemented (grep returns nothing); proposed ticking spec item DONE for an unbuilt feature. Rule (pasted grep for code-body citations) was ALREADY in agent-doc-updater.md § DO and agent was not following it. Propose adding to § NEVER: "Never cite a flag, function, or method as implemented without a pasted grep result." |
| Ratchet/baseline keyed on PATH not content — content-swap or rename escapes it | 2 | 2026-09-09 | RULE CANDIDATE (2) — same class as PROMOTED row 88, new mechanism. Detail: cross-agent-lessons.md |
| Commit-message count computed pre-edit; the SAME commit's own edits make it stale on arrival | 3 (generalizes row 690) | 2026-09-10 | PROMOTED → code-style.md §10 cl.7 (written). Enforcement-depth gap, not text. Detail: cross-agent-lessons.md |
| Hook script's git-diff filter argument doesn't cover git's R(ename) status — a rename escapes the intended filter | 1 | 2026-09-10 | WATCHING — `--diff-filter=D` missed a staged RENAME (`R100`). Cousin of PROMOTED row 88. Detail: topic file |
| Orchestrator's own SKIP-with-reason rests on a wrong stated premise, reversed by an external reviewer round | 1 | 2026-09-10 | WATCHING — inverse of usual Finding Validation direction (validating own dismissal, not a reviewer's claim). Detail: topic file |
| Regex→hand-parser rewrite of a blocking gate: each fix commit's own corpus-diff claim is true and insufficient — corpus lacks the grammar shape the next bug lives in | 2 | 2026-09-13 | RULE CANDIDATE (2) — `24c2bd70`→`a170a0f8`→`b6f78ae4` chain. Propose: 1 synthesized fixture per control-flow branch, not corpus-sourced. Detail: topic file |
| Concurrent agent-Bash mutation transiently modifies a tracked file; unrelated agent reports a change it didn't cause | 1 | 2026-09-13 | WATCHING — 3rd materialization of Bash-residual-hole class (86/89), new mechanism. test-writer's scratch-copy rule isn't mirrored elsewhere. Detail: topic file |
| MUTATION: comment overclaims which mechanisms the test pins — sub-claim is unreachable; the comment is §10 prose against the test artifact | 6 | 2026-09-14 | RULE CANDIDATE (6) — `ff562c9f`/`ab310cc9`/`feat/mutation-harness`. 6th: `9f3ae111` cycle — code-reviewer §7 overclaim ("any of three throws" when fixture reaches one); test-writer found ${mutId} in two of three throws completely unpinned (throwaway 'm1' id). §7 "A MUTATION: Comment Is a Prose Claim" covers both. |
| Tracker row written against staged/draft code state — the referenced code is corrected before the commit lands, leaving the row's present-tense description false on arrival | 1 | 2026-09-14 | WATCHING — `ab310cc9` cycle 2: a tracker row quoted a test name with zero grep matches; the test had been renamed in the same branch. Mechanism distinct from §10 cl.7 (which governs counts in commit messages). Log and watch. |
| Fix to gate stage-1 changes input shape, breaking stage-2's assumption (different waiver-hole opened by its own fix) | 1 | 2026-09-14 | WATCHING — CR-local rounds 1→2: `--base` fix added merge-commit enumeration; CI HEAD is `refs/pull/N/merge` (generated message, no trailer), so every waiver became unreachable again by a different door. Distinct from partial-grep (rows 35/66): the two instances ARE the same logical fix-chain, not separate commits. Log and watch. |
| Mutation-harness anchor orphaned by cosmetic reformat — exits 2 grading nothing | 2 | 2026-09-14 | RULE CANDIDATE (2) — f26abc16 ("repoint two anchors the formatter moved") is the 2nd distinct mechanism/commit. Propose: author text anchors AFTER a format pass, not before. Target: test-writer.md § Mutation-check. |
| Agent terminal message self-referential with no prior report body delivered | 6 | 2026-09-14 | RULE CANDIDATE (6) — 5 more instances on `feat/mutation-harness` today: code-reviewer, semantic-reviewer ×2, implementation-critic, one other. Propose: add to `agent-workflow.md § Delegation Protocol` "A terminal message must be self-contained. 'As reported above' is forbidden when no report body preceded it." |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits. Schedule Sweep-On-Rule-Promotion.
- Biggest recurring defect: **partial fix to a sibling-file group** — CLAUDE.md rule followed but insufficient. Topic file.
- OPEN AMBIGUITY: unwritten "2nd-branch" gate applied inconsistently. Topic file.
- E2E spec >500L growth tracked in code-reviewer/MEMORY.md, not duplicated here (`eca41e9a`).
- Row 683: 1st post-push escape (semantic-reviewer GOOD without re-deriving). Topic file.
- Compaction history: 2026-09-01/02/13 batches → archive. Topic file.
- SWEEP PROPOSED, not run: grep rules/CLAUDE.md for un-re-derived third-party-tool claims. Topic file.
- CORROBORATION: reminders caught 0/3 recurrences; artifact re-check caught 3/3. Topic file.
- POSITIVE: closed-enumeration→derivation ended a 7-commit chain (`12bc77f5`). Topic file.
- POSITIVE (2ad23ddf): propose-then-falsify — ONE trial, watch for a 2nd.
- semantic-reviewer MEMORY.md near 25KB cap — schedule compaction.
- CR-local Q2: 0/4 clean, closed at ceiling not floor+clean — compounds row 42/69. Topic file.
- "0 net-new rows" reads never hold — every slice produces new row-42/69 instances (`feat/codify-file-size-limits`). Detail: topic file.
- RESOLVED (row-90 count=3): naming is insufficient; artifact-check in agent DEFINITION is the fix. Consistent with row-68 meta-lesson.
- POSITIVE (`feat/retracted-phrase-guard`): highest-value finding (substring fail-open in `addedText.includes(token)`) came from EXECUTION of boundary cases by semantic-reviewer. Corroborates the "execute > infer" principle. Four no-op mutation seds were themselves a false-claim class.
- CR-local uniquely catches CI-environment defects (cross-commit, real CI context) — waiver-unreachable × 2 on `feat/retracted-phrase-guard` missed by all internal agents; required knowing CI HEAD is `refs/pull/N/merge`.
- SWEEP COMPLETENESS: "Audited and found ALL accurate" is unfalsifiable prose — §10 cl.5. A sweep declared complete must state the command run and paste output. When the promoted rule has a mechanical enforcer, run it as the sweep (count=4 row 44). Propose `agent-learner.md § Sweep On Rule Promotion` addendum.
- POSITIVE (`feat/mutation-harness`): mutation harness caught 6 false MUTATION: claims in its own tests while being written, 90/90 caught when claims are correct. "Run the new tool first on its own source" is the cheapest possible sweep.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
