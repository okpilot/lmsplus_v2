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
| Fix commit correcting §10 violations introduces fresh §10 | 27 | 2026-09-02 | RULE CANDIDATE (27) → text exists (§10 cl.3); enforcement gap. 5th branch adds a HALF-true-guard-direction sub-flavor (row 604 instance 23, topic file) |
| Rule-promotion sweep recorded closed/complete, later found incomplete | 2 | 2026-09-01 | RULE CANDIDATE (2) → agent-learner.md needs a re-derivable RECORD, not prose (row 688, topic file) |
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
| Correct advice with invented rationale (correct conclusion shields false WHY from scrutiny) | 2 | 2026-08-20 | RULE CANDIDATE (2) (row 638) |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) (row 639) |
| Derivation query replacing an open-set enumeration is unverified before publish (false negative) | 2 | 2026-09-02 | RULE CANDIDATE (2) → code-style.md §10 cl.2 addendum (row 634; 2nd occurrence grep-regex, cross-agent-lessons.md) |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence (row 640) |
| Doc-updater reports 1 stale claim; whole-block read finds more | 2 | 2026-08-20 | RULE CANDIDATE (2) → doc-updater whole-block read (row 641) |
| Empirical measurement correct for tested scenario but excludes the failure case | 3 | 2026-08-20 | RULE CANDIDATE (3) → §10 clause 5 (rows 649+650) |
| Corrected claim partially retracted — old wording persists elsewhere | 3 | 2026-08-24 | RULE CANDIDATE (3) → §10 clause 3, repo-wide grep (row 653 family) |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) → grep by name/path too (row 653) |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 11 | 2026-08-25 | RULE CANDIDATE (11) (row 655) |
| Subagent asserts a verification it did not perform — evidence invented, conclusion mostly true | 4 | 2026-08-30 | RULE CANDIDATE (4) (row 663) |
| Agent asserts a reduced-cycle exemption from a change's SHAPE, not the rule's PATH test | 3 | 2026-08-24 | RULE CANDIDATE (3) — 2 agent types (row 661) |
| Reviewer's own proposed remedy is a hypothesis too — correct diagnosis, wrong-direction fix | 1 | 2026-08-24 | WATCHING (row 662) |
| Subagent's own justification fabricates coverage its diff does not have (coderabbit-sync) | 1 | 2026-08-24 | WATCHING (row 654) |
| Agent applies severity ruled out by dispatch prompt — incomplete evidence ≠ false claim | 1 | 2026-08-24 | WATCHING (row 664) |
| Confounded measurement: two variables changed at once → wrong conclusion shipped as rule | 1 | 2026-08-24 | WATCHING (row 665) |
| Scripted/regex bulk edit strips a file-level invariant (trailing newline) no content check inspects | 1 | 2026-08-25 | WATCHING (row 666) |
| Unverified superlative/rank asserted about tracker data without re-deriving | 2 | 2026-08-30 | RULE CANDIDATE (2) (row 667) |
| Mocked-Supabase test assertion vacuous about a chain-builder ARGUMENT | 2 | 2026-08-30 | RULE CANDIDATE (2) → code-style.md §7 (row 668) |
| Migration self-assigns next `-- Migration N:` ordinal from an abandoned/undecodable numbering convention | 1 | 2026-08-30 | WATCHING (row 669) |
| File brought exactly to its size cap, re-crossed by a same-commit fix | 2 | 2026-08-30 | RULE CANDIDATE (2) → agent-code-reviewer.md (row 670) |
| New `fetchAllRows` call site shipped without the already-promoted code-style.md §7 page-error test | 1 | 2026-08-30 | WATCHING (row 671) |
| Red-team vector enumerating sibling answer-key-returning RPCs not extended when a new sibling RPC is added | 1 | 2026-08-30 | WATCHING (row 672) |
| Concurrent subagents dispatched onto the same file — one's restore step reverts a sibling's un-related edit | 1 | 2026-08-30 | WATCHING (row 673) |
| Delegation-prompt/scaffolding wording leaks verbatim into a shipped code comment | 1 | 2026-08-30 | WATCHING (cross-agent-lessons.md). |
| Partial `vi.mock` throws when module later gains a new export the mock omits | 1 | 2026-08-30 | WATCHING (cross-agent-lessons.md). |
| Test title pins a silent-fallback/coercion defect as intended, inverted only when fixed | 2 | 2026-08-31 | RULE CANDIDATE (2) → code-style.md §7 (row 674) |
| Reviewer asserts a process/compliance violation it cannot observe from its inputs | 1 | 2026-08-31 | WATCHING — FALSE POSITIVE this instance (row 675) |
| Agent's own memory tracker row cites a stale file-state fact (line count) an earlier commit already changed | 1 | 2026-08-31 | WATCHING (row 676) |
| Quantified claim true when written, stale after a same-commit amend, unre-verified | 1 | 2026-08-31 | WATCHING (row 677, topic file) |
| Explore-agent arithmetic/count error propagated unverified into plan/commit/report | 1 | 2026-08-31 | WATCHING (row 678, topic file) |
| A commit's own message and its own file content assert contradicting claims; the file version propagates | 1 | 2026-08-31 | WATCHING (row 679, topic file) |
| Coverage-gap enumeration scoped to one test tier concludes "no coverage exists" | 1 | 2026-08-31 | WATCHING (row 680, topic file) |
| Orchestrator restates a critic/CR finding's mechanism backwards, unverified | 1 | 2026-09-01 | WATCHING (row 681, topic file) |
| CodeRabbit misreads a wrapped diff line, proposes a bad committable suggestion | 1 | 2026-09-01 | WATCHING (row 682, topic file) |
| Orchestrator drafts its own unverified "because X"/attribution claim in comment prose | 4 | 2026-09-01 | RULE CANDIDATE (4) — enforcement gap: 4th escaped impl-critic + full cycle, caught only by cloud CR post-push (row 683, topic file) |
| code-reviewer line-count convention inconsistent across cycles on an unchanged function body | 1 | 2026-09-01 | WATCHING — same body scored 30 then 36; phantom-regression risk (row 687, topic file) |
| Doc-updater flags DRIFT reading a case-scoped statement as a universal claim | 1 | 2026-09-01 | WATCHING — FALSE POSITIVE this instance, 3 findings validated+skipped (row 684) |
| Two post-commit reviewers give contradictory recommendations on the same artifact | 1 | 2026-09-01 | WATCHING — test-writer's finer read validated correct, not zero-overlap (row 685) |
| Orchestrator SKIP verdict on a CR finding reversed 2+ rounds later by another reviewer | 1 | 2026-09-01 | WATCHING — skip-quality signal, system self-corrected (row 686) |
| Fix for a vacuous-assertion CR finding covers only one of N sibling RPC/target assertions in the same test | 1 | 2026-09-01 | WATCHING — distinct from row 605 (sibling FILES vs sibling TARGETS in one file) (row 689, topic file) |
| Commit-message verification citation (line number) carried over from an earlier draft, not re-derived after the code moved before commit | 1 | 2026-09-01 | WATCHING — distinct from row 597 (row 690, topic file) |
| Doc paragraph states a closed count for a set the SAME paragraph declares OPEN (self-contradiction, not cross-section) | 1 | 2026-09-01 | WATCHING — §10 rule 2 covers this; distinct from row 655 (same-sentence vs cross-section). Missed internally, caught only by external CR (row 691, topic file) |
| Orchestrator triages only the CR review-BODY findings and pushes; an open inline-thread finding surfaces only afterward | 1 | 2026-09-01 | WATCHING — pushed with an in-flight finding, violating the Apply-vs-Defer gate (row 692, topic file) |
| Extraction inserts a declaration between a function and its JSDoc, silently reattaching the doc to the wrong declaration | 1 | 2026-09-02 | WATCHING (cross-agent-lessons.md — fix/admin-session-item-scale `4c33b2bf`). |
| Shared helper generalized to a 2nd caller with a different trust tier — client made a required param, no default (positive instance) | 1 | 2026-09-02 | WATCHING (cross-agent-lessons.md — fix/admin-session-item-scale `7c9c9177`). |

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
- 2026-09-01 compaction (×2): 32 old rows archived (zero data loss, verified); red-team spec-count → RESOLVED (#1222). Rows 683/687/109-113/604/688 detail moved to topic file (soft-cap nudge).
- 2026-09-02 compaction: 21 count=1 WATCHING rows (2026-08-19→08-24, rows 594-659 range) relocated verbatim to tracker-archive.md's "Live-table snapshot relocated 2026-09-02" section — no state change, zero data loss. Freed room for this cycle's 4 new/updated rows (42, 56 [was 62], 97, 98).
- POSITIVE (fix/admin-session-item-scale, 2026-09-02): memory-delta discipline held — code-reviewer's own agent-memory compaction shipped IN the fix commit (`7c9c9177`), not a later pre-push sweep (row 639's failure mode did NOT recur here). Test-writer's mutation-verification DO also held: the `allRows`-vs-`rows` filter-parity guard was proven real by reverting it and watching 26 green tests, before shipping the regression test (`4c33b2bf`).

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, meta-lessons, CR mirror/wording/measurement discipline, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
