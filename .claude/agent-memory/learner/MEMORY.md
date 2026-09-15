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
| Claim-correction commit updates a count but leaves its | 11 | 2026-09-15 | RULE CANDIDATE (11) — 6th branch, `9f217464`: "three locations, now five" vs an actual six — mixed bases. Shipped file was correct. Detail: topic file |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't | 3 | 2026-08-19 | RULE CANDIDATE (3) |
| check-test-title-leakage.mjs misses bare snake_case token | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note |
| Status/error-posture change leaves a sibling spec | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation |
| Post-commit gates miss new site violating a promoted §7 | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Proposed verification command silently verifies nothing | 7 | 2026-09-15 | RULE CANDIDATE (7). New mechanism: `check-mirror-sync.mjs '<anchor>'` errors on a multi-occurrence anchor — caught only by executing it, not reading it. Detail: cross-agent-lessons.md |
| Plan prose states unverified content-item count that | 3 | 2026-09-08 | RULE CANDIDATE (3) → §10 cl.2 addendum (counts are enumerations in disguise). Surface extends beyond plan.md |
| Fix commit correcting §10 violations introduces fresh §10 | 48 | 2026-09-15 | RULE CANDIDATE (48) — +1 (c7805f83): Decision 69 prose overclaims derivation scope; Decision 70 intra-file inconsistency + archaeology paragraph. 6th fix-commit on this branch introducing fresh violations. Detail: topic file |
| Rules-file bullet closes an enumeration of a structurally OPEN set | 11 | 2026-09-15 | RULE CANDIDATE (11) — text exists (§10 cl.2). New instance: CR-local (not any internal reviewer) caught it — `docs/decisions.md:2030` listed 6 mirror locations and read as complete. Detail: topic file |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 4 | 2026-09-14 | RULE CANDIDATE (4) — sweep must paste the enforcer's output, not re-read prose. Detail: cross-agent-lessons.md |
| Mutation-check executed but doesn't falsify the claim — unisolated or untargeted mutation | 6 | 2026-09-14 | RULE CANDIDATE (6). Detail: cross-agent-lessons.md |
| Verification/gate check accepts category-membership or substring match, not exact identity — SWAP passes clean | 4 | 2026-09-14 | RULE CANDIDATE (4). Detail: cross-agent-lessons.md |
| Schema/spec validator has no closed key set — extra keys pass silently | 2 | 2026-09-07 | RULE CANDIDATE (2) → code-style.md §5. Draft in topic file |
| Orchestrator encodes its own unresolved proposal into a durable data file as settled fact | 1 | 2026-09-07 | WATCHING — data-file variant of row 74. Log and watch (topic file) |
| Delimiter-scan parser matches first occurrence anywhere, not the paired/anchored one | 1 | 2026-09-07 | WATCHING — `dc9789f9`: swallowed ~190 lines after closer deleted. Log and watch |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE |
| Inline comment enumerating sibling files/call-sites by | 2 | 2026-08-17 | RULE CANDIDATE |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) |
| Prose asserts an issue is closed/resolved without `gh issue view` | 4 | 2026-08-19 | RULE CANDIDATE (4) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Self-invalidating relative reference in durable rules/doc file | 3 | 2026-08-19 | RULE CANDIDATE (3) |
| Verification gate's pass condition is empty result — fails open on malformed input | 6 | 2026-09-14 | RULE CANDIDATE (6). Detail: cross-agent-lessons.md |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 4 | 2026-09-08 | RULE CANDIDATE (4). Detail: topic file |
| Correct advice with invented rationale (correct conclusion shields false WHY) | 6 | 2026-09-14 | PROMOTED → agent-workflow.md § Finding Validation. Detail: topic file |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) |
| Derivation query replacing an open-set enumeration is unverified before publish (false negative) | 3 | 2026-09-15 | RULE CANDIDATE (3) — efe89098: derivation command hardcoded to 2 paths, missed 3rd site → code-style.md §10 cl.2 addendum. Detail: topic file |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence |
| Doc-updater reports 1 stale claim; whole-block read finds more | 3 | 2026-09-07 | PROMOTED → `agent-doc-updater.md` § DO. Detail: topic file |
| Empirical measurement correct for tested scenario but excludes the failure case | 4 | 2026-09-08 | RULE CANDIDATE (4) → §10 clause 5. Detail: topic file |
| Corrected claim partially retracted — old wording persists elsewhere | 11 | 2026-09-15 | RULE CANDIDATE (11) — +1 (16382b62): RULE 0 carve-out wider form existed in .coderabbit.yaml but not in CLAUDE.md banner or 49 agent files; impl-critic + CR-local caught it, all 50 surfaces widened. Mirror-lag direction reversed (mirror was MORE correct than canonical). Detail: topic |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) |
| Subagent asserts a verification/write it did not perform — evidence invented, conclusion mostly true | 16 | 2026-09-15 | PROMOTED → agent-workflow.md § Finding Validation. b0ea0d58: doc-updater reported "CLAUDE.md — has RULE 0 banner ✓" (false; CLAUDE.md carries the section header `## RULE 0 — NO PROSE`, not the blockquote banner). Detail: topic file |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 28 | 2026-09-15 | RULE CANDIDATE (28) — +1 (c7805f83): Decision 70 "No hook measures prose" contradicted Decision 68 (check-prose-claims.mjs is a pre-commit + CI hook over prose lines) in same file. Detail: topic file |
| Coherent-but-false claim survives active same-paragraph edits across 3 same-day commits | 1 | 2026-09-02 | PROMOTED → code-style.md §10 cl.3 addendum + new cl.5 (`18757ddf`). Detail in topic file |
| check-mirror-sync.mjs cannot verify 2+ occurrences of one anchor WITHIN the same file | 1 | 2026-09-02 | WATCHING — no check for same-file duplicate anchors. Log and watch |
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
| Verification evidence answers a different proposition than the finding's claim — real check, wrong question | 3 | 2026-09-15 | RULE CANDIDATE (3) — 16382b62: code-reviewer grep'd for phrase "deletion set" to verify spec ENUMERATES deletion targets; phrase absent, content present (tasks.md:292-299). Prior 2: doc-updater + test-writer (2026-09-07). State the proposition, then verify IT. Distinct from rows 68/60 |
| Sweep regex matches canonical form, silently skips alternative form | 1 | 2026-09-07 | WATCHING — missed a parenthetical chain form. Distinct from rows 637/653. Detail: topic file |
| Consistency check verifies A against B with no independent anchor — co-removing from both passes clean | 4 | 2026-09-08 | RULE CANDIDATE, text drafted not written — code-style.md §7. Detail: cross-agent-lessons.md |
| Agent's Bash-run destructive git cmd destroys ANOTHER agent's concurrent uncommitted work | 1 | 2026-09-08 | WATCHING — Bash residual hole. Detail: cross-agent-lessons.md |
| Branch scope cited via unstable tracker-row IDs (line# vs archive line# vs literal `(row NNN)`) — several resolved wrong | 1 | 2026-09-08 | WATCHING — cite Issue-Type text instead if recurs. Detail: cross-agent-lessons.md |
| Rename-blind `--name-only` pathspec derives a security-path floor or exemption | 2 | 2026-09-08 | PROMOTED — fixed to `--name-status -M`, swept clean. Detail: cross-agent-lessons.md |
| `cd` into a stale/removed worktree fails silently, write lands in the real repo — self-caught via verify-after-mutation | 1 | 2026-09-08 | WATCHING — same Bash residual hole, distinct actor/race. Detail: cross-agent-lessons.md |
| doc-updater proposal echoes an example from its OWN dispatch prompt as a literal citation | 4 | 2026-09-14 | RULE CANDIDATE (4). Detail: cross-agent-lessons.md |
| Ratchet/baseline keyed on PATH not content — content-swap or rename escapes it | 2 | 2026-09-09 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Commit message claims file 'already carries/has X' when X landed in the same commit | 3 | 2026-09-15 | RULE CANDIDATE (3) — semantic-reviewer's own tracker at count=3 across distinct commits (16382b62 is instance 3: "already carried the wider form" — false, it landed same commit). Promote → code-style.md §10: before writing "already carries/has Y" about a file, run `git show HEAD~1:<path>` to verify prior state. |
| Commit-message count computed pre-edit; own edits make it stale on arrival | 5 | 2026-09-15 | PROMOTED → code-style.md §10 cl.7. Recurred AFTER promotion twice: ("3 lines" vs 4); and the RULE 0 commit's pre-amend message "50 files" vs 49 — the commit introducing RULE 0 ("every sentence is a claim that can be false") carried an unverified count (cl.7 itself landed in 87dd0783). Fixed by deleting the count. Rule not yet self-enforcing. Detail: cross-agent-lessons.md |
| Hook script's git-diff filter argument doesn't cover git's R(ename) status | 1 | 2026-09-10 | WATCHING — cousin of PROMOTED row 88. Detail: topic file |
| Orchestrator's own SKIP-with-reason rests on a wrong stated premise, reversed by an external reviewer round | 1 | 2026-09-10 | WATCHING — inverse of usual Finding Validation direction. Detail: topic file |
| Regex→hand-parser rewrite of a blocking gate: fix commit's own corpus-diff claim is insufficient | 2 | 2026-09-13 | RULE CANDIDATE (2). Detail: topic |
| Concurrent agent-Bash mutation transiently modifies a tracked file; unrelated agent reports a change it didn't cause | 1 | 2026-09-13 | WATCHING — 3rd Bash-residual-hole materialization. Detail: topic file |
| MUTATION: comment overclaims which mechanisms the test pins | 6 | 2026-09-14 | RULE CANDIDATE (6). Detail: cross-agent-lessons.md |
| Tracker row written against staged/draft code state — corrected before commit lands | 1 | 2026-09-14 | WATCHING. Detail: topic file |
| Fix to gate stage-1 changes input shape, breaking stage-2's assumption | 1 | 2026-09-14 | WATCHING. Detail: cross-agent-lessons.md |
| Mutation-harness anchor orphaned by cosmetic reformat — exits 2 grading nothing | 2 | 2026-09-14 | PROMOTED → test-writer.md § Mutation-check. |
| Agent terminal message self-referential with no prior report body delivered | 7 | 2026-09-15 | PROMOTED → agent-workflow.md § Delegation Protocol. Recurred 6753ad76 (impl-critic): dispatch-line mitigation present verbatim in dispatch — still failed. Mitigation observed insufficient at least once post-promotion. Detail: cross-agent-lessons.md |
| Orchestrator excludes a known-drift-prone rule-mirror from a sweep on an unverified runtime-access claim | 1 | 2026-09-15 | WATCHING — `security-auditor.md` skipped on a false "has Read access" claim. Detail: cross-agent-lessons.md |
| Single-line grep false-negative on text present but line-wrapped inside a YAML block scalar | 1 | 2026-09-15 | WATCHING — distinct from paraphrase-blindness; text was byte-identical, just folded. Detail: cross-agent-lessons.md |
| A documented suppression/exemption cannot self-expire — the diff-scanner enforcing it has no way to count the condition (e.g. orgs) that would retire it | 1 | 2026-09-15 | WATCHING — `security-auditor.md` onboarding-gate suppression, CR-local rounds 2+3 (deduped). Partial mitigation applied 6753ad76: diff-visible trigger spends suppression on new-org-provisioning diff. Full fix (#1282) still deferred. |
| semantic-reviewer bounds out a §10 cl.2 violation as "refinement" because the prose reads smoothly — CR-local catches it on the same round the bound-out happened | 1 | 2026-09-15 | WATCHING — classification-boundary gap, not a floor defect: an enumeration-of-an-open-set IS a determinate rule violation, never wording preference. Log and watch |
| Reviewer proposes max-scope remedy; split reveals a cheap in-scope partial mitigation the reviewer missed | 1 | 2026-09-15 | WATCHING — 6753ad76 CR-local round 3: CR proposed blocking second-org provisioning (≥30 LOC, scope expansion, #1282); a 13-line diff-visible trigger existed and was not proposed. Judgment: instance 1 candidate (`e5344f7c` hedge-vs-verify) is a DIFFERENT mechanism (verify the claim, not just fix its granularity) absorbed under Finding Validation row 68. Log and watch. |
| Reviewer reinterprets a false claim into a nearby true one — reports clean | 1 | 2026-09-15 | WATCHING — b50353d2: semantic-reviewer defended the false .upload(-grep claim by finding a different true reading of the sentence instead of falsifying the original claim. Defeats cross-agent verification. Log and watch. |
| Mirror closing sentence cross-references consequence rather than stating inline | 1 | 2026-09-15 | WATCHING — efe89098 semantic-reviewer SUGGESTION. Critical for .coderabbit.yaml (cannot follow pointers); advisory for other mirrors. Log and watch. |
| doc-updater makes assertions without pasting verification command despite dispatch requiring pasted output | 1 | 2026-09-15 | WATCHING — b0ea0d58: no grep/command output pasted for any assertion including the false CLAUDE.md banner claim. Count=1, log and watch. |
| Command shipped per §10 cl.2 but accompanied by prose overclaiming its scope | 1 | 2026-09-15 | WATCHING — c7805f83 Decision 69: scoped grep described as "every file that mentions the bucket at all"; covers only files under the given paths. 12 files outside those paths missed. Distinct from row 62 (derivation command itself wrong) and row 83 (reviewer verifying wrong thing). |
| Repo-wide grep count not stable across a parallel review cycle — agent-memory writes skew the match set | 1 | 2026-09-15 | WATCHING — impl-critic counted 21 matched files, code-reviewer counted 20; both correct at their moment (implementation-critic/MEMORY.md matched when impl-critic ran, was rewritten before code-reviewer ran). Not an error; a known limitation. |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits. Schedule Sweep-On-Rule-Promotion.
- Biggest recurring defect: **partial fix to a sibling-file group** — CLAUDE.md rule followed but insufficient. Topic file.
- OPEN AMBIGUITY: unwritten "2nd-branch" gate applied inconsistently. Topic file.
- E2E spec >500L growth tracked in code-reviewer/MEMORY.md, not duplicated here (`eca41e9a`).
- Row 683: 1st post-push escape (semantic-reviewer GOOD without re-deriving). Topic file.
- Compaction history: 2026-09-01/02/13/15 batches → archive. Topic file.
- SWEEP PROPOSED, not run: grep rules/CLAUDE.md for un-re-derived third-party-tool claims. Topic file.
- CORROBORATION: reminders caught 0/3 recurrences; artifact re-check caught 3/3. Topic file.
- POSITIVE: closed-enumeration→derivation ended a 7-commit chain (`12bc77f5`). Topic file.
- POSITIVE (2ad23ddf): propose-then-falsify — ONE trial, watch for a 2nd.
- semantic-reviewer MEMORY.md near 25KB cap — schedule compaction.
- CR-local Q2: 0/4 clean, closed at ceiling not floor+clean — compounds row 42/69. Topic file.
- "0 net-new rows" never holds — every slice produces new row-42/69 instances. Detail: topic file.
- RESOLVED (row-90): naming insufficient; artifact-check in agent DEFINITION is the fix.
- POSITIVE (`feat/retracted-phrase-guard`): highest-value finding came from EXECUTING boundary cases, not inferring. Topic file.
- CR-local uniquely catches CI-environment defects — internal agents can't see CI's actual HEAD ref. Topic file.
- SWEEP COMPLETENESS: "Audited and found ALL accurate" is unfalsifiable — §10 cl.5. Must paste the enforcer's output when one exists. See row 44.
- POSITIVE (`feat/mutation-harness`): mutation harness caught 6 false MUTATION: claims in its own tests while being written, 90/90 caught when claims are correct. "Run the new tool first on its own source" is the cheapest possible sweep.
- POSITIVE (`9b06fa56`, terminal-message rule): first post-promotion cycle was clean. FALSIFIED 2026-09-15 on `6753ad76` impl-critic — dispatch-line present verbatim, agent still dropped the report. Dispatch-line mitigation insufficient at least once. Topic file.
- `docs/recover-question-images-decision`: rows 40/42/62/66/69/92 + reinterpret-row all fired. Rows 42 (now 48) + 69 (now 28) incremented again on c7805f83 fixup: Decision 69 prose overclaims derivation scope, Decision 70 intra-file inconsistency. 5 consecutive false claims in one paragraph (database.md bucket section), every one in a WHY clause.
- POSITIVE (c7805f83 impl-critic): caught "blocks only" overclaim in claim-accuracy fix draft before commit. agent-critic.md's "highest-risk site" note confirmed sufficient — no new rule promotion needed (already placed correctly in agent-critic.md + §10 cl.5 covers it).
- WHY-clause falsity: explanatory sentences (the reason a fact is true) are less likely to be verified than the fact itself. All 5 bucket-paragraph false claims were in WHY positions. Row 60 (PROMOTED) governs; this is WHERE to look first when verifying doc-only commits.
- POSITIVE (16382b62): doc-updater pasted commands+output for ALL counts — row 68 ("subagent asserts verification it did not perform") did NOT recur. Pasted-artifact requirement worked; dispatch-line reminder alone had not.
- POSITIVE (6753ad76): all four core post-commit agents CLEAN on a security-path suppression edit. CR-local ran M=3 rounds (security-path floor), round 3 applied a cheap fix, round 4 (ceiling) returned 2 trivial PROCESS findings and zero apply-worthy code edits. NB: this bullet originally asserted round 4 was clean BEFORE round 4 had run — corrected after execution.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
