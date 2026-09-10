# Learner Agent Memory

> Cross-agent pattern synthesis + FP tracking. Update IN PLACE — no dated logs; history in git. Terminal rows → tracker-archive.md.

## Issue Frequency Tracker (active rows; terminal-state → tracker-archive.md)

Schema: Issue Type | Count | Last Seen | Status. Count=1: row# in status, narrative there.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Query missing student_id scope | 2 | 2026-03-15 | RULE CANDIDATE (2) → security.md (on 3rd) |
| Error path in existing function untested (count-error branch) | 8 | 2026-08-11 | RULE CANDIDATE (8). |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (deferred). |
| Red-team spec-count prose drift across multiple doc surfaces | 7 | 2026-07-03 | RESOLVED — rule DROPPED 2026-08-19 (#1222); doc-updater no longer chases stale counts |
| plpgsql body contains deferred-validation SQL (clean apply ≠ execution correctness) | 5 | 2026-08-24 | RULE CANDIDATE (5). |
| Integration-test count in plan.md goes stale on each test-adding commit | 7 | 2026-08-16 | RULE CANDIDATE (7). |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (2) (row 625) |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE. |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 3 | 2026-06-24 | RULE CANDIDATE (3). |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE. |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE (row 626) |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE (row 627) |
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 6 | 2026-09-01 | RULE CANDIDATE (6) — also on inline it()/test() bodies, not just named helpers. Clause needs broadening before promotion. |
| `vi.spyOn` spy restore hygiene gap (spy leaks across tests on assertion failure) | 2 | 2026-06-20 | RULE CANDIDATE. |
| CLAUDE.md QA-pipeline section drifts when lefthook.yml changes | 2 | 2026-06-20 | RULE CANDIDATE. |
| Test-file split drops a test-branch guard or condition during the move | 2 | 2026-06-23 | RULE CANDIDATE. |
| Conventional-commit subject/scope hook failures (uppercase subject start, compound scope/type) | 2 | 2026-06-24 | RULE CANDIDATE (row 628) |
| docs/database.md "Last updated" footer changelog entry stale when database.md content changes | 2 | 2026-06-26 | RULE CANDIDATE (row 629) |
| Rename/move leaves stale string references in source/test file inline comments | 2 | 2026-07-02 | RULE CANDIDATE. |
| Missing route entry in docs/plan.md route-structure tree after new route added | 2 | 2026-07-08 | RULE CANDIDATE (row 630) |
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol (row 495) |
| Regression test can't detect fix's own reversion (passes | 4 | 2026-08-19 | RULE CANDIDATE (4) (row 598) |
| Reviewer asserts code/test element absent or unreachable | 2 | 2026-08-16 | RULE CANDIDATE (2) → 2 agent DOs (row 514) |
| Behavior-first test-title rename overclaims a stronger | 3 | 2026-08-09 | RULE CANDIDATE (3) → code-style.md §7 (row 517) |
| Claim-correction commit updates a count but leaves its | 9 | 2026-09-10 | RULE CANDIDATE (9) — 5TH BRANCH `feat/codify-file-size-limits`: a §10 cl.3 sweep fixed a retracted claim in `tasks.md`, missed the byte-identical claim in `design.md` one file over — first NON-numeric instance (prose claim, not a count); broadens row 519 beyond counts. Propose §10 (row 519, detail: cross-agent-lessons.md) |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't | 3 | 2026-08-19 | RULE CANDIDATE (3) (row 599) |
| check-test-title-leakage.mjs misses bare snake_case token | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note (row 526) |
| Status/error-posture change leaves a sibling spec | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation (row 531) |
| Post-commit gates miss new site violating a promoted §7 | 2 | 2026-08-19 | RULE CANDIDATE (2) (row 600) |
| Proposed verification command silently verifies nothing | 5 | 2026-09-09 | RULE CANDIDATE (5) (row 602) — 5th: `fa52e34f` BLOCKING, unbound placeholder in `.claude/limits.json`. Detail: cross-agent-lessons.md |
| Plan prose states unverified content-item count that | 3 | 2026-09-08 | RULE CANDIDATE (3) → §10 cl.2 addendum (counts are enumerations in disguise). Surface extends beyond plan.md (row 547) |
| Fix commit correcting §10 violations introduces fresh §10 | 37 | 2026-09-10 | RULE CANDIDATE (37, per-branch). 7TH BRANCH `feat/codify-file-size-limits` +4: code-reviewer's wrong `latest=` citation (frozen dir + wrong migration + shipped-as-pending); impl-critic's retired-numbering clause; impl-critic's migration-function-count + stale-task-body pair (combined, same round); semantic-reviewer's 3-false-claims-in-one-pass (combined, same pass). Checkable subset ID'd. Detail: cross-agent-lessons.md |
| Rules-file bullet closes an enumeration of a structurally OPEN set — falsified on each new discovery | 10 | 2026-09-10 | RULE CANDIDATE (10) — text exists (§10 cl.2). +1: `requirements.md` "seven surfaces" over a five-surface table (CR-local, `feat/codify-file-size-limits`); verdict DELETED the count rather than restating it, per cl.2. Chain in topic file |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 2 | 2026-09-01 | RULE CANDIDATE (2) → agent-learner.md needs a re-derivable RECORD, not prose (row 688, topic file) |
| Mutation-check executed but doesn't falsify the claim — unisolated or untargeted mutation | 4 | 2026-09-09 | RULE CANDIDATE (4), overdue — write test-writer.md addendum. Draft: cross-agent-lessons.md |
| Verification/gate check accepts category-membership or substring match, not exact identity — SWAP passes clean | 3 | 2026-09-08 | RULE CANDIDATE (3) — write worked example, code-style.md §7. Detail: cross-agent-lessons.md |
| Schema/spec validator has no closed key set — unreferenced/contradictory extra keys pass silently | 2 | 2026-09-07 | RULE CANDIDATE (2) → code-style.md §5 "Closed-Key Validation". Draft in topic file |
| Orchestrator encodes its own unresolved proposal into a durable data file as settled fact | 1 | 2026-09-07 | WATCHING — related to row 74 but a data-file value. `chore/pipeline-spec-as-data`. First occurrence; log and watch (topic file) |
| Delimiter-scan parser matches first occurrence anywhere, not the paired/anchored one | 1 | 2026-09-07 | WATCHING — `chore/pipeline-spec-as-data`, `dc9789f9`: `frontmatter()` swallowed ~190 lines after its closer was deleted. First occurrence; log and watch |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE (2) (row 605) |
| Inline comment enumerating sibling files/call-sites by | 2 | 2026-08-17 | RULE CANDIDATE (2) (row 606) |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE (2) (row 608) |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) (row 609) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) (row 610) |
| Prose asserts an issue is closed/resolved without `gh issue view` | 4 | 2026-08-19 | RULE CANDIDATE (4) (row 611) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) (row 632) |
| Self-invalidating relative reference in durable rules/doc file | 3 | 2026-08-19 | RULE CANDIDATE (3) (row 612) |
| Verification gate's pass condition is empty result — fails open on malformed input | 5 | 2026-09-09 | RULE CANDIDATE (5), THRESHOLD-CLEARED — 4th+5th: `chore/file-size-codification` symlink+chmod. Detail: cross-agent-lessons.md (row 613) |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 4 | 2026-09-08 | RULE CANDIDATE (4) — text present (agent-workflow.md:719); enforcement gap. Detail: topic file (row 637) |
| Correct advice with invented rationale (correct conclusion shields false WHY) | 4 | 2026-09-07 | RULE CANDIDATE (4) — 3rd is CR itself; 4th is `93df2283` doc-updater. Propose: agent-critic.md verifies stated mechanism independently (row 638, topic file) |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) (row 639) |
| Derivation query replacing an open-set enumeration is unverified before publish (false negative) | 2 | 2026-09-02 | RULE CANDIDATE (2) → code-style.md §10 cl.2 addendum (row 634; 2nd occurrence grep-regex, cross-agent-lessons.md) |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence (row 640) |
| Doc-updater reports 1 stale claim; whole-block read finds more | 3 | 2026-09-07 | PROMOTED — rule already in `agent-doc-updater.md` § DO. Detail: topic file (row 641) |
| Empirical measurement correct for tested scenario but excludes the failure case | 4 | 2026-09-08 | RULE CANDIDATE (4) → §10 clause 5. Detail: topic file (rows 649+650) |
| Corrected claim partially retracted — old wording persists elsewhere | 5 | 2026-09-02 | RULE CANDIDATE (5) — cross-branch, a PARAPHRASE survived §10 cl.3's own grep (text wasn't verbatim). Propose: cl.3 grep also on the claim's subject/keywords (topic file) |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) → grep by name/path too (row 653) |
| Subagent asserts a verification/write it did not perform — evidence invented, conclusion mostly true | 15 | 2026-09-10 | PROMOTED → agent-workflow.md § Finding Validation. +3, all doc-updater, `feat/codify-file-size-limits` (`48a2df66` .coderabbit.yaml mention-count 2-vs-1; `aa10d2b5` "19 specs/0 incomplete" — 7 active, 1 had 14 open, acting on it would have REVERTED a correct fix; `08a59fce` vfr-rt-training task count 1-vs-0). Naming the prior failure did NOT prevent the next 2; only a 4th dispatch requiring pasted command output produced a clean report. Detail: cross-agent-lessons.md |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 21 | 2026-09-10 | RULE CANDIDATE (21) — CLAUSE-SLOT CONFLICT: cl.6 is now taken by the SHA-citation gate (`0cbadf11`); this row's proposed text still has no clause — propose cl.8. +4 CR-local round 1 on `feat/codify-file-size-limits`: lefthook.yml ratchet comment (shrink-fails claim); decisions.md ".mjs matches no rule" (too broad — `.test.mjs` siblings ARE graded); code-reviewer.md + agent-code-reviewer.md headroom-as-unqualified-`wc -l` 2-file mirror; VFR RT spec's frozen-dir mechanical-enforcement claim. Detail: cross-agent-lessons.md |
| Coherent-but-false claim survives active same-paragraph edits across 3 same-day commits | 1 | 2026-09-02 | PROMOTED → code-style.md §10 cl.3 addendum + new cl.5 (`18757ddf`). Detail in topic file |
| check-mirror-sync.mjs cannot verify 2+ occurrences of one anchor WITHIN the same file | 1 | 2026-09-02 | WATCHING — `18757ddf` inserted 2 byte-identical clauses into one file; no mechanical check for same-file duplicate anchors. First occurrence; log and watch |
| Agent asserts a reduced-cycle exemption from a change's SHAPE, not the rule's PATH test | 3 | 2026-08-24 | RULE CANDIDATE (3) — 2 agent types (row 661) |
| Unverified superlative/rank asserted about tracker data without re-deriving | 2 | 2026-08-30 | RULE CANDIDATE (2) (row 667) |
| Mocked-Supabase test assertion vacuous about a chain-builder ARGUMENT | 2 | 2026-08-30 | RULE CANDIDATE (2) → code-style.md §7 (row 668) |
| File brought exactly to its size cap, re-crossed by a same-commit fix | 2 | 2026-08-30 | RULE CANDIDATE (2) → agent-code-reviewer.md (row 670) |
| Test title pins a silent-fallback/coercion defect as intended, inverted only when fixed | 2 | 2026-08-31 | RULE CANDIDATE (2) → code-style.md §7 (row 674) |
| Quantified claim re a live/open data source goes stale post-write (same-commit amend OR later sibling commit) | 2 | 2026-09-02 | RULE CANDIDATE (2) → §10 rule 2: pin to a commit SHA + "re-derive at pickup" (row 677) |
| CLAUDE.md docs-only exemption path list omits `.spec-workflow/specs/*/tasks.md` | 2 | 2026-09-02 | RULE CANDIDATE (2) → add `.spec-workflow/specs/**/tasks.md` to CLAUDE.md docs-only list (row 657) |
| Orchestrator drafts its own unverified "because X"/attribution claim in comment prose | 4 | 2026-09-01 | RULE CANDIDATE (4) — enforcement gap: 4th escaped impl-critic + full cycle, caught only by cloud CR post-push (row 683, topic file) |
| (8 count=1 WATCHING rows from 2026-09-02, pre-18757ddf, relocated) | — | 2026-09-02 | see tracker-archive.md "Live-table snapshot relocated 2026-09-02 (batch 4)" — grep there before re-adding a matching pattern |
| Implementation-critic outright omitted pre-commit, no stated exemption — run post-hoc, found sound | 1 | 2026-09-06 | WATCHING — distinct from row 632's INVENTED-exemption flavor. Log and watch |
| Agent's own auto-injected rules-file copy is stale mid-session | 2 | 2026-09-06 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol: subagents re-read from disk, not injected copy, when the diff touches that file. Detail in topic file |
| Verification evidence answers a different proposition than the finding's claim — real check, wrong question | 2 | 2026-09-07 | RULE CANDIDATE (2) → state the proposition before treating command+output as validation. Distinct from rows 663/638 |
| Sweep regex matches canonical form, silently skips alternative form | 1 | 2026-09-07 | WATCHING — `93df2283` footer sweep missed impl-critic.md's parenthetical chain form. Distinct from rows 637/653. Detail in topic file |
| Consistency check verifies A against B with no independent anchor — co-removing from both passes clean | 4 | 2026-09-08 | RULE CANDIDATE, text drafted not written — code-style.md §7. Detail: cross-agent-lessons.md |
| Agent's Bash-run destructive git cmd (cleaning own contamination) destroys ANOTHER agent's concurrent uncommitted work | 1 | 2026-09-08 | WATCHING — 1st materialization of the named Bash residual hole. Detail: cross-agent-lessons.md |
| Branch scope cited via unstable tracker-row IDs (line# vs archive line# vs literal `(row NNN)`) — several resolved wrong | 1 | 2026-09-08 | WATCHING — cite Issue-Type text instead if recurs. Detail: cross-agent-lessons.md |
| Rename-blind `--name-only` pathspec derives a security-path floor or exemption — a rename's other half is invisible | 2 | 2026-09-08 | PROMOTED — fixed to `--name-status -M` at all 6 sites; swept clean 2026-09-08. Detail: cross-agent-lessons.md |
| `cd` into a stale/removed worktree fails silently, write lands in the real repo — self-caught via verify-after-mutation | 1 | 2026-09-08 | WATCHING — same Bash residual hole, distinct actor/race. Detail: cross-agent-lessons.md |
| doc-updater proposal echoes an illustrative example from its OWN dispatch prompt as a literal citation | 1 | 2026-09-09 | WATCHING — `4cebe91c`: mis-cited a date matching its dispatch prompt's example, not the file. Distinct from row 68. First occurrence |
| Ratchet/baseline keyed on PATH not content — content-swap or rename escapes it | 2 | 2026-09-09 | RULE CANDIDATE (2) — `chore/file-size-codification`; same class as PROMOTED row 88, new mechanism. Detail: cross-agent-lessons.md |
| Commit-message count computed pre-edit; the SAME commit's own edits make it stale on arrival | 3 (generalizes row 690) | 2026-09-10 | PROMOTED → code-style.md §10 cl.7 (already written). 3rd instance on `feat/codify-file-size-limits`, WHILE the commit cited cl.7: 3 test counts stated, all wrong, each true when measured and stale by the time the commit landed. Enforcement-depth gap, not text — same meta-lesson as row 604. Detail: cross-agent-lessons.md |
| Hook script's git-diff filter argument doesn't cover git's R(ename) status — a rename escapes the intended filter | 1 | 2026-09-10 | WATCHING — `check-file-size-guard.mjs`'s staged-deletion lookup used `--diff-filter=D`; a staged RENAME reports `R100`, not `D`, so it was invisible. Cousin of PROMOTED row 88 (different flag: `--diff-filter` vs `--name-only`). Fixed + mutation-tested same commit (CR-local finding, `feat/codify-file-size-limits`). First occurrence of this flag; log and watch |
| Orchestrator's own SKIP-with-reason rests on a wrong stated premise, reversed by an external reviewer round | 1 | 2026-09-10 | WATCHING — big-tree fixture path (~2250 chars, macOS `PATH_MAX`); an earlier SKIP verdict's stated reason was itself wrong, reversed on CR-local's repeat finding and applied. Inverse of the usual Finding Validation direction (validating one's OWN dismissal, not a reviewer's claim). First occurrence; log and watch |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits. Schedule Sweep-On-Rule-Promotion. Tracker > rule-file parenthetical counts.
- Biggest recurring defect: **partial fix to a sibling-file group** (20) — CLAUDE.md rule followed but insufficient (row 674, topic file).
- OPEN AMBIGUITY (2026-08-25): unwritten "2nd-branch" gate applied inconsistently (519/655/604/660/91/92 — held sometimes, not others). Topic file.
- E2E spec >500L growth tracked in code-reviewer/MEMORY.md, not duplicated here (`eca41e9a`).
- Row 683: 1st post-push escape (semantic-reviewer GOOD without re-deriving). Topic file.
- Compaction history: 2026-09-01 ×2 (32 rows); 2026-09-02 batches 1-4 (55 rows → archive). Topic file.
- SWEEP PROPOSED, not run: grep rules/CLAUDE.md for un-re-derived third-party-tool claims (off `18757ddf`). Topic file.
- CORROBORATION (row 663): reminders caught 0/3 recurrences; artifact re-check caught 3/3 — Finding Validation > reminders. Topic file.
- POSITIVE: closed-enumeration→derivation ended a 7-commit chain (`12bc77f5`). Topic file.
- POSITIVE (2ad23ddf): propose-then-falsify — ONE trial, watch for a 2nd.
- semantic-reviewer MEMORY.md near 25KB cap — schedule compaction.
- POSITIVE (`chore/pipeline-spec-as-data`): checking exact suppression text beat category reasoning; derivations need a known-member check before publishing. Topic file.
- CR-local Q2 (`chore/settle-policy-contradictions`): 0/4 clean, closed at ceiling not floor+clean — extend-by-one sound, whole-diff design compounds row 42/69. Topic file.
- POSITIVE (`ee0186d9`): a stale citation found independently by 3 reviewers in one round — no missed-overlap concern.
- File-size-codification programme, next slice (2026-09-10, `feat/codify-file-size-limits`): the prior "0 net-new rows" read did NOT hold — CR-local round 1 (8 findings) + 4 full post-commit cycles produced 4 new row-604 instances, 4 new row-69 instances, 1 new cl.2 instance (43), 3 new row-663 instances (68, doc-updater), a 5th-branch row-519 instance (non-numeric), and a 3rd same-branch cl.7 recurrence (92) — WHILE the commit cited cl.7. Corrected here rather than left stale, per §10 cl.3. Full detail: topic file.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, meta-lessons, CR mirror/wording/measurement discipline, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
