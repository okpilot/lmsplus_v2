# Corpus Codification — Tasks

> Ordering is deliberate and was REVISED 2026-09-09 (user directive): enforcement of
> maintenance comes before archaeology deletion. Deleting 600 lines is a one-time win on text
> that is not decaying; an unenforced rule IS decaying. Enforcement compounds.

## Slice 0 — groundwork (COMPLETE)

- [x] `.claude/pipeline.json` + `.claude/pipeline.test.mjs` — pipeline facts as validated data
      (PR #1268, Decision 62). Deduped nothing by design; bought the ability to delete safely.
- [x] Settle the five policy contradictions needing a human call (PR #1269, Decision 63).

## Slice 1 — file-size limits (COMPLETE)

- [x] `.claude/limits.json` + `check-file-size-guard.mjs` + a mutation-pinned suite, split by
      concern across several files (in-process / subprocess / argument handling / the write path).
      Derive the set rather than counting it here — it grows whenever an addition pushes a suite
      into §1's extraction trigger, and every attempt to narrate that with figures has gone stale,
      including a "three to four" that was wrong by the next split and a "grown twice" that
      replaced it:
      `ls .claude/hooks/check-file-size-guard*.test.mjs`. No count stated:
      it is an open set (`code-style.md` §10 cl.2) and this line already went stale once —
      derive with `node --test .claude/hooks/check-file-size-guard*.test.mjs`. Note the glob:
      no dot before the `*`. `guard.*.test.mjs` needs a segment between the dots, so it silently
      skips the base suite and reports about half the tests — it stood here, and in the block
      below, offered as the exact derivation of a total it could not reach.
- [x] Ten prose copies → one source + one test-pinned mirror; 2 live drift bugs fixed (a
      invented blanket any-file rule that exists nowhere, and a suppression quietly raising the
      Server Action cap inside the enforcing agent)
- [x] Ratchet with a visible, shrink-only baseline; every mechanism mutation-pinned
- [x] Holes closed, each reproduced as a working exploit and re-run against the fix. No count
      here — this line said FIVE and was outrun by two later ones (path spelling, staged
      deletions) while being edited again in between. `git log --oneline
      0cbadf11..HEAD -- .claude/hooks/check-file-size-guard.mjs` is the SUPERSET to read from,
      not a count of holes: it lists every commit touching the guard, refactors and CR responses
      included, and the hole-closures are a subset you identify by reading them. There is no
      command that isolates them, which is the honest state of it. As of 2026-09-13 the set was:
      same-path content swap · a committed dangling symlink permanently unreadable ·
      a rename out of the rule class (`foo.ts` → `foo.test.ts`, action cap → test cap) ·
      `chmod 000` on one directory hiding nine baselined violators and reporting them RESOLVED ·
      a file named `--stats` in argv turning an enforcement run into exit 0 ·
      a tracked path git QUOTES (any non-ASCII byte, or a quote or backslash) read as its own
      escaped literal, unreadable, blocking every commit in the repo with no baseline row able to
      clear it · the same path read through a LOSSY utf8 decode, same outcome by a different door ·
      and grading the WORKING TREE while git commits the INDEX, so a file staged over its cap and
      then trimmed unstaged passed while the over-limit version was committed. That last one is
      fail-OPEN — as are the `chmod 000` and `--stats` entries above it, both of which also exit 0
      on a live violation; the first draft of this line called it "the only fail-open of the set"
      and its own list refuted it. Two of the three came from CodeRabbit (the quoting hole and the
      index one) after eight internal passes did not; the lossy decode came from semantic-reviewer,
      reviewing the fix for the first.
- [x] `--stats` and `--update-baseline` shipped; §10 clause 7 promoted and mirrored
- [x] Decision 65 recorded
      No counts stated here — this block went stale TWICE: written when two commits were done
      and calling it five, then frozen at five while the branch kept going (§10 cl.7). Stating a
      commit RANGE is the same defect as stating a count. `git log --oneline
      origin/master..HEAD` measures the BRANCH, which is wider than this slice — Slice 1 is
      closed and the BUILD ORDER items below it are also on the branch — so read it as the outer
      bound, not as Slice 1's own range. The suites and the compliance table are exact:
      `node --test .claude/hooks/check-file-size-guard*.test.mjs`,
      `node .claude/hooks/check-file-size-guard.mjs --stats`.

## BUILD ORDER — read this before picking anything up

Agreed with the user 2026-09-09. The order is the argument; do not reorder by "biggest number".

1. ~~**R0b-1 retracted-phrase check**~~ — **DONE** (Decision 66). Landed at `commit-msg`, not
   pre-commit: its only escape hatch is a `Retracted-ok:` trailer, and that is the sole stage
   holding both the message and the staged index. The "~40 lines" estimate here was wrong by an
   order of magnitude and is left visible rather than quietly edited — the fail-open catalogue
   alone exceeds it. Derive the real size with `wc -l .claude/hooks/check-retracted-phrase.mjs` —
   the IMPLEMENTATION, which is what the estimate was about. A `*` glob sweeps in the test suites
   and the testkit and answers a different question.
   The detector as specced BELOW (see R0b-1's original description) was refuted by measurement
   before a line was written: 18% of commits blocked, almost all noise, and it missed its own
   motivating instance. What shipped adds a rarity window, ticket/migration-number exclusions,
   an agent-memory exclusion on all three sides, and a hunk-level correction gate.
   Re-derive the calibration rather than trusting a number here — the harness is not committed,
   so this is a claim you must re-measure if you want to rely on it.
2. ~~**R0-VALUE** — canonical numbers restated in prose~~ — **DONE** (Decision 68). Landed as
   `.claude/hooks/check-prose-claims.mjs` at pre-commit and in CI, ratcheted against
   `.claude/prose-claims.json`, so the existing corpus is frozen rather than blocking — that part
   of the description held.
   **"Zero ambiguity: a value either matches a canonical source or it does not" did NOT.** It was
   the premise that made this look like the easy item, and measurement refuted it before the
   guard was tuned: the naive form floods, and three narrowings were each load-bearing — prose
   lines only (the largest noise class is `"max": <n>` in the hook suites' own fixtures, which is
   DATA, and §1's ban is on prose), context rather than a bare value, and a proximity bound
   (without it, long markdown table rows and SQL snippets put an unrelated number and an unrelated
   cap word on one physical line). Ambiguity was the whole job, exactly as R0-PATH predicts for
   itself.
   Two of the baselined lines are FALSE POSITIVES and are recorded as such rather than tuned
   away: `.claude/commands/insights.md`'s agent-MEMORY budget, which collides with a file cap,
   and a spec's size ESTIMATE for a migration. A guard that reaches zero false positives by
   narrowing until it catches nothing is the failure mode this programme exists to avoid.
   Re-derive the block rate with `node .claude/hooks/measure-prose-claims.mjs --commits 120`; the
   script is COMMITTED for that reason. The figure moves with the window — it read one value when
   the guard was built and a different one after the harness PR merged — so it is not stated here.
3. ~~**R0-PATH**~~ — **DONE** (`check-prose-paths.mjs`, Decision 71). Re-derive the funnel with
   `node .claude/hooks/measure-prose-paths.mjs`.
4. **R0b-2** — reject counts in commit messages (extend `check-commit-claims.mjs`). Small, and a
   commit message is the one surface that cannot be corrected afterwards.
5. **Slice 2's original three** — hook tests wired into CI, companion tests for new
   `_hooks`/`_utils`/`lib` files, baseline cannot grow. All one shape; build the shared harness
   HERE, not earlier. Rule of three.
6. ~~**Slice 3 archaeology deletion**~~ — **DONE** (PR #1299, `86f642780`). Ran FIRST per the directive below; 42,010 → 26,562 words.
7. **R0-ENUMERATION** — last. Noisiest detector; ships once the exclusion discipline is proven.

**Item 6 ran first** (user directive, 2026-09-16) and is DONE. Measured against PR #1295, the guard-building PR that prompted #1298: 14 commits vs 29, 7 review-driven fixups vs 21, 0 code defects vs ~8. Deletion is the only change shape whose review cost falls as the change grows.

**BEFORE any remaining item: issue #1298** (user directive, 2026-09-17) — CLOSED by Decision 73.
Then item 4, and the `MUTATION:` comment duplication in slice 2.

**Build the enforcer for the HIGHEST-count rows first.** The learner's tracker carries rules-file
claim rows that keep recurring and keep declining promotion, because the rule text they need
already exists. Derive the current set:

```bash
awk -F'|' '/RULE CANDIDATE/ && $3+0 >= 10 {printf "%3d  %s\n", $3, $2}' \
  .claude/agent-memory/learner/MEMORY.md
```

Five rows cleared 10 as of 2026-09-17, the largest at 55: *a fix commit correcting §10 violations
introduces fresh §10 violations.* The learner's verdict on the branch that produced Decision 73:
*the gap is execution, not missing rule text.*

No enforcer covers them. `check-retracted-phrase.mjs` matches STRINGS, so a paraphrase passes it —
the paraphrase-blindness `agent-workflow.md § Rule-Mirror Sync` records as OPEN.

Items 4, 5 and 7 are also mechanical — they enforce lower-count problems. Order by count.

**Drop CR-local to ROUND 1 only** — Decision 74. Rounds 2+ are code-reviewer + semantic-reviewer.
SWEPT 2026-09-17. Derive the set rather than quoting a figure — three reviewers categorised the
edge files three ways and returned three counts:

```bash
for f in $(git diff origin/master...HEAD --name-only -- . ':(exclude).claude/agent-memory'); do
  git diff origin/master...HEAD -- "$f" | grep -qE '^\+.*(CR-local|round 1 only|Decision 74)' && echo "$f"
done
```

An unplanned grep reached 14 files. A delegated impact analysis against the pre-change ref found
the rest, and the gate's own rounds found two more. The classes a grep cannot reach: the `.sh`
executable mirror (`cr-local-plan-reminder.sh` PRINTS the reviewer list to the operator), a
steering paraphrase (`later rounds the three that gate`), and a DRAFT spec outside the diff.
Enumerate against the ref, before editing; a worktree mid-sweep reports its own edits back.

**Owed once PR #1301 merges:** `lefthook install`, to drop the `.git/hooks/post-commit` shim the
removed stage leaves behind. Exits 0 if skipped.

## PARKED — nothing here is scheduled; each needs a user decision or a non-repo action

Not a backlog. An item leaves this list by being decided, not by ageing.

- **§10 cl.3 widening — awaiting the user.** cl.3 greps the retracted STRING; the proposal is to
  widen it to the retracted CLAIM. The learner row that motivates it is RULE CANDIDATE and still
  climbing, and no enforcer covers it — `check-retracted-phrase.mjs` cannot see a paraphrase
  (`agent-workflow.md § Rule-Mirror Sync` records paraphrase-blindness as OPEN). Derive the count:
  ```bash
  awk -F'|' '/section\/mirror\/arithmetic/ {print $2, $3}' .claude/agent-memory/learner/MEMORY.md
  ```
- **Learner rows awaiting promotion.** Route any promotion to a RULES PR — never onto a migration
  or security branch, which drags rule prose through a prod-deploy gate. The command below prints
  the whole RULE CANDIDATE set, not a shortlist; pick from it by count. Cite a row by its TEXT — a
  row's line number is unstable across curation
  (`.claude/agent-memory/learner/topics/cross-agent-lessons.md:1455`).
  ```bash
  awk -F'|' '/RULE CANDIDATE/ {printf "%3d  %s\n", $3, $2}' .claude/agent-memory/learner/MEMORY.md | sort -rn
  ```
- **#1204 — prod NOTAM answer key diverges from the repo.** `import-vfr-rt-content.ts
  --sync-content` owed. Source `.env.remote` first; `--force-remote` alone does not retarget the
  importer at prod.
- **`/app/internal-exam` spot-check owed.** PR #1257 changed `answered_count` retroactively and
  applied to prod 2026-09-06; the surface has not been looked at since.

**MEMORY.md compaction is CLOSED, and leaves no artifact here.** That file lives outside the
repository, under the Claude config directory — it is not committable from this repo, so its state
is not derivable from this tree and no commit records it.

## Slice 2 — enforce the rules that keep the system maintainable (NEXT)

Full plan drafted 2026-09-09. All three are one shape — build a shared harness
(`check-companion-file.mjs` + config), not three programs.

- [x] **`--update-baseline` flag on the file-size guard.** SHIPPED EARLY in slice 1
      (`63c2356d`) — the guard's own error message already pointed at it, so the choice was
      implement it or delete a false claim. Without it,
      slice 1's exact-match ratchet fails CI on every legitimate shrink and gets disabled.
      Human-invoked; must never self-rewrite silently.
- [x] **Commit the mutation harness.** DONE 2026-09-14 (Decision 67) — `run-mutations.mjs` +
      `<guard>.mutations.json` data + a throwaway worktree. Re-derive any figure with
      `node .claude/hooks/run-mutations.mjs`; `--coverage` shows the encoded-vs-claimed gap.
      Executing the claims refuted claims in every file that carried them, found one test
      pinning nothing and one mechanism (the 20-char waiver floor) pinned by nothing; all fixed
      on the branch. No total is stated — an earlier draft said SEVEN and its own enumeration
      summed to eight. Re-derive with `node .claude/hooks/run-mutations.mjs` and the commit history of PR #1276, which is where they were found (a POINTER, deliberately not a `git log -p 16d62fec..` command: an unpinned range resolves to whatever HEAD is when you run it and stops reproducing, and the bound that would fix it — the merge commit — does not exist while the PR is open. The runnable half is the harness command above; this half is for reading, and says so).
      ORIGINAL ENTRY BELOW, kept because it names the defect this closed:
      **Commit the mutation harness.** Every commit in slice 1 asserts "N mutations run, N
      caught"; reviewers flagged TWICE that the figure is unverifiable, because the harness
      lives in the scratch directory and is deleted. That is the same unfalsifiable-claim class
      the slice exists to remove, in the slice's own commit messages. Either commit it as a
      dev script with the mutations as data (re-runnable, so the claim is checkable), or stop
      stating a number. Do not keep asserting an unverifiable count.
- [x] **`--update-expected` on the mutation harness.** Same shape, and same rationale, as
      `--update-baseline` on the file-size guard: adding a test to a suite can invalidate the
      `expectRed` of every existing entry whose break also reddens it, and four entries needed
      hand-widening on the harness's own branch within one commit of each other. A check that is
      laborious to keep current gets disabled — that is recorded in the design as the single
      biggest risk to this programme. MUST be human-invoked and write the diff for review; a
      harness that rewrites its own expectations launders them. Re-derive the current pressure
      with `node .claude/hooks/run-mutations.mjs` and count the MISMATCHes.
      **Using it on a NEW entry** — write `"expectRed": ["__DERIVE_a3f91c7e__"]` and run
      `--update-expected [--guard <basename>]`. Then
      `grep -n '__DERIVE_a3f91c7e__' .claude/hooks/*.mutations.json` must be empty before commit.
      **What it refuses.** It will not run at all while the target or a declared suite is
      uncommitted: the grading run reads HEAD, so the set written would be the old one. It
      never writes for a SURVIVED entry, whose observed set is empty — that is a defect in the
      MUTATION, not a stale expectation. A `find` matching nothing does not reach either path:
      `assertSingleOccurrence` throws, the mutation is a FAULT, and one fault anywhere in the
      batch is exit 2 with nothing written.

- [x] **Stop a fixup commit from forcing a second full cycle.** CLOSED by Decision 73: a fixup
      commit triggers nothing; the next gate ROUND re-reads it.

- [ ] **Cap the injected rules corpus, shrink-only.** `CLAUDE.md` plus `.claude/rules/**` loads
      into every session and is inherited by every agent dispatch, so its size is a per-invocation
      cost and its staleness steers work that never needed the rule. It is the one corpus with no
      cap, while `.claude/limits.json` already ratchets every FILE in the repo. Same mechanism, new
      shape: an AGGREGATE rule over a file SET rather than a per-file cap. Derive the baseline at
      the commit that ships this (`wc -l CLAUDE.md .claude/rules/*.md`) and store it in the data
      file — the only copy that is executed; do not write the figure into prose here, which is the
      defect `check-prose-claims.mjs` exists to block. Shrink-only: the total may fall and the
      baseline moves down under `--update-baseline`; growth BLOCKS. A cap is what turns "add a
      paragraph" from free into a trade-off, and a trade-off is the only thing that has ever
      stopped accretion. Pairs with the delete-on-ship condition — a commit adding a mechanical
      check must delete the prose that check replaced, or the corpus carries both forever, which is
      what happened when `check-prose-paths.mjs` shipped and the prose about it grew.

- [x] **Encode the `MUTATION:` comment, or declare it unencodable.** Only the data file is
      executed, so a prose copy is free to go false — the defect class `code-style.md` §7 governs.
      **Deleting the comments is NOT the remedy:** a claim encoded nowhere has the comment as its
      only record, and `--list` prints mutation IDS ONLY.
      A comment names the mutations that grade it with `// GROUP: <id>, <id>`; an id naming no
      mutation exits `--coverage` non-zero and aborts the grading run. `notEncoded` declares a
      token that is NOT a claim, carrying both a non-empty `claim` and `why` (`validateDataFile`
      requires both). Derive, never state:
      `node .claude/hooks/run-mutations.mjs --coverage` (Decision 75).

- [ ] **R0 — STALE-CLAIM GUARD. The highest-priority item in the programme.**
      User directive 2026-09-09: correcting prose that has gone stale is the single largest
      ongoing cost — "three weeks of correcting prose only because of this". Widened the same day
      from values-only to paths and enumerations: "fix it as hard as we can".

      **Why a check and not a rule — the archaeology, since a wrong citation here would be this
      very defect.** `code-style.md` §1's "Never restate a number here" was introduced in
      `7ca1f522` — and BROKEN IN THAT SAME COMMIT, which hardcoded cap literals into the guard
      and its tests. They were swept out of six files in `54fb4c6b`, whose own message records
      that the sweep REINTRODUCED the identical defect twice, inside the comment being used to
      remove it. A separate rule, §10 cl.7 ("Recompute any count, and test any EXTENT QUANTIFIER, as the LAST authoring step"),
      was authored later in `63c2356d` and had its own breakage: the spec's Slice-1 block written
      at commit 2 of 5, corrected in `f50619c1`.
      Four instances, two rules, one session, all by the author while actively trying to comply —
      and the first was violated by the diff that created it. A rule the person who just wrote it
      cannot follow in the same commit is not a rule.
      (This paragraph originally cited §10 cl.7 for the six-file sweep. Wrong rule — caught by
      implementation-critic running `git log -S` on both rule texts. A false citation inside the
      entry proposing a guard against false citations; left recorded rather than quietly fixed,
      because it is the strongest evidence in the entry.)

      **The governing distinction, which is what makes this tractable:**
      prose stating WHAT goes stale; prose stating WHY does not. Every failure in this slice was
      a WHAT — a number, a filename, a count, a commit range. Nothing that stated a REASON went
      stale. The guard therefore targets WHAT-claims only and must never touch rationale prose.

      **Architecture: the file-size ratchet, applied to prose.** Same shape, already proven —
      `.claude/prose-claims.json` holds the baseline, the guard blocks a NEW bad claim, and the
      frozen list may only shrink. This is what converts an unbounded backlog into a finite one.
      Diff-scoped alone is not enough: it stops the bleeding but leaves the existing prose
      unmeasured, so nobody ever knows how much is wrong.

      **Three detectors, each independently mutation-pinned:**
      1. **VALUE** — a canonical value (`limits.json` `rules[].max`; later any registered source)
         restated in prose in a matching context ("N lines", "N-line", "cap ... N").
         Allow: the canonical file, a mirror a test pins, and data lines — the ban is on PROSE.
      2. **PATH** — a file path written in prose that does not resolve on disk. BUILT
         (Decision 71).
      3. **ENUMERATION** — "all ten", "the eight", "both", "three of", "N of M". Flags the
         PATTERN and demands either a derivation command in the same block or an explicit as-of
         date, which is `code-style.md` §10 cl.2 made mechanical. Highest false-positive rate of
         the three; ship it last and behind its own baseline.

      **The escape hatch must COST something.** An inline marker requiring a written reason, not
      a silent disable — visible in the diff, greppable, and auditable by `/insights`. A free
      suppression is used reflexively and the guard dies.

      **Honest bounds, stated because understating them would be this very defect:**
      it catches a path that does not resolve, NOT a path that resolves while the claim about it
      is false. It catches a count-shaped phrase, NOT whether that set is genuinely open. It says
      nothing about WHY-prose, deliberately. It reduces the class; it does not close it.

      **Mutation checks owed:** a prose literal is caught · a data line is not · a pre-existing
      baselined claim does not block · a new bad path is caught · a glob is not flagged as a
      missing path · an enumeration with a derivation beside it passes · one without does not ·
      the guard fails CLOSED when its config or the canonical source is unreadable · the baseline
      cannot grow silently.

- [ ] **R0b — AUTHORING-TIME GUARDS. The other half of R0, and the one the user actually asked
      for: not "find stale claims in the corpus" but "stop me making today's mistakes again".**

      **The evidence, from one session.** Every mechanism that worked fired AT THE MOMENT of the
      mistake, unprompted, at zero cost: the `.coderabbit.yaml` pin test went red about a minute
      after the cap was changed without its mirror; the file-size guard rejected its own test
      file twice. Everything else — implementation-critic, CR-local, the PR sweep — caught things
      10 to 40 minutes later, each costing a full round. Re-reading my own work caught NOTHING,
      which `code-style.md` §10 cl.5 already concedes: re-reading finds incoherence, only
      re-deriving finds a claim that is coherent and false. Design for immediacy, not diligence.

      **R0b-1 — RETRACTED-PHRASE CHECK. Highest value; §10 cl.3 made mechanical. SHIPPED —
      see BUILD ORDER item 1 above and Decision 66; the design below is the ORIGINAL proposal,
      kept because measurement refuted parts of it and that is the useful record.**
      If a commit REMOVES a distinctive phrase from one tracked file and that phrase still exists
      in another tracked file, block. Directly attacks "fixed the instance, not the class", which
      happened THREE times in this slice alone: a stale `1807` corrected in one file and left in
      its sibling; a `502 of 553` ratio likewise; a wrong test filename corrected in
      `.coderabbit.yaml` while two other files kept it. Every one cost a reviewer round; every one
      is a two-line grep. Runs at pre-commit off `git diff --cached`. Needs a minimum phrase
      length and a stop-list so common wording does not fire.

      **R0b-2 — NO COUNTS IN COMMIT MESSAGES.** Extend `check-commit-claims.mjs`. Four figures in
      one message of this slice were measured before that same commit's remaining edits landed,
      making them stale ON ARRIVAL while reading as verified. A commit message cannot be
      re-derived later, so the number should not be there at all: name the derivation instead.
      Same rule already applied to `limits.json`; the message is the surface that escaped it.

      **R0b-2 evidence, 2026-09-15 (`docs/recover-question-images-decision`).** Recurred, and
      the shipped FILE was correct — only the message was wrong: "named three locations; there
      are now five" against a list holding six, because the two figures counted different bases.
      Caught by semantic-reviewer, one round late, and fixed by amending an unpushed message. The
      shipped Decision entry NAMES its mirrors and states no total, which is why every reviewer
      passed it on §10 cl.2. That contrast is the argument for R0b-2: the discipline already
      applied to the artifact, and the message is the surface that escaped it.

      **R0b-3 — EDIT WITH A TOOL THAT FAILS LOUDLY.** Behavioural, not a hook, and stated because
      it bit: a `s.replace()` in a script silently no-ops when the anchor is absent. That is
      exactly how a "fixed" misquote survived an entire commit in this slice and had to be found
      by a reviewer two commits later. Prefer the editor tool, which errors on a missing anchor;
      where a script is genuinely needed, ASSERT the anchor before writing. Cheap to state,
      impossible to enforce mechanically, and worth writing down because the failure is SILENT.

      **R0b-4 — NORMALIZE WHITESPACE BEFORE MATCHING (`check-mirror-sync.mjs`).** New mechanism,
      learner count=1, 2026-09-15. A parity check for a clause present in `.coderabbit.yaml`
      reported it ABSENT: the wording is identical APART FROM WHITESPACE but folded across two
      lines inside a YAML block scalar, and a single-line grep cannot see it. Not byte-identical —
      folding inserts a newline and the block's indentation, which is precisely why normalizing
      whitespace before matching is the fix. DISTINCT from the paraphrase-blindness
      `agent-workflow.md § Rule-Mirror Sync` already concedes as OPEN — that one is about text
      that DIFFERS; this is text that MATCHES and is invisible anyway, so it is mechanically
      fixable where paraphrase-blindness is not. The failure direction is the dangerous one: it
      reports a mirror MISSING when present, so the natural response is to add a duplicate.
      Fix: normalize runs of whitespace (newlines included) in both haystack and anchor before
      comparing. Scope: `check-mirror-sync.mjs` plus a pinned mutation in its test suite — a
      wrapped-YAML fixture that goes red if the normalization is removed. Do it in the slice that
      next touches that hook; not worth its own PR.

      **What this cannot do.** None of it makes the author reliable. It makes the failure loud and
      immediate instead of expensive and late — which, measured on this session, is the whole
      difference between a five-second correction and a five-to-one round ratio.

- [ ] R1: every `*.test.*` under `.claude/hooks/` is referenced in `ci.yml`. Currently a
      COMMENT telling a human to run `find`; has already failed once (3 unwired files until
      2026-09-02). Measured 2026-09-09: 10/10 wired, so it lands clean, no baseline needed.
- [ ] R2: every new file in `apps/web/**/_hooks/`, `**/_utils/`, `apps/web/lib/**`, or
      `.claude/hooks/*.mjs` has a co-located test. Source: `code-style.md` §7, unenforced.
      MUST be diff-scoped + grandfathered (`check-test-title-leakage.mjs` pattern).
- [ ] R3: `.claude/limits.json` `baseline` never GROWS vs `origin/master`.
- [ ] Delete the prose those three replace, including the `ci.yml` comment.

### Rejected proposals — recorded so they are not re-raised each slice

- **Key the ratchet baseline on `path + content-hash`** (learner, 2026-09-09, count 2). The
  diagnosis is right — a path-keyed baseline is defeatable by content swap and by rename — but
  the remedy costs more than it saves: a hash invalidates the row on ANY edit, so touching a
  grandfathered file at all would fail CI. Both observed instances are already closed by the
  exact line-count match plus blocking on a stale row. Residual and ACCEPTED: a different file
  at the same path with a coincidentally identical line count inherits the old allowance.

## Slice 3 — archaeology deletion (DONE, PR #1299 / `86f642780`)

Corpus 42,010 → 26,562 words (−37%). Re-derive, pinned — `HEAD` drifts:
```sh
for rev in 86f642780^ 86f642780; do
  { git show "$rev:CLAUDE.md"
    git ls-tree -r --name-only "$rev" .claude/rules/ |
      while IFS= read -r p; do git show "$rev:$p"; done
  } | wc -w
done
```

### The classification every line in the corpus is sorted by

Agreed with the user 2026-09-16. Sort each line into ONE row, then put it where the row says. A
line that fits no row is garbage and is deleted.

| Type | What it is | Where it lives |
|---|---|---|
| **Check** | A rule that is mechanically testable | `.claude/hooks/` + its data file. The rules corpus carries a POINTER, never a restatement |
| **Rule** | "Always do X / never do Y", not yet checkable | The rules corpus: short, commanding |
| **Reason** | Why the rule exists | A decision record, linked from the rule only when a reader would otherwise re-derive it wrong |
| **Reference** | How the system works — data models, domain knowledge | `docs/`, loaded when the task needs it |
| **Code comment** | Why THIS line is odd | In the code, and only there. Never promoted to a rule |
| **Judgment** | Convergence timing, PR-split calls, deferral honesty | One explicitly NON-BINDING doc, loaded on demand. Named here because `## Never` says these cannot be codified, and text with no home leaks back into the rules corpus — which is where it sits today |
| **History** | "We changed this because last week…" | Nowhere. `git log` already has it. Delete |

Two clauses that make the table survive contact:

1. **A rule that CAN be a Check must not stay prose.** Without this the table is a filing system;
   with it, it is a ratchet.
2. **Mechanism yes, justification no.** "No explanations" is refuted by this repo:
   `agent-workflow.md § State the MECHANISM behind a constraint` exists because a critic reasoned
   AROUND a bare prohibition and produced a CRITICAL argued from the weakest source. Keep the
   clause that changes what a reader would DO ("local grants drift ADDITIVELY"); delete the
   promotion story around it. One clause, not a paragraph.

- [x] All 16 files swept in one PR. Measure per file with
      `for f in CLAUDE.md .claude/rules/*.md; do echo "$f $(wc -w < "$f")"; done`.

### Carry-forward safeguards (the seven losses are recorded in `docs/decisions.md` Decision 72)

- [ ] **Before deleting a date-stamped sentence, check whether it is a SCOPE sentence.** Two of the
      seven were deleted because they carried a date and read as archaeology; both bounded a rule's
      applicability. Grep candidates before cutting:
      `grep -inE 'applies to|onward|pre-existing|existing|grandfathered|exempt|unless|only when' <file>`
- [ ] **Re-read every CONDENSED multi-clause sentence against the original, clause by clause.** Four
      of the seven survived a full agent cycle, 452 green tests, a 205-clause keyword check and a
      pointer audit — all of which pass on a sentence that lost a qualifier. Only reading the diff
      against the original found them. No grep substitutes for this.
- [ ] **A comment-accuracy FIX is the highest-risk site for a new false claim** (`agent-critic.md`).
      Three consecutive review rounds each narrowed a quantifier in one sentence this PR rewrote,
      and each narrowing was correct. Budget for it; do not treat a fix as terminal.

## Slice 4+ — remaining codifiable rules

- [ ] `code-style.md` §3 function rules (max lines / params / nesting) — same machinery as
      slice 1; standard lint rules. ~68 lines of prose.
- [ ] `github-projects.md` — ~123 lines, almost entirely DATA (field IDs, a label list that
      already says `gh label list` is the source of truth).
- [ ] `code-style.md` §4 — naming conventions, no barrel files (~62)
- [ ] `code-style.md` §5 TypeScript — the largest section (301 lines), ~60% checkable.
      Several already checked (soft-delete guard, `noExplicitAny`, S6759).
- [ ] "New Supabase Query Sites Require an Integration Test (HARD, #925)" — its own slice;
      needs `.from()`/`.rpc()` detection and has ~40 known-uncovered sites (#926).
- [ ] Retrofit slice 1's guard onto the shared harness — ONLY after slice 2 proves it.
- [ ] Parallelise the mutation harness — `modeRun` is a sequential `for`, one `git worktree
      add`/`remove` per mutation, so the run is serialisable. Derive both sides before deciding:
      `time node .claude/hooks/run-mutations.mjs`
      `grep -n 'timeout-minutes' .github/workflows/ci.yml`

## Slice N — the 22 remaining contradictions

- [ ] Worklist is the memory note `reference-corpus-contradictions.md` (23 rows, row 23
      REFUTED, several settled by Decision 63). Do this LAST, on text no longer about to be
      deleted. Treat every row as a LEAD requiring verification, never a finding.

## Never
- [ ] ~~Enforce judgment~~ — convergence timing, PR-split calls, deferral honesty, whether a
      test is any good. These stay prose, and get shorter as the noise around them goes.

## Carried in from PR #1295 (CR review `5225443322`, verified 2026-09-16)

- [ ] `docs/database.md:554` — "**All** read-path callsites now query this view" is a universal
      quantifier its OWN derivation two lines below falsifies (§10 cl.7). The grep at L562
      excludes `.test.` but not `.spec.`, so it returns 5 files against 4 bullets —
      `apps/web/e2e/redteam/flag-idor.spec.ts` is unlisted. Fix the quantifier or widen the
      exclusion; ~2 lines. CR flagged this range for a DIFFERENT and false reason (it asked for a
      derivation that L561 already carries).
- [ ] `.claude/commands/insights.md:43-44` — four non-waiver residue categories named inline
      before "is an OPEN set". cl.2 permits members "as explicit ILLUSTRATIONS"; the word is
      absent. Cosmetic — fold into Slice 3 when this file is read end-to-end, not on its own.
- [x] SKIP precedent for Slice 3: CR asked to delete `.claude/agents/test-writer.md:102-104` and
      `109-110` as RULE 0 rationale. They are MECHANISM, which
      `agent-workflow.md § "State the MECHANISM behind a constraint"` mandates. Slice 3's
      classification must not read a mechanism clause as archaeology — the tell is whether the
      sentence says WHY THE HABIT FIRES (keep) or WHAT HAPPENED ONCE (delete).

## Slice N — mechanical enforcer for §10 cl.8 (the correction-introduces-a-new-claim class)

Learner tracker row "Fix commit correcting §10 violations introduces fresh §10", count **68**,
still RULE CANDIDATE. `code-style.md` §10 cl.8 states it in prose and it keeps recurring — the
count is the evidence prose is not the lever. Rule text is NOT the deliverable here.

What has actually caught an instance: `check-retracted-phrase.mjs` (the cross-file subset), and
`run-mutations.mjs` reporting a SURVIVED entry. Nothing caught the coherent-but-false replacement
sentence. That residue is not decidable in general; the encodable subsets are.

- [ ] Enumerate the class from history first, do not design from the rule text. Derive the
      candidate commits: `git log --oneline --all --grep='^fix(' -- .claude/ docs/` crossed with
      commits whose own follow-up retracted a claim they introduced. Classify each into
      mechanically-detectable vs judgment-only, and record the split — the ratio decides whether a
      guard is worth building at all.
- [ ] For each detectable subset, name the trigger and the false-positive cost BEFORE writing a
      hook. Two leads, neither yet verified: (a) a commit whose message declares a correction
      (`fix(`, `correct`, `retract`) and whose diff adds a claim sentence with no accompanying
      derivation command anywhere in the hunk; (b) a `+` line reinstating a token the SAME commit
      retracts elsewhere — the intra-commit companion to `check-retracted-phrase.mjs`, which today
      only sees the replacement hunk.
- [ ] Whatever ships is encoded in `<guard>.mutations.json` and graded by `run-mutations.mjs`
      before it is wired into `lefthook.yml` — a guard the harness does not grade is the thing this
      programme exists to prevent.
- [ ] Close the tracker row to PROMOTED only once the enforcer is graded green, not when the hook
      is written.
