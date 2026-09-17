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
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 6 | 2026-09-01 | RULE CANDIDATE (6) — needs broadening. |
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
| Claim-correction commit updates a count but leaves its | 11 | 2026-09-15 | RULE CANDIDATE (11). Detail: topic file |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't | 3 | 2026-08-19 | RULE CANDIDATE (3) |
| check-test-title-leakage.mjs misses bare snake_case token | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note |
| Status/error-posture change leaves a sibling spec | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation |
| Post-commit gates miss new site violating a promoted §7 | 2 | 2026-08-19 | RULE CANDIDATE (2) |
| Proposed verification command silently verifies nothing | 7 | 2026-09-15 | RULE CANDIDATE (7). Detail: cross-agent-lessons.md |
| Plan prose states unverified content-item count that | 3 | 2026-09-08 | RULE CANDIDATE (3) → §10 cl.2 addendum. Surface extends beyond plan.md |
| Fix commit correcting §10 violations introduces fresh §10 | 57 | 2026-09-17 | RULE CANDIDATE (57). Detail: topic file |
| Rules-file bullet closes an enumeration of a structurally OPEN set | 14 | 2026-09-17 | RULE CANDIDATE (14) — text exists (§10 cl.2). Detail: topic file |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 5 | 2026-09-17 | RULE CANDIDATE (5). Topic file. |
| Mutation-check executed but doesn't falsify the claim — unisolated or untargeted mutation | 6 | 2026-09-14 | RULE CANDIDATE (6). Detail: cross-agent-lessons.md |
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
| Verification gate's pass condition is empty result — fails open on malformed input | 6 | 2026-09-14 | RULE CANDIDATE (6). Detail: cross-agent-lessons.md |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 4 | 2026-09-08 | RULE CANDIDATE (4). Detail: topic file |
| Correct advice with invented rationale (false WHY) | 10 | 2026-09-17 | PROMOTED → § Finding Validation. Post-promotion recurrence. Topic file. |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) |
| Derivation query replacing an open-set enumeration is unverified before publish | 3 | 2026-09-15 | RULE CANDIDATE (3) → §10 cl.2 addendum. Detail: topic file |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence |
| Doc-updater reports 1 stale claim; whole-block read finds more | 4 | 2026-09-16 | PROMOTED → `agent-doc-updater.md` § DO. Recurred f431ea74: missed 3 Decision-69 refs. Detail: topic file |
| Empirical measurement correct for tested scenario but excludes the failure case | 4 | 2026-09-08 | RULE CANDIDATE (4) → §10 clause 5. Detail: topic file |
| Corrected claim partially retracted — old wording persists elsewhere | 15 | 2026-09-17 | RULE CANDIDATE (15). Detail: cross-agent-lessons.md |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) |
| Subagent asserts a verification/write it did not perform | 17 | 2026-09-15 | PROMOTED → § Finding Validation. Topic file. |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 31 | 2026-09-17 | RULE CANDIDATE (31). Detail: topic file |
| Coherent-but-false claim survives active same-paragraph edits across 3 same-day commits | 1 | 2026-09-02 | PROMOTED → §10 cl.3+cl.5 (`18757ddf`). Detail: topic file |
| check-mirror-sync.mjs cannot verify 2+ occurrences of one anchor WITHIN the same file | 1 | 2026-09-02 | WATCHING. Log and watch |
| Agent asserts a reduced-cycle exemption from a change's SHAPE, not the rule's PATH test | 3 | 2026-08-24 | RULE CANDIDATE (3) — 2 agent types |
| Unverified superlative/rank asserted about tracker data without re-deriving | 2 | 2026-08-30 | RULE CANDIDATE (2) |
| Mocked-Supabase test assertion vacuous about a chain-builder ARGUMENT | 2 | 2026-08-30 | RULE CANDIDATE (2) → code-style.md §7 |
| File brought exactly to its size cap, re-crossed by a same-commit fix | 2 | 2026-08-30 | RULE CANDIDATE (2) → agent-code-reviewer.md |
| Test title pins a silent-fallback/coercion defect as intended, inverted only when fixed | 2 | 2026-08-31 | RULE CANDIDATE (2) → code-style.md §7 |
| Quantified claim re a live/open data source goes stale post-write | 2 | 2026-09-02 | RULE CANDIDATE (2) → §10: pin to a commit SHA |
| CLAUDE.md docs-only exemption path list omits `.spec-workflow/specs/*/tasks.md` | 2 | 2026-09-02 | RULE CANDIDATE (2) → add to CLAUDE.md docs-only list |
| Orchestrator drafts its own unverified "because X"/attribution claim in comment prose | 4 | 2026-09-01 | RULE CANDIDATE (4). Detail: topic file |
| (8 count=1 WATCHING rows from 2026-09-02, pre-18757ddf, relocated) | — | 2026-09-02 | see tracker-archive.md "Live-table snapshot relocated 2026-09-02 (batch 4)" |
| Implementation-critic outright omitted pre-commit, no stated exemption — run post-hoc, found sound | 1 | 2026-09-06 | WATCHING — distinct from row 632. Log and watch |
| Agent's own auto-injected rules-file copy is stale mid-session | 2 | 2026-09-06 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol. Detail: topic file |
| Verification evidence answers a different proposition — real check, wrong question | 5 | 2026-09-16 | RULE CANDIDATE (5). Topic file. |
| Sweep regex matches canonical form, silently skips alternative form | 1 | 2026-09-07 | WATCHING — distinct from rows 637/653. Detail: topic file |
| Consistency check verifies A against B with no independent anchor — co-removing both passes clean | 4 | 2026-09-08 | RULE CANDIDATE → §7, draft in topic file |
| Agent's Bash-run destructive git cmd destroys ANOTHER agent's concurrent uncommitted work | 1 | 2026-09-08 | WATCHING — Bash hole. Topic file. |
| Branch scope cited via unstable tracker-row IDs — several resolved wrong | 1 | 2026-09-08 | WATCHING — cite Issue-Type text instead. Detail: topic file |
| Rename-blind `--name-only` pathspec derives a security-path floor or exemption | 2 | 2026-09-08 | PROMOTED — fixed to `--name-status -M`. Topic file. |
| `cd` into a stale/removed worktree fails silently, write lands in the real repo | 1 | 2026-09-08 | WATCHING — Bash residual hole. Detail: topic file |
| doc-updater proposal echoes an example from its OWN dispatch prompt as a literal citation | 4 | 2026-09-14 | RULE CANDIDATE (4). Detail: cross-agent-lessons.md |
| Ratchet/baseline keyed on PATH not content — content-swap or rename escapes it | 2 | 2026-09-09 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Commit message claims file 'already carries/has X' when X landed same commit | 4 | 2026-09-16 | RULE CANDIDATE (4) → §10, verify via `git show HEAD~1:<path>` |
| Commit-message count computed pre-edit; own edits make it stale on arrival | 7 | 2026-09-17 | PROMOTED → §10 cl.7. Recurred four times post. Detail: topic file |
| Hook script's git-diff filter argument doesn't cover git's R(ename) status | 1 | 2026-09-10 | WATCHING — cousin of PROMOTED row 88. Detail: topic file |
| Orchestrator's own SKIP-with-reason rests on a wrong stated premise, reversed by an external reviewer round | 1 | 2026-09-10 | WATCHING. Detail: topic file |
| Regex→hand-parser rewrite of a blocking gate: fix commit's own corpus-diff claim is insufficient | 2 | 2026-09-13 | RULE CANDIDATE (2). Detail: topic file |
| Concurrent agent-Bash mutation transiently modifies a tracked file; unrelated agent reports it | 1 | 2026-09-13 | WATCHING — 3rd Bash-hole materialization. Topic file |
| MUTATION: comment overclaims which mechanisms the test pins | 8 | 2026-09-17 | PROMOTED → code-style.md §7 § "A `MUTATION:` Comment Is a Prose Claim". Rule text already present. Detail: cross-agent-lessons.md |
| Tracker row written against staged/draft code state — corrected before commit lands | 1 | 2026-09-14 | WATCHING. Detail: topic file |
| Fix to gate stage-1 changes input shape, breaking stage-2's assumption | 1 | 2026-09-14 | WATCHING. Detail: cross-agent-lessons.md |
| Mutation-harness anchor orphaned by cosmetic reformat — exits 2 grading nothing | 2 | 2026-09-14 | PROMOTED → test-writer.md § Mutation-check. |
| Agent terminal message self-referential with no prior report body delivered | 9 | 2026-09-16 | PROMOTED → § Delegation Protocol. RESOLVED-WATCH 2026-09-16 (10 clean dispatches). Topic file. |
| Orchestrator excludes a known-drift-prone rule-mirror from a sweep on an unverified claim | 1 | 2026-09-15 | WATCHING — false "has Read access" claim. Topic file. |
| Single-line grep false-negative on text present but line-wrapped in a YAML block scalar | 1 | 2026-09-15 | WATCHING — distinct from paraphrase-blindness. Topic file. |
| Documented suppression/exemption cannot self-expire (diff-scanner can't count its retiring condition) | 1 | 2026-09-15 | WATCHING (#1282 deferred). Detail: cross-agent-lessons.md |
| semantic-reviewer bounds out a §10 cl.2 violation as "refinement" — CR-local catches it same round | 1 | 2026-09-15 | WATCHING — classification-boundary gap. Detail: cross-agent-lessons.md |
| Reviewer proposes max-scope remedy; split reveals a cheap in-scope mitigation the reviewer missed | 1 | 2026-09-15 | WATCHING — 6753ad76 CR-local round 3. Topic file. |
| Reviewer reinterprets a false claim into a nearby true one — reports clean | 2 | 2026-09-15 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Mirror closing sentence cross-references consequence rather than stating inline | 1 | 2026-09-15 | WATCHING — efe89098 SUGGESTION. Log and watch. |
| doc-updater makes assertions without pasting verification command | 5 | 2026-09-16 | RULE CANDIDATE (5). Topic file. |
| Command shipped per §10 cl.2 but accompanied by prose overclaiming its scope | 1 | 2026-09-15 | WATCHING — distinct from rows 62/83. Detail: cross-agent-lessons.md |
| Live count in a dispatch prompt/repo grep goes stale mid-cycle from a sibling agent's parallel write | 2 | 2026-09-16 | WATCHING (2) — accepted async-dispatch limitation. Detail: cross-agent-lessons.md |
| `check-retracted-phrase.mjs` trigger gap — pure deletion bypasses hook even when survivor exists | 1 | 2026-09-15 | WATCHING — `21a33700`. Topic file. |
| Config field silently disables entire config when maxLength exceeded — no diagnostic | 1 | 2026-09-15 | WATCHING — `b0ea0d58`. Topic file. |
| Trailing tag comment on a SHA-pinned GH Action doesn't match the resolved commit | 3 | 2026-09-16 | RULE CANDIDATE (3). Topic file. |
| Pin's tag comment correct at authorship, drifts false when upstream tag is repointed later | 1 | 2026-09-16 | WATCHING — needs re-run/scheduled check. Topic file. |
| `vi.mock` targets an exact specifier; a migrated import path leaves it silently inert | 1 | 2026-09-16 | WATCHING — `ac213f98` Sentry move, proved by mutation. Detail: cross-agent-lessons.md |
| `pnpm.overrides` pin forces a package below a DIFFERENT dependent's declared range, unnoticed | 1 | 2026-09-16 | WATCHING — `ac213f98` undici/jsdom, SKIPPED (harmless). Detail: cross-agent-lessons.md |
| `json.dumps` round-trip reformats tracked JSON file, masking real changes in noise | 2 | 2026-09-16 | RULE CANDIDATE (2) → agent-test-writer.md NEVER + dispatch CONSTRAINTS. Archive row 549 (2026-08-15) + same-branch instances (test-writer + orchestrator, feat/prose-path-guard). |
| False universal quantifier in new comment ("unlike every other case") falsified by sibling cases | 1 | 2026-09-16 | WATCHING — `fa43f72c`. Log and watch. |
| impl-critic measures function length declaration-to-next-declaration, sweeping following JSDoc into count | 1 | 2026-09-16 | WATCHING — `827c363b`. Log and watch. |
| Adding tests to mutation harness invalidates pre-existing exact-set `expectRed` specs | 1 | 2026-09-16 | WATCHING — feat/prose-path-guard (two cascades same branch). Did NOT recur chore/encode-file-size-guard-claims (9 new mutations added cleanly). Log and watch. |
| doc-updater miscounts its own pasted command output (correct artifact, wrong tally) | 1 | 2026-09-16 | WATCHING — distinct from row 109 (no-artifact variant). Row-109 remedy (demand artifact) did not prevent this. feat/prose-path-guard `a4ecd165`. |
| git flags/options placed AFTER `--`, treated as pathspecs — git narrows silently, wrong conclusion drawn | 2 | 2026-09-16 | RULE CANDIDATE (2). Detail: cross-agent-lessons.md |
| Prose claims exclusion prevents fail-open when exclusion IS the fail-open | 1 | 2026-09-16 | WATCHING — f431ea74: insights.md audit excluded .claude/hooks/, claiming this prevented fail-open; exclusion was itself the fail-open. Fixed. |
| Doc summary/footer recapitulates content already present inline | 1 | 2026-09-16 | WATCHING — f431ea74: decisions.md footer recapitulated Decisions 71-65 below their own bodies. Pure duplication. Fixed. |
| CR reviewer contradicts its own prior-round verdict on the same finding | 1 | 2026-09-16 | WATCHING — f431ea74: CR pass 1 called two markers "real waivers", pass 2 called them "literals". Pass 1 was correct. CR's fix was also wrong. |
| `--diff-merges=<format>` implies `-p`; output misread as commit suppression | 1 | 2026-09-16 | WATCHING — f431ea74: prescribed without `--no-patch`; hits buried under patches, misread as suppression by impl-critic then orchestrator. Distinct from row 123. |
| Taskless/draft spec carries stale rule-restatement — mirror table "ACTIVE specs only" unclear | 1 | 2026-09-17 | WATCHING — `chore/record-mechanical-lever` round 1; spec with no tasks.md is not all-`[x]` (done); active vs draft boundary unspecified in mirror table. Log and watch. |
| Test fixture for compound AND-check vacuous about one conjunct — other half undetectable | 1 | 2026-09-17 | WATCHING — `chore/encode-file-size-guard-claims`: notEncoded fixture carried `claim`, so deleting `!isNonEmptyString(n.claim)` half stayed green (other conjuncts covered it). Test-writer caught it. Log and watch. |

## Durable knowledge (cross-agent)

Bullets removed 2026-09-16 are relocated verbatim in `topics/cross-agent-lessons.md`.

- Promotion threshold = **2 distinct mechanisms**, different commits. Sweep-On-Rule-Promotion.
- Biggest recurring defect: partial fix to a sibling-file group. Topic file.
- Compaction history: 2026-09-01/02/13/15/16 batches → archive/topic file.
- WHY-clause falsity: explanatory sentences are less-verified than facts (row 60). Check WHY clauses first on doc-only commits.
- SWEEP COMPLETENESS: "audited, all accurate" is unfalsifiable (§10 cl.5) — paste the enforcer's output. Row 44.
- POSITIVE (`feat/mutation-harness`): harness caught 6 false MUTATION claims in its own tests. Cheapest sweep = run on own source.
- CR-local uniquely catches CI-environment defects internal agents can't see. Topic file.
- "0 net-new rows" never holds — every slice produces new row-42/69 instances. Topic file.
- `dep1277` (2026-09-16): CR-local ran 3 clean rounds, missed all 3 GH-Actions pin-comment instances — `.github/` is outside every corpus-scoped hook. Coverage gap, not a CR-local defect.
- POSITIVE (`feat/prose-path-guard`): Terminal-message CONSTRAINTS fix held ~10 dispatches, no recurrence. One-round refinement cap correctly bounded a code-reviewer WARNING. Second chain position-3: commit message misattributed prior commit; fixed by amend.
- POSITIVE (`chore/pre-push-review-gate`, 2026-09-17): New per-branch gate correctly caught a pre-existing false claim on origin/master (CLAUDE.md "unit tests run only in CI") that per-commit cycles had missed. CR-local grew 12→21→35 on a shrinking diff; 63/67 findings bounded out as refinements/duplicates. Ceiling-3 stop held.
- POSITIVE (`chore/record-mechanical-lever`, 2026-09-17): Adjacent-line orphan in the rule-DEFINING file found in rounds 1+2 (`:11` then `:81` in `agent-coderabbit-local.md`); both applied. Code-reviewer grepped repo (not diff) and caught stale site in draft spec — 36th sweep hit. Count re-litigated by 3 reviewers to 3 values; resolved by shipping derivation command (§10 cl.2). Bounded-out rule absorbed CR-local re-raise of an already-applied round-1 cut; no loop extension.
- POSITIVE (`chore/encode-file-size-guard-claims`, 2026-09-17): Clean 2-round loop. 9 new encoded mutations + 3 notEncoded added without exact-set `expectRed` cascade (row 121 did not recur). Semantic-reviewer correctly caught §10 cl.8 in round 1 (fix commit introduced new false claim — "encoded entry" vs. comment). MUTATION-overclaim row 97 promoted; rule text already present in §7.
- File-deletion-falsifies-mirror (count=1, 2026-09-17): Deleting `post-commit-reminder.sh` left the Rule-Mirror Sync table claiming a .sh hook fires at commit time — false the moment the hook was gone. Caught round 1. Log and watch.
- Remaining bullets (positive signals, open ambiguities, per-branch notes): topics/cross-agent-lessons.md, search "Durable-knowledge bullets relocated".

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
