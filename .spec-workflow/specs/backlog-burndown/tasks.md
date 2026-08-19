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
- [x] Result: 134 → 111 open; ~91 real engineering queue

## PR 6 — backlog flow control  (branch `chore/backlog-flow-control`)

Closes #1222, #1232, #1231, #1164. One PR by user decision — all four touch
`agent-workflow.md` and trigger the same seven-mirror sync, so it is paid once.

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
- [x] Widen the seven-mirror table — this sweep found two surfaces it does not name:
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
- [x] impl-critic round 2 (cap reached; orchestrator resolved the residue directly) — 3 ISSUE +
      3 SUGGESTION, all applied. The first-illumination test was still fail-OPEN on one of the
      three failure modes its own prose claimed to cover: a non-empty unfiltered log proves the
      PATHSPEC but says nothing about the DATE, and `--since=zzz.months` / `--since=sixmonths`
      both return 0 lines at exit 0. Closed with a second fail-closed half — a repo-wide
      `--since` that must be non-empty (measured: 694 vs 0). Also: `fullpush.md`'s #1225 example
      contradicted `fullpush.md`'s own definition of "filed" (the section names 2, the example
      says 8 — so read literally #1225 PASSES), and `agent-critic.md` attributed the false
      "8 filed" claim to THIS commit when `git show a0e01943` puts it in the parent — a false
      provenance claim inside the clause that forbids false claims.
- [ ] learner on the completed cycle
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

## Remaining waves — 42 PRs over ~91 issues

Ordering and contents in the artifact above. Not started.

- [ ] W1 live defects — PR 1 (#1175, live-exploitable RLS) · PR 2 (#1169+#1170) · PR 3 (#991+#990)
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

- [ ] #1183 rotate the dead prod Supabase Management-API PAT (blocks post-deploy verification of
      every security migration, including PR 1)
- [ ] #1204 guarded `--sync-content` run + read-only prod probe before and after
- [ ] #1182 triage the SonarCloud dashboard; record keep-or-retire
