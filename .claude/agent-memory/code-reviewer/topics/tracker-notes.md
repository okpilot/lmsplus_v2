# code-reviewer — tracker row evidence

The long-form tail of each `MEMORY.md` tracker row. Split out on 2026-09-18 because `MEMORY.md`
had reached 24,906 bytes against the 25 KB injection cap, past which content is silently invisible.
Rows keep their pattern, dates, count and status head; only the evidence moved. Read on demand.

## New hook/utility file shipped without co-located test
<a id="new-hook-utility-file-shipped-without-co-located-test"></a>

Two of six recurrences are EXTRACTION commits — §1's same-commit-extraction discipline does not carry §7's same-commit-test discipline with it. Evidence + positives: commit-review-log.md "co-located test". RULE CANDIDATE: mechanical guard (extend check-soft-delete-guard.mjs sibling or new hook) flagging a new file under lib/queries, lib/, _hooks/, _utils/ with no matching .test.ts in the same commit. POSITIVE (still holding pre-8771aa2 instances): guard-bash.js stdin rewrite (5923087a) + session-bootstrap-load.ts .catch() (cb690c4f) + mc-content.ts (fefef96e) all shipped with co-located test. ANOTHER POSITIVE (f644ca53, review-follow-up to c90caf61): chainable-rpc-client.ts — extracted from two near-duplicate test-local mocks (supabase-rpc.test.ts's makeChainableClient + admin-report-helpers.test.ts's fakeChainableAuthClient) — shipped with chainable-rpc-client.test.ts (108L, 8 tests) in the SAME commit, matching the lib/test-support/mock-router.ts precedent. Second data point for the same-commit-extraction-carries-same-commit-test pattern the RULE CANDIDATE below still wants mechanized.

## Hook file > 80-line limit
<a id="hook-file-80-line-limit"></a>

RESOLVED: use-dialog-fill-input.ts 87L→56L (9e651aaf — extracted deriveBlankIndices/toBlankResults/buildSubmitPayload/toSeedValues + DialogBlank/BlankResult types to new dialog-fill-helpers.ts, same commit as the fix — good same-commit-extraction precedent for §1).

## React component > 150-line limit
<a id="react-component-150-line-limit"></a>

SPLIT CANDIDATE: select.tsx 193L, alert-dialog.tsx 168L (shadcn wrappers; annotation-expansion; split work separate). WATCH: quiz-config-form.tsx 150L exactly at cap, quiz-main-panel.tsx 125L. RESOLVED: quiz-session.tsx 161L→132L (eec31df2 — QuizSessionProps extracted to session-types.ts).

## Utility function > 30 lines
<a id="utility-function-30-lines"></a>

Still-open: getSessionReports 60L; buildReportQuestions 65L; startOralExam 44L; buildHandleSubmit 47L; buildFinishDialogHandlers 37L; assembleQuizState 36L; useOrderingInput 46L; useFinishQuizDialog 59L; checkNonMcAnswer 82L; requireAdmin 41L; handleSave 42L; fetchAllRpcRows 42L; runMutation 65L (pre-existing); check-prose-claims.mjs main ~99L; check-prose-paths.mjs classify 54L/main 60L/reportFindings 38L/evaluate 37L — hook scripts as a class have over-cap functions as an established pattern. SKIPPED (classify 54L): flat 16-branch classification table, no extractable logic. parseSuite 45L (chore/validate-mutation-group-refs — extraction of ownerAbove+readMarker was intended to bring it under cap but did not; body still contains an inner closure ownerFor plus two scanning loops).

## Deep nesting > 3 levels
<a id="deep-nesting-3-levels"></a>

indent 4 — fix = extract applyTopics helper).

## Utility file > 200-line limit
<a id="utility-file-200-line-limit"></a>

