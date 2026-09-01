# Learner Agent Memory

> Cross-agent pattern synthesis + FP tracking. Update IN PLACE — no dated logs; history in git. Terminal-state rows → tracker-archive.md.

## Issue Frequency Tracker (active rows; terminal-state → tracker-archive.md)

Schema: Issue Type | Count | Last Seen | Status. Count=1: archive row# in status, full narrative there.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Query missing student_id scope | 2 | 2026-03-15 | RULE CANDIDATE (2) → security.md (on 3rd) |
| Error path in existing function untested (count-error branch) | 8 | 2026-08-11 | RULE CANDIDATE (8). |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (deferred). |
| Red-team spec-count prose drift across multiple doc surfaces | 7 | 2026-07-03 | RESOLVED — rule DROPPED 2026-08-19 (#1222); doc-updater no longer chases stale inventory counts (agent-doc-updater.md) |
| plpgsql body contains deferred-validation SQL (clean apply ≠ execution correctness) | 5 | 2026-08-24 | RULE CANDIDATE (5). |
| Integration-test count in plan.md goes stale on each test-adding commit | 7 | 2026-08-16 | RULE CANDIDATE (7). |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (2) (row 625) |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE. |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 3 | 2026-06-24 | RULE CANDIDATE (3). |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE. |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE (row 626) |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE (row 627) |
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 5 | 2026-07-02 | RULE CANDIDATE (5). |
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
| Fix commit correcting §10 violations introduces fresh §10 | 25 | 2026-08-31 | RULE CANDIDATE (25) → §10 "whole-block re-read" — text exists (§10 cl.3); gap is enforcement (row 604, detail in topic file) |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE (2) (row 605) |
| Inline comment enumerating sibling files/call-sites by | 2 | 2026-08-17 | RULE CANDIDATE (2) (row 606) |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE (2) (row 608) |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) (row 609) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) (row 610) |
| Prose asserts an issue is closed/resolved without `gh issue view` | 4 | 2026-08-19 | RULE CANDIDATE (4) (row 611) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) (row 632) |
| Verification date from local clock, not UTC (future-dated claim) | 1 | 2026-08-19 | WATCHING (row 633) |
| Comment about what a test assertion proves written without mutation-verification | 1 | 2026-08-19 | WATCHING (row 594) |
| Self-invalidating relative reference in durable rules/doc file | 3 | 2026-08-19 | RULE CANDIDATE (3) (row 612) |
| Verification gate's pass condition is empty result — fails open on malformed input | 2 | 2026-08-19 | RULE CANDIDATE (2) (row 613) |
| Ceiling or bound defined in terms of an unreachable precondition | 1 | 2026-08-19 | WATCHING (row 595) |
| Pipeline bookkeeping lines pushed review-follow-up commit over 20-line threshold | 1 | 2026-08-19 | WATCHING (row 596) |
| Measurement quoted next to a command that cannot produce it | 1 | 2026-08-19 | WATCHING (row 597) |
| Canonical amended, mirror left behind — in a commit that edits the mirror anyway | 1 | 2026-08-19 | WATCHING (row 616) |
| Mirror sweep scoped by file extension, not claim phrase — misses .ts hits | 3 | 2026-08-20 | RULE CANDIDATE (3) → §Rule-Mirror-Sync (row 637) |
| Correct advice with invented rationale (correct conclusion shields false WHY from scrutiny) | 2 | 2026-08-20 | RULE CANDIDATE (2) (row 638) |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) (row 639) |
| Derivation query replacing an open-set enumeration is unverified before publish (LIKE/NOT LIKE false negative) | 1 | 2026-08-20 | WATCHING (row 634) |
| Plan-critic round reverses its own prior round's misread; mirror-edit over-generalizes a carve-out | 1 | 2026-08-20 | WATCHING (row 635) |
| Red-team spec positive controls pass via fixture-order coupling, not construction | 1 | 2026-08-20 | WATCHING (row 636) |
| §10 fix staged partially — correct text in tree, not commit; `git grep` clean | 3 | 2026-08-24 | RULE CANDIDATE (3) — any stage-then-edit sequence (row 640) |
| Doc-updater reports 1 stale claim; whole-block read finds more | 2 | 2026-08-20 | RULE CANDIDATE (2) → doc-updater whole-block read (row 641) |
| Plan asserts Next.js/framework runtime behavior (middleware matcher, React cache scope) without compilation test | 1 | 2026-08-20 | WATCHING (row 642) |
| Agent confirms CONCLUSION without verifying MECHANISM — wrong mechanism corrected to a different wrong mechanism | 1 | 2026-08-20 | WATCHING (row 643) |
| Plan's call-site census counts FILES as proxy for CALL EXPRESSIONS, overcounts shared callers | 1 | 2026-08-20 | WATCHING (row 644) |
| Promoted rule text not validated against its own stated edge case — CodeRabbit caught the gap after 3 internal cycles | 1 | 2026-08-20 | WATCHING (row 645) |
| Review cycle stopped on 'prose-only findings' grounds; §10 violations shipped into binding files | 1 | 2026-08-20 | WATCHING (row 646) |
| Behavioral-fact correction not swept to callers relying on the fact | 1 | 2026-08-20 | WATCHING (count 2→1, promotion withheld, row 647) |
| Diff-scoped post-commit agents all pass while callers of a corrected fact remain stale | 1 | 2026-08-20 | WATCHING (row 648) |
| Empirical measurement correct for tested scenario but excludes the failure case | 3 | 2026-08-20 | RULE CANDIDATE (3) → §10 clause 5 (rows 649+650) |
| Corrected claim partially retracted — old wording persists elsewhere | 3 | 2026-08-24 | RULE CANDIDATE (3) → §10 clause 3, repo-wide grep (row 653 family) |
| Null-fallback (`??`) silently reinstates the defect the PR was removing | 1 | 2026-08-24 | WATCHING (row 651) |
| CLAUDE.md docs-only exemption omits `.spec-workflow/specs/*/tasks.md` | 1 | 2026-08-24 | WATCHING (row 657) |
| Commit message cites config/rule file lines scoped narrower than the claim | 1 | 2026-08-24 | WATCHING (row 652) |
| Explore report accurate for its narrow question read as answering a broader plan claim | 1 | 2026-08-24 | WATCHING (row 651) |
| Mirror-sync grep misses a mirror on the wrong axis | 2 | 2026-08-24 | RULE CANDIDATE (2) → grep by name/path too (row 653) |
| Reviewer's own auto-injected rules-file copy is stale when the reviewed branch is mid-edit on that same file | 1 | 2026-08-24 | WATCHING (row 656) |
| Rules-file claim true in its hunk, false vs another section/mirror/arithmetic | 11 | 2026-08-25 | RULE CANDIDATE (11) (row 655) |
| Subagent asserts a verification it did not perform — evidence invented, conclusion mostly true | 4 | 2026-08-30 | RULE CANDIDATE (4) (row 663) |
| Agent asserts a reduced-cycle exemption from a change's SHAPE, not the rule's PATH test | 3 | 2026-08-24 | RULE CANDIDATE (3) — 2 agent types (row 661) |
| Reviewer's own proposed remedy is a hypothesis too — correct diagnosis, wrong-direction fix | 1 | 2026-08-24 | WATCHING (row 662) |
| Subagent's own justification fabricates coverage its diff does not have (coderabbit-sync) | 1 | 2026-08-24 | WATCHING (row 654) |
| Reviewers "confirm" a claim by grepping only the phrases it cites — convergence ≠ corroboration | 1 | 2026-08-24 | WATCHING (row 659) |
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
| Quantified claim true when written, stale after a same-commit amend, unre-verified | 1 | 2026-08-31 | WATCHING (row 677, detail in topic file) |
| Explore-agent arithmetic/count error propagated unverified into plan/commit/report | 1 | 2026-08-31 | WATCHING (row 678, detail in topic file) |
| A commit's own message and its own file content assert contradicting claims; the file version propagates | 1 | 2026-08-31 | WATCHING (row 679, detail in topic file) |
| Coverage-gap enumeration scoped to one test tier concludes "no coverage exists" | 1 | 2026-08-31 | WATCHING (row 680, detail in topic file) |
| Orchestrator restates a critic/CR finding's mechanism backwards, unverified | 1 | 2026-09-01 | WATCHING (row 681, detail in topic file) |
| CodeRabbit misreads a wrapped diff line, proposes a bad committable suggestion | 1 | 2026-09-01 | WATCHING (row 682, detail in topic file) |
| Orchestrator drafts its own unverified "because X"/attribution claim in comment prose (not restating a finding) | 4 | 2026-09-01 | RULE CANDIDATE (4, reconciled: 2×`8b8ccb54` rounds + 1×`eca41e9a` + 1×`e2768a56` — each a distinct false claim, not a re-mention). Still no new RULE TEXT (code-style.md §10 + Finding Validation already state it twice). DISPOSITION CHANGED: `e2768a56`'s claim ("a caller that retries gets a consistent one" — false, the pager doesn't retry) escaped impl-critic AND the full post-commit cycle (code-reviewer 0, semantic-reviewer 0+1 GOOD, doc-updater/test-writer clean) — caught only by cloud CodeRabbit post-push. "Gate is working" (prior disposition) is FALSIFIED for this 4th instance; 3/4 still caught pre-commit. Gap is ENFORCEMENT (semantic-reviewer rated the comment GOOD without checking the retry claim against the pager's source), not missing text. Treating the post-push escape itself as count=1 (first time this class reached cloud CR) — WATCHING for a 2nd escape before proposing a semantic-reviewer checklist item (row 683) |
| code-reviewer line-count convention inconsistent across cycles on an unchanged function body (signature+brace in vs excluded) | 1 | 2026-09-01 | WATCHING — `fetchAllRows` body reported "115-144 = exactly 30 lines, at cap" one cycle, then "spans 110-145 (36 lines), over the cap" the next, same unchanged 30-line body; the 2nd count includes the signature line + closing brace. Risk: phantom regression in the tracker. Single occurrence — log only; if it recurs, propose agent-code-reviewer.md fix the convention to body-only (open `{` to matching `}`, exclusive) (row 687) |
| Doc-updater flags DRIFT by reading a statement explicitly scoped to one resolved case as a universal contract claim | 1 | 2026-09-01 | WATCHING — FALSE POSITIVE this instance, all 3 findings validated+skipped (row 684) |
| Two post-commit reviewers give contradictory recommendations on the same artifact (code-reviewer: extract dup; test-writer: not duplicates — different predicates) | 1 | 2026-09-01 | WATCHING — test-writer's finer-grained read validated correct; not an `agent-workflow.md` zero-overlap violation (that governs code-reviewer/semantic-reviewer only, not test-writer) (row 685) |
| Orchestrator SKIP verdict on a CR finding reversed 2+ rounds later by an independent reviewer citing the project's own path instruction | 1 | 2026-09-01 | WATCHING — skip-quality signal; system self-corrected via CR-local round 3, but the initial SKIP was wrong on the merits (row 686) |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits. Schedule Sweep-On-Rule-Promotion. Tracker > rule-file parenthetical counts.
- Biggest recurring defect: **partial fix to a sibling-file group** (20) — grep siblings before committing; already-promoted CLAUDE.md rule is followed but not sufficing (row 674, detail in topic file).
- POSITIVE (`bf2b6672`): §10 clause 3 grep, run proactively, caught 4 sites CR never named — mechanical checks beat review rounds.
- OPEN AMBIGUITY (2026-08-25): unwritten "2nd-branch" gate applied inconsistently (519/655/604 held it, 660 didn't).
- POSITIVE (fix/991, `d2d3bdb3`, `d4837e6a`): already-promoted gates (§10, doc-updater hallucination) caught drift pre-push with no new rule needed — detail in topic file.
- Not-an-escalation + execute-vs-infer PROPOSAL (2026-08-31, rows 604/677-680) — 100% prose findings, zero code defects; not applied. Detail in topic file.
- POSITIVE (`84413f28`, row 681): plan-critic caught the orchestrator's own draft PR-comment restating a CR mechanism backwards, pre-commit. Detail in topic file.
- E2E spec >500L growth (`84413f28`) already self-tracked in code-reviewer/MEMORY.md at RULE CANDIDATE(2) — no duplicate row here. `eca41e9a`: `rpc-admin-report-answer-keys-idor.spec.ts` hit 546L, its 3rd consecutive growth (495→511→518→546) — code-reviewer records it as the SAME tracked instance, not a new occurrence; still no duplicate row here.
- MIXED (`8b8ccb54`+`eca41e9a`+`e2768a56`, row 683, now count=4): impl-critic caught 3/4 self-invented false comment/attribution claims pre-commit (2 rounds on `8b8ccb54`'s JSDoc, 1 on `eca41e9a`'s RPC-predicate attribution), but the 4th (`e2768a56`, "a caller that retries gets a consistent one" — false) passed impl-critic AND the full post-commit 4-agent cycle and shipped; cloud CodeRabbit caught it post-push. The "3rd instance that slips PAST impl-critic" watch condition from the prior pass has now happened — but it slipped past MORE than impl-critic (semantic-reviewer rated the comment GOOD). code-style.md §10 + Finding Validation still state the rule verbatim, so this is not a text gap; it's semantic-reviewer's comment-accuracy check not actually re-deriving the specific claim from source before rating GOOD. No rule/checklist change yet (first post-push escape) — watch for a 2nd.
- NEW (`eca41e9a`): two independent signals logged at count=1 — (a) code-reviewer and test-writer gave CONTRADICTORY recommendations on the same artifact (extract-duplication vs not-duplicates); test-writer's finer-grained read was validated correct on inspection (rows differ in predicate, not duplicated). (b) a prior-round orchestrator SKIP of a cloud-CR finding was reversed at CR-local round 3 by an independent reviewer citing the project's own path instruction — the system self-corrected, but the initial SKIP verdict was wrong on the merits (rows 685/686).
- 2026-09-01 compaction: 32 rows dated 2026-03–2026-06 archived out of the live table (verified byte-identical detail already present in tracker-archive.md — zero data loss); one (red-team spec-count drift) transitioned to RESOLVED with its 2026-08-19 #1222 reversal noted, since it wasn't a clean promotion.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, meta-lessons, CR mirror/wording/measurement discipline, row detail.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — SAs must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — 2 valid test forms for page-error recovery; code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — INVOKER fns on RLS tables return `error: null, data: []` unauth; impl-critic FP.
