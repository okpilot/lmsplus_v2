# Tasks — Backlog Burndown (2026-08-19 →)

Origin: a verified triage of all 134 open issues against `origin/master` at `51863782`, run by
ten parallel agents reading source rather than issue text. Full report:
https://claude.ai/code/artifact/4cba1447-d9e7-4ea0-937d-f37598bf51be

**Standing directive for this program: NO DEFERRALS.** Every finding ends as APPLIED in a commit on
the branch, or SKIPPED with a written on-the-merits reason recorded here. Filing a new issue is not
an available disposition — see `feedback-no-deferrals-in-burndown` in project memory. The general
three-condition DEFER test in `agent-workflow.md § Apply-vs-Defer Discipline` is overridden, stricter,
for burndown work.

## Wave 0 — triage, no code

- [x] Verify all 134 issues against HEAD (10 agents; 18 close-now verdicts re-checked by hand)
- [x] Close 18 verified-dead, each with reproducible evidence in the closing comment
- [x] Migrate #185's research into #814 before closing it as a duplicate
- [x] File #1234 to carry #360's one real remainder (admin syllabus E2E spec)
- [x] Close 6 as won't-do (#450, #111, #891, #1037, #359, #1208), reasons recorded
- [x] Create `ops` + `product-decision` labels; apply to 12 non-engineering issues
- [x] Result: 134 → 111 open at run end (19:58Z). The engineering queue is a SEPARATE measurement
      taken later, not a subtraction from 111: 101 as of 2026-08-20T05:30Z, derived under
      "Remaining waves" from 113 open at that moment. (The bullets above name SUBSETS of the
      31 closures, not all of them — 18 verified-dead + 6 won't-do + #185, the rest being
      duplicates and already-fixed items closed without a named bucket. The 134 → 111 is a
      RUN-END snapshot and reconciles as: 134 open at 00:00Z, +6 filed before the run began
      (#1227–#1232) = 140 at the 11:11Z start, −31 closed +2 filed in-window (#1233, #1234)
      = 111 at 19:58Z. #1236 was filed at 20:14Z, after the run, taking the live count to 112.)

## PR 6 — backlog flow control  (branch `chore/backlog-flow-control`)

Closes #1222, #1232, #1231, #1164. One PR by user decision — all four touch
`agent-workflow.md` and trigger the same mirror sync, so it is paid once.

- [x] Cut branch from `origin/master` @ `51863782`
- [x] `ff9119fa` — stale bot exempts `ops` + `product-decision`
      impl-critic clean; 4 post-commit agents clean (1 SUGGESTION applied to the commit message:
      10 newly shielded, not 12 — #110 already had `security`, #1204 already had `bug`)
- [x] Create the `P0 - Critical` **label** — it was in `exempt-issue-labels` since the workflow was
      written with no matching label, so critical issues had zero stale protection. Nothing was ever
      wrongly closed (no issue carried a P-prefixed label), but the guard was inert. Found by
      validating a doc-updater finding rather than applying it.
- [x] Rewrite `.claude/rules/github-projects.md` labels section — real label set, the
      board-field-vs-label distinction that caused the above, the stale-bot skip list
- [x] Explore: map the mirror set for all four rule changes
- [x] Explore: map existing exemption mechanics + hook input contracts
- [x] Explore: exact insertion points + evidence verification for #1232/#1231/#1164
- [x] Draft the validated plan (files, impact, contracts, patterns, docs, security surface)
- [x] plan-critic: 2 coverage rounds (6 findings, all applied) + 2 stability rounds CLEAN — N=2 floor met at the 4-round ceiling
- [x] User decisions: one PR (not split); hook-based enforcement; DROP the numeric-literal sub-rules (#1222 AC#2)
- [x] `#1222 AC#2` — delete both numeric-literal sub-rules from `agent-doc-updater.md`; record the drop in `docs/decisions.md`
- [x] `#1222 AC#4` — round bound for comment-accuracy findings in `agent-critic.md` (pre-commit side)
- [x] `#1222` — no-executable-change oracle: BUILT (TypeScript-parser based, 44 tests), then
      **REVERTED**. Measured across the last 300 commits on master it would have fired ONCE (0.33%);
      204 of the 300 were `.md`-only, already covered by docs-only. **DO NOT REBUILD** — the full
      reasoning, including the three probed designs and the non-injective pre-order walk that was
      still open at revert time, is `docs/decisions.md` Decision 58.
- [x] `#1232` — aggregate defer budget + issues-closed-vs-filed line in `fullpush.md` step 8 table
- [x] `#1232` — reconcile `.claude/commands/coderabbit.md:83-87`, whose defer criteria already
      contradict `agent-workflow.md:397-405` today (pre-existing; found by this sweep)
- [x] `#1231a` — mutation-check DO bullet in `agent-test-writer.md`, pointing at `code-style.md` §7
      rather than restating it
- [x] `#1231b` — extend `agent-coderabbit-local.md` Pitfall #8 to absence-fabrication (CR asserting
      a guard is missing when it exists). NOTE: the issue claims #8 already covers repo-history
      fabrication — it does not; that is a tracker candidate only
- [x] `#1231c` — unverified-critic-claim clause in `agent-workflow.md § Finding Validation`
- [x] `#1164` — drop the unbacked "Promoted at learner count=2" from `CLAUDE.md:107`.
      DANGER: that exact string appears at `agent-workflow.md:314` and `:675` on unrelated,
      properly substantiated promotions. Edit `CLAUDE.md:107` only.
- [x] Widen the mirror table — this sweep found two surfaces it does not name:
      `.claude/hooks/*.sh` (two files that `echo` the pipeline) and `package.json`
- [x] Fix the learner tracker so #1164's claim is either backed or gone
- [x] impl-critic on staged changes
- [x] `a0e01943` post-commit cycle — test-writer clean; doc-updater 1 (stale `decisions.md`
      footer, applied); code-reviewer 1 WARNING (`fullpush.md` step 7 missed the aggregate budget,
      applied); semantic-reviewer **12 ISSUE + 3 SUGGESTION**, all validated and applied in the
      fixup — two live defer budgets with no precedence; "filed" undefined (2 / 7 / 8 depending on
      artifact); the predicate firing at 0/0; a FALSE "8 filed" attribution I wrote while rewriting
      that very section; first-illumination self-asserting and exempting PR #1225 itself; the
      comment-accuracy bound silent on the clean counter, self-inconsistent in scope, and
      suppressing §10's highest-yield case; `.coderabbit.yaml` pointed at the counts Decision 58
      just dropped; and de-counting the EXEMPTIONS having wrongly de-counted the four AGENTS
- [x] impl-critic round 2 on the fixup — **9 ISSUE + 3 SUGGESTION, all applied.** Four shared one
      root cause: the mirrors were written from memory of the new rule instead of from its text, so
      `>` drifted from `≥`, the `filed > 0` guard never reached the enforcement point, two mirrors
      still said "the budget is aggregate" after it became two checks, and `fullpush.md` said 7
      filed where the rule said 8. Also caught two NEW false claims in the fixes themselves —
      `wontfix` described as "the one default we actually use" (0 issues carry it) citing a section
      that says don't file at all, and #1219 called PR #1225's "headline finding" when its merge
      commit calls #1191 headline and #1219 "Second". And the first-illumination git test failed
      OPEN: an empty `--since` log is the PASS condition, so a typo'd pathspec granted the
      exemption silently — `git log --since=zzz.months` exits 0 with no diagnostic.
- [x] impl-critic round 2 residue, resolved by the ORCHESTRATOR — not a third critic run; `agent-critic.md` caps implementation-critic at 2 revision rounds and that cap was honoured — 3 ISSUE +
      3 SUGGESTION, all applied. The first-illumination test was still fail-OPEN on one of the
      three failure modes its own prose claimed to cover: a non-empty unfiltered log proves the
      PATHSPEC but says nothing about the DATE, and `--since=zzz.months` / `--since=sixmonths`
      both return 0 lines at exit 0. Closed with a second fail-closed half — a repo-wide
      `--since` that must be non-empty (measured: 694 vs 0). Also: `fullpush.md`'s #1225 example
      contradicted `fullpush.md`'s own definition of "filed" (the section names 2, the example
      says 8 — so read literally #1225 PASSES), and `agent-critic.md` attributed the false
      "8 filed" claim to THIS commit when `git show a0e01943` puts it in the parent — a false
      provenance claim inside the clause that forbids false claims.
- [x] `6d4aa646` post-commit cycle — test-writer clean (verified no executable file changed and no
      test parses the rule files; both hook suites 27/27 and 41/41); doc-updater clean across
      every row of the mirror table including the two executable `.claude/hooks/*.sh`; code-reviewer 0 BLOCKING /
      2 WARNING (the stop-rule mirror at `agent-workflow.md:630` left un-widened by the very commit
      that widened `CLAUDE.md` — Rule-Mirror Sync missed inside the commit widening the mirror
      table; and an ambiguous "false '8 filed' attribution" phrasing); semantic-reviewer
      **8 ISSUE + 5 SUGGESTION**, all applied. **No new false claims — the streak broke:** every
      added assertion verified true, including the 694-vs-0 measurement and all PR #1225 numbers.
      The residue was of a different kind, and its shape is the lesson: the parts made MORE
      rigorous (first-illumination, "filed") got exact commands and evidence tests, while the
      parts deciding WHEN TO STOP were left to judgment — the never-bounded false-claim class had
      no ceiling (reinstating PR #1185's unbounded chain by another route; now capped at 3
      follow-up commits then escalate), the refinement classification bought "validated skip"
      credit with no written basis while the same commit refused self-assertion from a
      first-illumination claim, and step 3 of the evidence test could not answer its own question
      (`--oneline` carries no file list, and docs-only is a whole-commit property while every
      command there is pathspec-filtered). Also: "filed" carried two incompatible definitions that
      diverge on THIS branch (#1233/#1234), the `gh issue list` command was day-granular and
      over-reported 8 rows where 2 are real, and the ratio check's source of truth does not exist
      on a first push.
- [x] impl-critic on the second fixup — 6 ISSUE + 9 SUGGESTION. **The streak restarted and was
      caught:** my fix to the false-claim finding introduced a fresh false claim — "The previous
      commit on this branch" was true when written and becomes FALSE the moment it is committed,
      because a durable rules file has no "now". Now names `a0e01943`. Worse, the ceiling I added
      to bound the false-claim chain **could not increment, for two independent reasons**: it fired
      on false claims in prose an EARLIER follow-up wrote, while the cited mechanism puts them in
      the CURRENT fix's own rewritten prose; and it keyed on "review-follow-up commit", a term
      whose own parent-ran-a-full-cycle condition means two consecutive ones cannot exist. It now
      counts the ACT, not the label, and includes the commit under review. Also: the single
      "filed" definition had reached 2 of 5 surfaces; `--state all` counted issues filed AND
      closed on the branch (39 rows vs 31) when the definition counts only those still open; the
      widened mirror carried the unbounded claim and none of the bound; and "inherits that term's
      evidence requirement in full" was false, since a refinement is correct on the merits and
      SKIPPED is reserved for wrong-on-the-merits.
- [x] impl-critic round 2 (cap reached; residue resolved by the orchestrator) — 4 ISSUE.
      **Two were measurements quoted next to commands that do not produce them** — a new defect
      shape, now in the tracker. `all returns 39 rows against open's 31` was measured on a
      four-days-wider window; on THIS branch both return 2, so the figure justified the flag change
      with a number that cannot show it (no figure is quoted there now). And `GitHub's created:>= is
      day-granular` was INVERTED — GitHub honours a full ISO timestamp, which is precisely why
      passing one fixes the over-report; the bare DATE is the day-granular form. Verified: 8 rows
      by date, 2 by timestamp. Third: the tightened `'"first-illumination:" in:body'` search does
      NOT discriminate — GitHub strips a trailing colon inside a quoted phrase (verified:
      `'"Closes:"'` and `'"Closes"'` return identical PRs, none containing `Closes:`), so the
      claim that it matches the claim LINE was false; it is now stated as a coarse filter needing a
      human read. Fourth: the stop-rule mirror re-keyed the cap on the unreachable
      review-follow-up LABEL that `CLAUDE.md` had just said it must not key on. Also trimmed
      `CLAUDE.md`'s cap paragraph — its two why-this-wording arguments moved to the commit message,
      which is what commit messages are for.
- [x] `387a29ac` post-commit cycle — test-writer clean (27/27, 41/41, 14/14); doc-updater clean
      across all 9 mirror rows; code-reviewer 0 BLOCKING / 2 WARNING; semantic-reviewer verdict
      **SHIP after one fixup** — 3 actionable, **8 bounded and stopped**. First live proof the
      bound is workable: the reviewer applied it to its own output, three findings survived the
      false-claim gate on merit and eight stopped without argument. It also RAN the ratio check
      end to end — filed 2, closed 4, so this branch clears both its own budgets — and traced the
      ceiling to confirm it terminates. The 5 findings applied here: `fullpush.md`'s worked
      example still computed under the RETIRED definition (PR #1225 filed 9, not 8 — `#1232`
      counts under "whatever its origin"; verified by running the command against #1225's own
      merge-base); the ratio command FAILED OPEN because `gh issue list` defaults to `--limit 30`
      and exits 0 truncated, under-counting `filed` and PASSING a check that should fail; "you
      paste command output, you do not argue" falsified by its own steps 3 and 4; the
      `agent-critic.md` footer contradicting the body the same commit wrote; and a THIRD
      self-invalidating reference ("the commit message for this change") in the commit that fixed
      that exact pattern one file over.
- [x] `2749e56e` cycle — test-writer clean; doc-updater clean (and it correctly held the "2 to 8"
      range in `agent-workflow.md` as HISTORICAL context while `fullpush.md`'s worked example moved
      to 9 — two different claims about the same PR, only one of which changed); semantic-reviewer
      **SHIP**, all 14 assertions re-derived by execution, **streak broken — first commit in the
      chain that did not create the defect it was fixing**. It also bounded a finding on the
      grounds that the SAME finding had been raised and bounded one round earlier, which is the
      rule stopping a real recurrence rather than a hypothetical one. code-reviewer 0 BLOCKING /
      3 WARNING.
- [x] **THE CAP FIRED.** `2749e56e` was chain commit 3 and code-reviewer's 3 findings were all in
      prose this chain wrote, so the rule refused a fourth fixup and escalated. User chose: apply
      the three, commit, run NO further cycle. Applied in `1c22b201`: the chain log had `387a29ac`
      filed ABOVE `6d4aa646` (reversed, in the one file an auditor reads to check the cap was
      honoured); `agent-workflow.md`'s footer described only the a0e01943 changes, omitting both
      `--limit 200` and the step-scoping; and the rule presented the ARTIFACT figure 8 as the
      filed count while its own command yields 9, with the divergence list omitting 9 entirely.
- [ ] learner on the chain
- [ ] coderabbit-sync (rules changed → mandatory trigger)
- [ ] PR-level semantic sweep against `origin/master...HEAD`
- [ ] `/crlocal` rounds (M=2, not a security path)
- [ ] `/fullpush` gates
- [ ] Push on explicit user approval; `/replycoderabbit` after the push

### Corrections to the issue bodies, verified — write from these, not from the issues
- **#1232** says PR #1225 closed 7 and filed 6, net −1. Closing 7 is verified. The merge commit's own deferral
  list names **7** filed; including the PR body's `## Deferred` it is **8** (#1224 appears in both).
  Net is 0 to +1 — the backlog did not shrink. The issue's own "net −1" has both operands wrong.
  The thesis holds and is stronger than stated.
- **#1231** says Pitfall #8 already covers repo-history fabrication. It covers fabricated *presence*
  only.
- **#1231§3** — the `createClient<` mis-claim was scoped to *scripts* in the commit message and that
  enumeration was correct; the unqualified repo-wide reading is what was false (`admin.ts:13` is a
  third live site). Do not write a worked example implying the scripts count was wrong.

## Remaining waves

(Issue counts move daily, so no UNTIMESTAMPED count is quoted here — the measurement below carries
its instant precisely so it reads as a reading, not a fact. Derive the engineering queue as open issues
minus the `ops` and `product-decision` labels, which mark work no PR can close:
`gh issue list --state open --limit 300 --json number,labels`. Measured 2026-08-20T05:30Z: 113 open,
8 `ops`, 4 `product-decision` → 101.)

(The numbering skips PR 7 and W2 — a gap, not a dropped wave. No total is stated here: it was "41"
and went stale the first time a PR entry inside a wave was struck through as done, in this same
file — no wave itself is complete. Count the unstruck PR entries below if you
need it. PR 6 is this branch, tracked in its own section above, and is not "remaining".
The plan is mutable: re-count from the list rather than trusting this line.)

Ordering and contents in the artifact above. Not started.

- [ ] W1 live defects — ~~PR 1 (#1175, live-exploitable RLS)~~ **DONE** (PR #1237, merged `a9767df5` 2026-08-20; db-deploy succeeded and production re-probed: 4 policies, all `cmd=SELECT`) · ~~PR 2 (#1169+#1170)~~ **DONE** (PR #1238, merged `86b08435` 2026-08-21; both
      issues verified CLOSED. CodeRabbit cleared its own CHANGES_REQUESTED to APPROVED once the finding
      was actually fixed and pushed — a dismiss was NOT needed, correcting the belief recorded earlier)
      · PR 3 — SPLIT THREE WAYS by risk surface: ~~3a (#1241, report item/question scale)~~ **DONE**
      (merged `970dabbf`) · **3b (#991) = NEXT** — admin non-MC session report; its two migrations
      (`20260824000100_get_admin_report_answer_keys`, `20260824000200_internal_exam_history_distinct_and_gates`)
      are WRITTEN but still UNTRACKED in the working tree. Scope is WIDER than #991's text: the admin
      query never selects `question_type`, and `apps/web/lib/queries/report-question-builder.ts:91` defaults a missing type to
      `multiple_choice`, so a non-MC question renders as an MC card with empty options — mis-TYPED, not
      just mis-counted. Migration PR ⇒ never auto-merged; user evals and merges · 3c (#990)
      · PR 4 (#1197) · PR 5 (#539)
- [ ] W3 session lifecycle — PR 8 (#1209+#1212+#1123+#1211) · PR 9 (#1205) · PR 10 (#548+#1012)
      · PR 11 (#1181+#1184)
- [ ] W4 quiz actions/queries — PR 12 (#1210+#1206) · PR 13 (#1122+#1187) · PR 14 (#1028) · PR 15 (#1213)
- [ ] W5 VFR RT — PR 16 (#1199→#1196) · PR 17 (#1192→#1193) · PR 18 (#1227+#1229+#1218)
      · PR 19 (#1216+#1045+#1094)
- [ ] W6 CI/types/scripts — PR 20 (#288+#1178+#1233+#1202) · PR 21 (#1195→#1230+#1224+#1228)
      · PR 22 (#1146+#591)
- [ ] W7 security hardening — PR 23 (#1024+#798+#1000) · PR 24 (#760+#813) · PR 25 (#847→#814)
- [ ] W8 rules/docs/memory — PR 26 (#1160+#1163+#1173+#1176+#1217) · PR 27 (#1114+#1115+#1116)
      · PR 28 (#1104+#988) · PR 29 (#1152)
- [ ] W9 test coverage — PR 30 (#1132+#1168+#1215+#1177) · PR 31 (#1159) · PR 32 (#1226)
      · PR 33 (#926, split first) · PR 34 (#1234)
- [ ] W10 admin polish — PR 35 (#1223+#854+#888) · PR 36 (#720+#894) · PR 37 (#1033+#1040) · PR 38 (#542)
- [ ] W11 large / decision-gated — PR 39 (#1165) · PR 40 (#1026) · PR 41 (#1106) · PR 42 (#558) · PR 43 (#403)

## Open decisions blocking scheduled work

- [ ] #1216 Part 3 exam blueprint — gates PR 19
- [ ] #1165 `rate-limiting.spec.ts` disposition — gates PR 39
- [ ] #1106 which of three start-block fixes — gates PR 41
- [ ] #1184 degrade option A/B/C · #1181 NULL-subtopic authorable? — gate PR 11
- [ ] #1192 DLG-35 pilot call — gates PR 17
- [ ] #1227 resolve-whole-scope vs fail-closed — gates PR 18
- [ ] #1033 UTC vs local · #1040 discarded-session semantics — gate PR 37
- [ ] #1000 harden five helpers or amend Decision 47 · #798 audit reactivation? — gate PR 23
- [ ] #1163 migration-text vs live catalog — gates PR 26
- [ ] #542 which readiness formula — gates PR 38
- [ ] #1177 run the SQL probe; if exploitable it leaves the test lane — gates PR 30

## User actions — no PR can do these

- [ ] #1183 rotate the dead prod Supabase Management-API PAT — **2 of 3 acceptance criteria now
      met** (2026-08-20): the token was rotated and a read-only probe returns rows, and
      `20260809000100`'s live policy set on `questions` was confirmed on production
      (`tenant_isolation` = SELECT, admin-gated INSERT/UPDATE, no DELETE policy). Remaining: a
      recorded decision on whether post-deploy catalog verification moves into `db-deploy.yml`.
      Note the assumed blocker does not exist — db-deploy already builds a SESSION-POOLER
      `DB_URL` from `SUPABASE_DB_PASSWORD` (pooler, not a direct connection — the workflow's own
      comment records that direct DB is IPv6-only on Supabase), so a `pg_policies` check needs no
      new secret
- [ ] #1204 guarded `--sync-content` run + read-only prod probe before and after
- [ ] #1182 triage the SonarCloud dashboard; record keep-or-retire
