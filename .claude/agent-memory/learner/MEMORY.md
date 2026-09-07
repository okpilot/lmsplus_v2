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
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 6 | 2026-09-01 | RULE CANDIDATE (6) — also confirmed on an inline it()/test() callback body, not just named helpers (cross-agent-lessons.md). Proposed clause needs broadening before promotion. |
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
| Proposed verification command silently verifies nothing | 3 | 2026-08-18 | RULE CANDIDATE (3) (row 602) |
| Plan prose states unverified content-item count that | 2 | 2026-08-16 | RULE CANDIDATE (2) → grep-verify counts (row 547) |
| Fix commit correcting §10 violations introduces fresh §10 | 28 | 2026-09-06 | RULE CANDIDATE (28) — text exists (§10 cl.3); enforcement gap. STAYS at 28 (same-branch convention); 3rd arc = 6 sub-instances (`74b87e4c`→`12bc77f5`). Possible uncounted 4th arc: `chore/pipeline-spec-as-data` (a8f92eab→c7686957). Detail in topic file |
| Rules-file bullet closes an enumeration of a structurally OPEN set — falsified on each new discovery | 5 | 2026-09-07 | RULE CANDIDATE (5) — text exists (§10 cl.2). +2 `chore/pipeline-spec-as-data`. Chain in topic file |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 2 | 2026-09-01 | RULE CANDIDATE (2) → agent-learner.md needs a re-derivable RECORD, not prose (row 688, topic file) |
| Mutation-check executed but doesn't falsify the claim — unisolated or untargeted mutation | 2 | 2026-09-07 | RULE CANDIDATE (2) → addendum to test-writer.md § Mutation-check (design gap, not artifact-cleanliness). `chore/pipeline-spec-as-data`: `a8f92eab`, `c7686957`. Draft text + detail in topic file |
| Verification/gate check accepts category-membership or substring match, not exact identity — SWAP passes clean | 2 | 2026-09-07 | RULE CANDIDATE (2) → 3rd worked example under code-style.md §7 (not a new rule). `chore/pipeline-spec-as-data`: `dc9789f9`, pre-`c7686957`. Detail in topic file |
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
| Verification gate's pass condition is empty result — fails open on malformed input | 2 | 2026-08-19 | RULE CANDIDATE (2) (row 613) |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 3 | 2026-08-20 | RULE CANDIDATE (3) → §Rule-Mirror-Sync (row 637) |
| Correct advice with invented rationale (correct conclusion shields false WHY) | 4 | 2026-09-07 | RULE CANDIDATE (4) — 3rd is CR itself (b7780606); 4th is `93df2283` doc-updater. Propose: agent-critic.md verifies stated mechanism independently (row 638, topic file) |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) (row 639) |
| Derivation query replacing an open-set enumeration is unverified before publish (false negative) | 2 | 2026-09-02 | RULE CANDIDATE (2) → code-style.md §10 cl.2 addendum (row 634; 2nd occurrence grep-regex, cross-agent-lessons.md) |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence (row 640) |
| Doc-updater reports 1 stale claim; whole-block read finds more | 3 | 2026-09-07 | PROMOTED — rule already in `agent-doc-updater.md` § DO. 3rd (`dc9789f9`, chore/pipeline-spec-as-data) is enforcement-gap, not missing-text; same-block vs elsewhere unconfirmed (row 641) |
| Empirical measurement correct for tested scenario but excludes the failure case | 3 | 2026-08-20 | RULE CANDIDATE (3) → §10 clause 5 (rows 649+650) |
| Corrected claim partially retracted — old wording persists elsewhere | 5 | 2026-09-02 | RULE CANDIDATE (5) — cross-branch, a PARAPHRASE survived §10 cl.3's own grep (text wasn't verbatim). Propose: cl.3 grep also on the claim's subject/keywords (topic file) |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) → grep by name/path too (row 653) |
| Subagent asserts a verification/write it did not perform — evidence invented, conclusion mostly true | 11 | 2026-09-06 | PROMOTED → agent-workflow.md § Finding Validation (`b177a3d2`). Instances 1-11 (through `bb82cb7b`'s test-writer — the agent's own CONTEXT, not a code fact) detailed in topic file. f0eef243/12bc77f5 cycle: no 12th instance (both reproduced by execution, opposite of this pattern). Stays 11 |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 13 | 2026-09-07 | RULE CANDIDATE (13) (row 655) — +2 `chore/pipeline-spec-as-data` (`dc9789f9` tally mismatch; `a8f92eab` miscount). Still unwritten in §10 text — close the gap |
| Coherent-but-false claim survives active same-paragraph edits across 3 same-day commits | 1 | 2026-09-02 | PROMOTED → code-style.md §10 cl.3 addendum + new cl.5 (`18757ddf`). Detail in topic file |
| check-mirror-sync.mjs cannot verify 2+ occurrences of one anchor WITHIN the same file | 1 | 2026-09-02 | WATCHING — `18757ddf` inserted 2 byte-identical clauses into one file; no mechanical check for same-file duplicate anchors. First occurrence; log and watch |
| Agent asserts a reduced-cycle exemption from a change's SHAPE, not the rule's PATH test | 3 | 2026-08-24 | RULE CANDIDATE (3) — 2 agent types (row 661) |
| Unverified superlative/rank asserted about tracker data without re-deriving | 2 | 2026-08-30 | RULE CANDIDATE (2) (row 667) |
| Mocked-Supabase test assertion vacuous about a chain-builder ARGUMENT | 2 | 2026-08-30 | RULE CANDIDATE (2) → code-style.md §7 (row 668) |
| File brought exactly to its size cap, re-crossed by a same-commit fix | 2 | 2026-08-30 | RULE CANDIDATE (2) → agent-code-reviewer.md (row 670) |
| Test title pins a silent-fallback/coercion defect as intended, inverted only when fixed | 2 | 2026-08-31 | RULE CANDIDATE (2) → code-style.md §7 (row 674) |
| Quantified claim re a live/open data source goes stale post-write (same-commit amend OR a later same-PR sibling commit) | 2 | 2026-09-02 | RULE CANDIDATE (2) → §10 rule 2 addendum: pin to a commit SHA + "re-derive at pickup", not just an as-of date (row 677, topic file) |
| CLAUDE.md docs-only exemption path list omits `.spec-workflow/specs/*/tasks.md` | 2 | 2026-09-02 | RULE CANDIDATE (2) → propose adding `.spec-workflow/specs/**/tasks.md` to CLAUDE.md § Post-commit review docs-only list (row 657, topic file) |
| Orchestrator drafts its own unverified "because X"/attribution claim in comment prose | 4 | 2026-09-01 | RULE CANDIDATE (4) — enforcement gap: 4th escaped impl-critic + full cycle, caught only by cloud CR post-push (row 683, topic file) |
| (8 count=1 WATCHING rows from 2026-09-02, pre-18757ddf, relocated) | — | 2026-09-02 | see tracker-archive.md "Live-table snapshot relocated 2026-09-02 (batch 4)" — grep there before re-adding a matching pattern |
| Implementation-critic outright omitted pre-commit, no stated exemption — run post-hoc, found sound | 1 | 2026-09-06 | WATCHING — `c95d1cb1` committed without implementation-critic, no rationalization (distinct from row 632's INVENTED-exemption flavor). First occurrence; log and watch |
| Agent's own auto-injected rules-file copy is stale mid-session | 2 | 2026-09-06 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol: subagents re-read from disk, not injected copy, when the diff touches that file. Detail in topic file |
| Verification evidence answers a different proposition than the finding's claim — real check, wrong question | 2 | 2026-09-07 | RULE CANDIDATE (2) → agent-workflow.md § Finding Validation: before treating command+output as validation of finding C, state C's proposition and confirm the command answers C, not a related question. Inst. 1 (`43b1b9a5`, semantic-reviewer): checked when extend-by-one ARRIVED, not what PRECEDED it. Inst. 2 (`93df2283`, doc-updater): cited a stale footer as the WRONG category of footer. Distinct from rows 663/638. |
| Sweep regex matches canonical form, silently skips alternative form | 1 | 2026-09-07 | WATCHING — `93df2283` footer sweep missed impl-critic.md's parenthetical chain form. Distinct from rows 637/653. Detail in topic file |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits. Schedule Sweep-On-Rule-Promotion. Tracker > rule-file parenthetical counts.
- Biggest recurring defect: **partial fix to a sibling-file group** (20) — grep siblings before committing; already-promoted CLAUDE.md rule is followed but not sufficing (row 674, topic file).
- POSITIVE (`bf2b6672`): §10 clause 3 grep, run proactively, caught 4 sites CR never named — mechanical checks beat review rounds.
- OPEN AMBIGUITY (2026-08-25): unwritten "2nd-branch" gate applied inconsistently (519/655/604 held it, 660 didn't).
- POSITIVE (fix/991, `d2d3bdb3`, `d4837e6a`): already-promoted gates (§10, doc-updater hallucination) caught drift pre-push with no new rule needed — detail in topic file.
- Not-an-escalation + execute-vs-infer PROPOSAL (2026-08-31, rows 604/677-680) — 100% prose findings, zero code defects; not applied. Detail in topic file.
- POSITIVE (`84413f28`, row 681): plan-critic caught the orchestrator's own draft PR-comment restating a CR mechanism backwards, pre-commit. Detail in topic file.
- E2E spec >500L growth tracked in code-reviewer/MEMORY.md (RULE CANDIDATE 2) — no duplicate row here; `eca41e9a` (546L, 3rd growth) is the same tracked instance there.
- Row 683: 1st post-push escape (semantic-reviewer rated GOOD without re-deriving the claim) — not a text gap, an enforcement one. Detail in topic file.
- Compaction history (zero data loss throughout, verified each time; detail in cross-agent-lessons.md): 2026-09-01 ×2 (32 rows); 2026-09-02 batches 1-4 (21+20+6+8 count=1 WATCHING rows relocated to tracker-archive.md).
- POSITIVE (fix/admin-session-item-scale, `7c9c9177`/`4c33b2bf`, 2026-09-02): memory-delta discipline held (compaction shipped IN the fix commit, not a later sweep); test-writer's mutation-verification DO held (reverted the `allRows`-vs-`rows` guard, watched 26 green, then shipped the regression test).
- POSITIVE — clean §10-fix data points (0 new false claims shipped, detail in topic file): `b7780606` (3rd), `a507bc93` (4th, self-caught pre-commit one level earlier), `18757ddf` (5th, 2026-09-02 — all 6 remaining claims re-verified by execution).
- NEAR MISS (`20a14793`, row 663): code-reviewer + doc-updater (`dcad1d21`) each reported an action not performed. Detail in topic file.
- POSITIVE (2026-09-02): `e0e3d520`/`d315b076`/`9c907cca` ran fully clean (rules-prose-only diff = pure review overhead — 3rd exemption path drafted, topic file).
- SWEEP PROPOSED, not run (off `18757ddf`'s §10 cl.3/5 promotion): grep rules/CLAUDE.md prose for un-re-derived third-party-tool-internals claims. Orchestrator to scope/run. Detail in topic file.
- CORROBORATION (row 663 inst. 8-10): dispatch-prompt reminders caught 0/3 recurrences; orchestrator artifact re-check caught 3/3 — confirms Finding Validation. Detail in topic file.
- CORRECTED (2026-09-06): "3 full cycles on 2 lines of prose" over-counted — only 2/4 took a full cycle. Detail in topic file.
- POSITIVE (`bb82cb7b` cycle, 2026-09-06): branch's first fully clean full cycle, driven by EXECUTION not inference (reconfirms `agent-workflow.md § Delegation Protocol`, no new rule needed). Detail in topic file.
- POSITIVE (`12bc77f5`, 2026-09-06): closed-enumeration→derivation STRUCTURALLY ended a 7-commit chain. Detail in topic file.
- POSITIVE (2ad23ddf cycle, 2026-09-07): propose-then-falsify — semantic-reviewer asked to STATE THE PROPOSITION each command was meant to falsify BEFORE running it; both passes verified the right thing. ONE trial; belongs to #1265 evidence base. Watch for a second trial before treating as reliable.
- semantic-reviewer MEMORY.md at 21,446 bytes (21.4 KB, measured `wc -c`), approaching 25 KB injection cap. Orchestrator should schedule compaction before next content-heavy branch.
- Q4 (`chore/pipeline-spec-as-data`): "defects land in the prose, not the mechanism" NOT well-supported — ~half the findings were logic bugs, and both semantic-reviewer CRITICALs were mechanism bugs. Branch touches only the spec layer, so the reading is near-tautological. Detail in topic file.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, meta-lessons, CR mirror/wording/measurement discipline, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
