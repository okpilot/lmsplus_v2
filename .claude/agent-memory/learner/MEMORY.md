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
| Claim-correction commit updates a count but leaves its | 6 | 2026-08-25 | RULE CANDIDATE (6) — cross-branch met → propose §10 (row 519) |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't | 3 | 2026-08-19 | RULE CANDIDATE (3) (row 599) |
| check-test-title-leakage.mjs misses bare snake_case token | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note (row 526) |
| Status/error-posture change leaves a sibling spec | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation (row 531) |
| Post-commit gates miss new site violating a promoted §7 | 2 | 2026-08-19 | RULE CANDIDATE (2) (row 600) |
| Proposed verification command silently verifies nothing | 4 | 2026-09-08 | RULE CANDIDATE (4) (row 602) — 4th: own mutation run no-op'd on a Python quoting error, printed clean. Detail: cross-agent-lessons.md |
| Plan prose states unverified content-item count that | 3 | 2026-09-08 | RULE CANDIDATE (3) → §10 cl.2 addendum (counts are enumerations in disguise). Surface extends beyond plan.md (row 547) |
| Fix commit correcting §10 violations introduces fresh §10 | 30 | 2026-09-08 | RULE CANDIDATE (30, unchanged — per-branch unit) — text exists (§10 cl.3), enforcement gap. Same 5th branch, 2 MORE same-branch self-corrections (24f6983d misattribution fixed by ee0186d9; c740169b's own "TODAY's date" claim fixed by 2c42c970) — 5 touches on one branch now. ESCALATE: the escalated EVIDENCE:-line gate is NOT VIABLE — measured over 300 messages it would block 84% (2766 cardinal-count hits), so the only survivable response is a token `EVIDENCE: git log` line, i.e. row 40 rebuilt as a hook. `check-commit-claims.mjs` instead gates the CHECKABLE subset (a cited SHA must resolve; 276/350 = 79% of real commit-SHA citations over 400 messages, 4 would-block, all pre-squash artifacts). Row STAYS OPEN: both recent instances (24f6983d misattribution, c740169b's "TODAY's date") are behavioural mischaracterisations the gate cannot see. Detail: cross-agent-lessons.md §Q4 |
| Rules-file bullet closes an enumeration of a structurally OPEN set — falsified on each new discovery | 8 | 2026-09-08 | RULE CANDIDATE (8) — text exists (§10 cl.2). 8th: `ee0186d9`, six files asserted "exactly TWO" accepted defer justifications, falsified by a third; named not counted in the fix. Chain in topic file |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 2 | 2026-09-01 | RULE CANDIDATE (2) → agent-learner.md needs a re-derivable RECORD, not prose (row 688, topic file) |
| Mutation-check executed but doesn't falsify the claim — unisolated or untargeted mutation | 2 | 2026-09-07 | RULE CANDIDATE (2) → addendum to test-writer.md § Mutation-check (design gap, not artifact-cleanliness). `chore/pipeline-spec-as-data`: `a8f92eab`, `c7686957`. Draft text + detail in topic file |
| Verification/gate check accepts category-membership or substring match, not exact identity — SWAP passes clean | 3 | 2026-09-08 | RULE CANDIDATE (3) — 3RD REACHED, write the 3rd worked example under code-style.md §7 now. 3rd: `269667d7`, `'*.{jsx}'.includes('js')`-style glob + mere-mention lint check. Detail: cross-agent-lessons.md |
| Schema/spec validator has no closed key set — unreferenced/contradictory extra keys pass silently | 2 | 2026-09-07 | RULE CANDIDATE (2) → code-style.md §5 new bullet "Closed-Key Validation" (verified not covered elsewhere). `chore/pipeline-spec-as-data`: `dc9789f9`, `a8f92eab`. Draft text in topic file |
| Orchestrator encodes its own unresolved proposal into a durable data file as settled fact | 1 | 2026-09-07 | WATCHING — related to row 74 but a data-file value, not prose. `chore/pipeline-spec-as-data`, commit unconfirmed. First occurrence; log and watch (topic file) |
| Delimiter-scan parser matches first occurrence anywhere, not the paired/anchored one | 1 | 2026-09-07 | WATCHING — `chore/pipeline-spec-as-data`, `dc9789f9`: `frontmatter()` swallowed ~190 lines after its real closer was deleted. First occurrence; log and watch |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE (2) (row 605) |
| Inline comment enumerating sibling files/call-sites by | 2 | 2026-08-17 | RULE CANDIDATE (2) (row 606) |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE (2) (row 608) |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) (row 609) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) (row 610) |
| Prose asserts an issue is closed/resolved without `gh issue view` | 4 | 2026-08-19 | RULE CANDIDATE (4) (row 611) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) (row 632) |
| Self-invalidating relative reference in durable rules/doc file | 3 | 2026-08-19 | RULE CANDIDATE (3) (row 612) |
| Verification gate's pass condition is empty result — fails open on malformed input | 3 | 2026-09-08 | RULE CANDIDATE (3), THRESHOLD-CLEARED-TWICE-OVER — 3rd: `c740169b`, inlined `$(git log -1 --format=%cI $(git merge-base ...))` printed 3 lines below prose forbidding exactly that inlining; empty substitution on merge-base failure silently defaults to HEAD's date, exits 0 (row 613) |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 4 | 2026-09-08 | RULE CANDIDATE (4) — text CONFIRMED present (agent-workflow.md:719, `.sh` mirror row); recurrence is enforcement not authoring. 4th: `2c42c970`, doc-shaped grep missed `.claude/hooks/post-commit-reminder.sh` (row 637) |
| Correct advice with invented rationale (correct conclusion shields false WHY) | 4 | 2026-09-07 | RULE CANDIDATE (4) — 3rd is CR itself (b7780606); 4th is `93df2283` doc-updater. Propose: agent-critic.md verifies stated mechanism independently (row 638, topic file) |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) (row 639) |
| Derivation query replacing an open-set enumeration is unverified before publish (false negative) | 2 | 2026-09-02 | RULE CANDIDATE (2) → code-style.md §10 cl.2 addendum (row 634; 2nd occurrence grep-regex, cross-agent-lessons.md) |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence (row 640) |
| Doc-updater reports 1 stale claim; whole-block read finds more | 3 | 2026-09-07 | PROMOTED — rule already in `agent-doc-updater.md` § DO. 3rd (`dc9789f9`, chore/pipeline-spec-as-data) is enforcement-gap, not missing-text; same-block vs elsewhere unconfirmed (row 641) |
| Empirical measurement correct for tested scenario but excludes the failure case | 3 | 2026-08-20 | RULE CANDIDATE (3) → §10 clause 5 (rows 649+650) |
| Corrected claim partially retracted — old wording persists elsewhere | 5 | 2026-09-02 | RULE CANDIDATE (5) — cross-branch, a PARAPHRASE survived §10 cl.3's own grep (text wasn't verbatim). Propose: cl.3 grep also on the claim's subject/keywords (topic file) |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) → grep by name/path too (row 653) |
| Subagent asserts a verification/write it did not perform — evidence invented, conclusion mostly true | 12 | 2026-09-08 | PROMOTED → agent-workflow.md § Finding Validation. 12th, POST-PROMOTION: test-writer claimed a since-removed scratch-worktree write as real. Detail: cross-agent-lessons.md |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 14 | 2026-09-08 | RULE CANDIDATE (14) (row 655) — text still UNWRITTEN in §10. Next step: new §10 cl.6 (cross-section/mirror/arithmetic check). Detail: cross-agent-lessons.md §Q4 |
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
| Implementation-critic outright omitted pre-commit, no stated exemption — run post-hoc, found sound | 1 | 2026-09-06 | WATCHING — `c95d1cb1` committed without implementation-critic, no rationalization (distinct from row 632's INVENTED-exemption flavor). First occurrence; log and watch |
| Agent's own auto-injected rules-file copy is stale mid-session | 2 | 2026-09-06 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol: subagents re-read from disk, not injected copy, when the diff touches that file. Detail in topic file |
| Verification evidence answers a different proposition than the finding's claim — real check, wrong question | 2 | 2026-09-07 | RULE CANDIDATE (2) → state the proposition before treating command+output as validation. Distinct from rows 663/638 |
| Sweep regex matches canonical form, silently skips alternative form | 1 | 2026-09-07 | WATCHING — `93df2283` footer sweep missed impl-critic.md's parenthetical chain form. Distinct from rows 637/653. Detail in topic file |
| Consistency check verifies A against B with no independent anchor — co-removing from both passes clean | 4 | 2026-09-08 | RULE CANDIDATE, rule TEXT drafted NOT yet written — code-style.md §7, verify with grep before marking PROMOTED. 4th: `8867ccea`, co-editing both `git ls-files` calls together still passes. Detail: cross-agent-lessons.md |
| Agent's Bash-run destructive git cmd (cleaning own contamination) destroys ANOTHER agent's concurrent uncommitted work | 1 | 2026-09-08 | WATCHING — 1st materialization of the named Bash residual hole. Detail: cross-agent-lessons.md |
| Branch scope cited via unstable tracker-row IDs (line# vs archive line# vs literal `(row NNN)`) — several resolved wrong | 1 | 2026-09-08 | WATCHING — cite Issue-Type text instead if recurs. Detail: cross-agent-lessons.md |
| Rename-blind `--name-only` pathspec derives a security-path floor or path-based exemption — a rename's other half is invisible | 2 | 2026-09-08 | PROMOTED — `24f6983d` (agent-memory exemption), `ee0186d9` (security-path floor, 4 sites). Fixed to `--name-status -M` at all 6 sites; swept clean 2026-09-08 (`git grep -n -- '--name-only'` zero unguarded hits). Detail: cross-agent-lessons.md |
| `cd` into a stale/removed worktree fails silently, write lands in the real repo — self-caught via verify-after-mutation | 1 | 2026-09-08 | WATCHING — distinct from the `git checkout HEAD` concurrent-work-destruction row (different command/actor, no race). Same named Bash residual hole. Detail: cross-agent-lessons.md |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits. Schedule Sweep-On-Rule-Promotion. Tracker > rule-file parenthetical counts.
- Biggest recurring defect: **partial fix to a sibling-file group** (20) — grep siblings before committing; already-promoted CLAUDE.md rule is followed but not sufficing (row 674, topic file).
- OPEN AMBIGUITY (2026-08-25): unwritten "2nd-branch" gate applied inconsistently (519/655/604 held it, 660 didn't).
- E2E spec >500L growth tracked in code-reviewer/MEMORY.md (RULE CANDIDATE 2) — no duplicate row here; `eca41e9a` (546L, 3rd growth) is the same tracked instance there.
- Row 683: 1st post-push escape (semantic-reviewer rated GOOD without re-deriving the claim) — not a text gap, an enforcement one. Detail in topic file.
- Compaction history (detail in cross-agent-lessons.md): 2026-09-01 ×2 (32 rows); 2026-09-02 batches 1-4 (55 count=1 WATCHING rows → tracker-archive.md).
- SWEEP PROPOSED, not run (off `18757ddf`'s §10 cl.3/5 promotion): grep rules/CLAUDE.md prose for un-re-derived third-party-tool-internals claims. Orchestrator to scope/run. Detail in topic file.
- CORROBORATION (row 663): dispatch-prompt reminders caught 0/3 recurrences; orchestrator artifact re-check caught 3/3 — confirms Finding Validation over reminder injection. Detail in topic file.
- POSITIVE (`12bc77f5`, 2026-09-06): closed-enumeration→derivation STRUCTURALLY ended a 7-commit chain. Detail in topic file.
- POSITIVE (2ad23ddf cycle, 2026-09-07): propose-then-falsify (state proposition before running command) — both passes verified the right thing. ONE trial; watch for second before treating as reliable.
- semantic-reviewer MEMORY.md approaching 25 KB cap. Orchestrator should schedule compaction before next content-heavy branch.
- Q4 (`chore/pipeline-spec-as-data`): both semantic-reviewer CRITICALs were mechanism bugs, not prose — "defects land in prose" reading is near-tautological for a spec-only branch. Detail in topic file.
- POSITIVE (`chore/pipeline-spec-as-data`): §10 cl.2 caught KNOWN_GIT_HOOKS closed-enumeration pre-commit; checking exact suppression text (named extensions) beat reasoning about "test file" category. Derivations must be verified against a known member before publishing.
- NEAR MISS (`chore/pipeline-spec-as-data`): orchestrator derivation (`grep -rln 'proxy.ts'`) was accidentally correct — caught by cross-checking a different set member.
- CR-local Q2 (`chore/settle-policy-contradictions`, CR-local rounds 1-4): 0/4 rounds clean; loop closed at the 4-fixup ceiling, not the floor+clean-round condition. Verdict: extend-by-one arithmetic is sound; the symptom is CR-local's whole-branch-diff-per-round design compounding with the already-escalated row-42/69 defect rate on a rules-self-contradiction branch. Two draft fixes (non-convergence signal extended to CR-local; ceiling-fire made an explicit user-facing escalation line) in topic file — count=1 under the current stop-rule mechanic, not yet promoted.
- Detection/guard regex enumerating one CLI flag spelling misses a documented alias (`--write` vs biome's `--fix`) — count=1, mechanical lesson: grep the tool's own `--help`/docs for every alias before writing a flag-detection regex, not just the spelling in the finding that prompted it.
- POSITIVE (`ee0186d9` cycle): a stale `--name-only` citation in `docs/decisions.md` was found independently by doc-updater, semantic-reviewer, AND CR-local in the same round — 3-way corroboration, no missed-overlap concern.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, meta-lessons, CR mirror/wording/measurement discipline, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