RECONCILED 2026-08-31: the quiz-report-questions.ts 213L figure was stale — measured at aec5dd24 = 177L (well under cap; drop it as a split candidate). WATCH: check-non-mc-answer-helpers.ts 200L at cap; seed-users.ts 198L; helpers/cleanup.ts 195L. BLOCKING: question-filters.tsx 181L (fix: extract FilterToggle + constants); use-quiz-config.ts 94L hook cap (fix: extract useQuizConfigState). RESOLVED: admin-quiz-report.ts 272L (464fd213, over cap) → 200L exactly (d2d3bdb3, #991 review follow-up) — the two near-identical `fetchAllRows` count+page blocks plus the session-guard and page-question/RPC fetches extracted to new admin-report-helpers.ts (171L, 6 exported helpers, each ≤29L). getAdminQuizReportSummary 87L→68L, getAdminQuizReportQuestions 156L→100L — both still far over the 30L func cap (pre-existing, not worsened by this commit — not re-flagged). New file admin-report-helpers.ts shipped with no co-located test — RESOLVED same PR (11cadfc2); see the missing-test tracker row above. Full history → file-size-watch-log.

## E2E spec > 500-line limit
<a id="e2e-spec-500-line-limit"></a>

rpc-admin-report-answer-keys-idor.spec.ts had 3 consecutive same-mechanism growths (511→518→546L) with no split yet — next touch should trigger the split (extract the shared precondition-check helper it duplicates with its sibling spec) rather than a 4th WARNING.

## §10 false "always" claim in mechanic-rewrite commits
<a id="10-false-always-claim-in-mechanic-rewrite-commits"></a>

CLEAN: 1bf29e9d — fullpush.md third version verified accurate (CORE agents / red-team ordering both confirmed against agent-workflow.md:733); wrap-tolerant class sweep for per-APPLY→per-ROUND wording found 0 live remaining instances (one hit in .claude/agent-memory/ is a historical quote, excluded). All four amended files updated consistently. No new false claims. agent-critic.md + docs/decisions.md added "CR-local has always used extend-by-one … never had the defect" — FALSE (crlocal used a consecutive-clean counter 2026-06-18→2026-06-23, ddf5f647→765914d7). Fixed in d58572c8: both files now describe CR-local as PRECEDENT — same defect, same fix, five days apart. SHAs and quotes verified by this reviewer. Follow-up 93df2283 corrected D61's "for the same reason" — the two rationales differ (CR-local: cloud is authoritative gate; D61: floor arithmetically unreachable); verified against 765914d7 text. docs/decisions.md footer not bumped to 2026-09-07 in that commit — noted as WARNING.

## Class-sweep "complete" overclaim — surviving instance outside documented exceptions
<a id="class-sweep-complete-overclaim-surviving-instance-outside-do"></a>

Second: chore/record-mechanical-lever R1 — sweep claimed "35 sites across 17 files", `redteam-e2e-coverage-batch/plan.md:85` missing (APPLIED in 6af7e652). Third: R1 fixup updated log to "36 sites across 18 files" — correct site count, wrong file count: the diff has 19 sweep files (docs/plan.md was in the original sweep commit 31976b79 but not counted; adding redteam-e2e-coverage-batch/plan.md as the 36th site makes it 19, not 18). Fix: change "18 files" → "19 files" in `.spec-workflow/specs/corpus-codification/tasks.md`. Mechanism: when a fixup adds the nth site to the sweep, the log records the new site count (35→36) but doesn't re-derive the file count from scratch — re-using the prior "17→18" delta instead of computing 18+1=19.

## §10 compliance-ratio/quote drift in a newly-authored data file's own comments
<a id="10-compliance-ratio-quote-drift-in-a-newly-authored-data-fil"></a>

PR-level pass found 2 MORE unswept instances in files no single commit re-checked (a stale `.coderabbit.yaml` file citation after a test split; a spec's self-authored test/mutation counts + commit citations gone stale within the same branch). Full detail: commit-review-log.md (PR-level entry, 2026-09-09). POSITIVE (236a043d): §10 cl.2 sweep verified COMPLETE in this commit — no remaining 'three mechanisms' count in any of the swept files; both suites pass. Extraction of `withRepo`/`run`/`seedFlagship` to testkit.mjs confirmed complete (no duplicates remain).

## §10 cl.5 fixup commit's own sweep leaves an adjacent stale claim (same file, same PR chain as the row above)
<a id="10-cl-5-fixup-commit-s-own-sweep-leaves-an-adjacent-stale-cl"></a>

Detail: commit-review-log.md "aa10d2b5". Same root cause as the row above: fixing a §10 claim inside a file does not re-derive every OTHER claim that file's own edit implicates, even when it's a few lines away in the same file.

## Numbered DO-NOT/BLOCKING list gains a GAP when an item is deleted without renumbering
<a id="numbered-do-not-blocking-list-gains-a-gap-when-an-item-is-de"></a>

Output Format — all 3 unfixed through 0cc1a4bb. Full detail: commit-review-log.md.

## Spec-only / agent-memory-only delta: all checks pass
<a id="spec-only-agent-memory-only-delta-all-checks-pass"></a>

§10 cl.8 rewritten block: all claims accurate (paraphrase example confirmed via git show 93492a26; post-commit stage removal confirmed in base branch diff; lefthook install owed claim accurate). RULE 0: no archaeology. R3 (chore/record-mechanical-lever, ceiling): CLEAN. Test suite 8/8. MUTATION "NOT this review" verified at cr-local-plan-reminder.sh:62. awk count confirmed 5 rows/largest 55.

## Hook-test mutation-claim encoding delta: all checks pass
<a id="hook-test-mutation-claim-encoding-delta-all-checks-pass"></a>

R3: §10 cl.8 caveat verified by execution — (1) `'x\n'.repeat(150)` → 150-line file; `baseline: {'src/big.ts': 150}` confirmed; (2) `assert.equal(run().status, 0)` IS the first assertion, before `git mv`; (3a) countlines mutation: parts.length=151 vs baseline=150 → 151!==150 → status 1, first assertion FAILS; (3b) baseline-lookup mutation: allowed=rule.max=100, n=150 → 150!==100 → status 1, first assertion FAILS. Both caveats are TRUE. No BLOCKING, no WARNINGS.

## §10 false count in Decision entry + false MUTATION/GROUP claim in own test
<a id="10-false-count-in-decision-entry-false-mutation-group-claim-"></a>

GROUP marker on test 2 changed from `ownerfor-never-looks-down` to `ownerfor-scan-skips-code` (verified accurate: mutation removes comment-only guard from downward scan, test 2 assertion correctly goes red). R3: CLEAN — all four round-2 fixes verified. parseSuite now 32L (from 45L, improved not worsened). --coverage exits 0 (no dangling GROUP ids). ci.yml confirmed timeout 15m + parse test added.

## Agent/rules/docs-only delta (chore/pre-push-review-gate): all checks pass
<a id="agent-rules-docs-only-delta-chore-pre-push-review-gate-all-c"></a>

c3ad81b5: heading rename "Post-commit agent integration"→"Gate reviewer agent integration" in agent-workflow.md; old heading name survives ONLY in .spec-workflow/specs/workflow-improvements/ (all-[x] historical record, 10 checked / 0 unchecked — exemption claim verified); no dangling § citations in live corpus; no heading collision at line 416; no interaction with f885ed22.

## Tracker RESOLVED cell describes a fix that didn't happen — §10 false claim in agent-memory
<a id="tracker-resolved-cell-describes-a-fix-that-didn-t-happen-10-"></a>

Fixed in 9a79ec78: (a) the real deferral was made in tech.md (gate names removed, pointer only); (b) impl-critic tracker row now describes the two-step fix honestly, naming the false interim resolution. Mechanism confirmed: fix description written from commit intent, not artifact — diff contradicts the prose.

## §10 cl.5 prose incoherence introduced while fixing a cl.2 count violation
<a id="10-cl-5-prose-incoherence-introduced-while-fixing-a-cl-2-cou"></a>

Fix was straightforward; the targeted cl.2 removal left "are named" doubled, caught by independent agents (code-reviewer + doc-updater).

## §10 CI comment overstates harness redundancy — false for PRs adding new mutations.json files
<a id="10-ci-comment-overstates-harness-redundancy-false-for-prs-ad"></a>

Real reasons (worktree cost; slow; unit suite pins the logic) left in place.

## MUTATION: comment describes "passes silently" / "bypasses forEach" when mutation causes TypeError
<a id="mutation-comment-describes-passes-silently-bypasses-foreach-"></a>

(3+4) 71adf5b0: `caps-not-derived-from-limits` comment says "replace loop body with a literal Set" but mutation ADDS `caps.add(42)` inside existing loop (derivation preserved); `staged-rename-consumes-one-path` comment says "scopes the WRONG files at exit 0" but mutation causes a THROW via desync-detection branch, not a silent-scope-error. Tests go red in all cases (mechanism reachable) but the prose failure-mode accounts are wrong. Mechanism: description written from intent rather than traced from the encoded mutation's actual execution path.

## §10 "already lists its deletion set" overclaim in a new Decision entry
<a id="10-already-lists-its-deletion-set-overclaim-in-a-new-decisio"></a>

The finding rested on `grep -rn 'deletion set' .spec-workflow/` returning nothing — a phrase-grep, which cannot find a list that does not use the phrase. Lesson: grep the CLAIM, not its wording.

## §10 cl.2: rules-text names extent-quantifier targets as a closed list
<a id="10-cl-2-rules-text-names-extent-quantifier-targets-as-a-clos"></a>

Text: "the set of such words is OPEN, so cl.2 governs it: do not work from a list." Mirrors updated (coderabbit.yaml, crlocal.md ×2, coderabbit.md, tasks.md) — none repeats a closed word list.

## CR-local round-1 fixup on rules/docs-only commit: all checks pass
<a id="cr-local-round-1-fixup-on-rules-docs-only-commit-all-checks-"></a>

Four CR findings correctly applied: (1) insights.md waiver audit excluded .claude/hooks/ (fail-open — live waivers live there; CONFIRMED: check-prose-paths.mjs:71); (2) test-writer.md "every mutations file in this repo" was §10 cl.2 open-set; (3) docs/decisions.md footer was duplication only (decisions 65-71 still in body); (4) agent-workflow.md --diff-merges=first-parent implies -p confirmed by runtime — `git log --diff-merges=first-parent -S 'check-prose-paths' -- .claude/hooks/` shows patch body for non-merge commit aa26cf9d.

## §10 cl.2 fix for waiver audit's residue enumeration: all checks pass
<a id="10-cl-2-fix-for-waiver-audit-s-residue-enumeration-all-check"></a>

§10 cl.2 text verified in insights.md: "The classes below are ILLUSTRATIONS, not a closed list (code-style.md §10 cl.2)". No BLOCKING, no WARNINGS. Impl-critic ISSUE from f431ea74 cycle (agent-workflow.md "on this branch" at staged line 416) was fixed BEFORE f431ea74 landed — f431ea74 already carries "twice on feat/prose-path-guard" (confirmed: git show f431ea74 -- .claude/rules/agent-workflow.md produced output; grep at HEAD returns line 618 only, a general "in a commit on this branch" instruction, not the specific historical claim).

## False-claim fixup on prose-path-guard branch — four fixes, no new claims
<a id="false-claim-fixup-on-prose-path-guard-branch-four-fixes-no-n"></a>

Verified: (1) new prose-path-ok waiver in test header parses (WAIVER_RE matches, reason 150 chars, not in EMPTY_REASONS); (2) guard exits 0; (3) test suites 48 pass / 0 fail; (4) "ONE filesystem read" — confirmed: only resolves('docs/gone.md', INDEX) triggers existsSync, three resolves() calls total, the other two hit trackedSet/dirSet; (5) "every line that QUOTES this command" filter verified accurate against live grep output — dropped lines are prose/command-text, none are waivers; (6) docs/database.md --include='*.tsx' addition correct (open set, no tsx hits today).

## Pin ./-prefix normaliser test (63cf80c0)
<a id="pin-prefix-normaliser-test-63cf80c0"></a>

MUTATION verified by execution: removing `^\.\/` term → exactly 1 fail (line 157, normalise assertion) / 26 pass; no other test reddens; first-assertion claim confirmed. Test name clean (behavior-first). No absolute count in comment. Both suites pass (unit: 27/0, repo: 22/0).

## Pin unpaired-angle placeholder end-to-end + CR mirror (3846352f)
<a id="pin-unpaired-angle-placeholder-end-to-end-cr-mirror-3846352f"></a>

MUTATION comment verified accurate: removing `t.includes('<') || t.includes('>')` sends TRAIL-stripped `.claude/agents/<name` to 'unresolved'; test reddens. expectRed entries name the test correctly. .coderabbit.yaml mirror updated to name unpaired form.
