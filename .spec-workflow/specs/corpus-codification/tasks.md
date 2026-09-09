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
      concern across three files (in-process / subprocess / the write path). No count stated:
      it is an open set (`code-style.md` §10 cl.2) and this line already went stale once —
      derive with `node --test .claude/hooks/check-file-size-guard.*.test.mjs`.
- [x] Ten prose copies → one source + one test-pinned mirror; 2 live drift bugs fixed (a
      invented blanket any-file rule that exists nowhere, and a suppression quietly raising the
      Server Action cap inside the enforcing agent)
- [x] Ratchet with a visible, shrink-only baseline; every mechanism mutation-pinned
- [x] FIVE holes closed, each reproduced as a working exploit and re-run against the fix:
      same-path content swap · a committed dangling symlink permanently unreadable · a rename
      out of the rule class (`foo.ts` → `foo.test.ts`, action cap → test cap) · `chmod 000` on one
      directory hiding nine baselined violators and reporting them RESOLVED · a file named
      `--stats` in argv turning an enforcement run into exit 0
- [x] `--stats` and `--update-baseline` shipped; §10 clause 7 promoted and mirrored
- [x] Decision 65 recorded
      Five commits, `7ca1f522`..`0cc1a4bb`. No counts stated here — this block already went
      stale once by being written at commit 2 of 5 (§10 cl.7). Derive: `git log --oneline
      7ca1f522^..0cc1a4bb`, `node --test .claude/hooks/check-file-size-guard.*.test.mjs`,
      `node .claude/hooks/check-file-size-guard.mjs --stats`.

## BUILD ORDER — read this before picking anything up

Agreed with the user 2026-09-09. The order is the argument; do not reorder by "biggest number".

1. **R0b-1 retracted-phrase check** — ~40 lines, pre-commit. Cheapest item on the list, and it
   attacks a failure that recurred THREE times in slice 1 and is already logged in user memory as
   having cost five CR rounds on an earlier PR. Best ratio available; introduces no new concept.
2. **R0-VALUE** — canonical numbers restated in prose. Zero ambiguity: a value either matches a
   canonical source or it does not. On the ratchet, so the existing corpus is frozen, not blocking.
3. **R0-PATH** — the exclusion set is the real work (illustrations, context-relative paths,
   placeholders, globs). ACCEPTANCE TEST ALREADY MEASURED: it must land near the low tens on the
   binding surface. A first probe said 1,655 and a second 95, both wrong — one truncated every
   `.claude/` path, the other truncated `.tsx` to `.ts` and `.json` to `.js`. A detector reporting
   wildly outside the measured range is broken, and that is knowable in seconds.
4. **R0b-2** — reject counts in commit messages (extend `check-commit-claims.mjs`). Small, and a
   commit message is the one surface that cannot be corrected afterwards.
5. **Slice 2's original three** — hook tests wired into CI, companion tests for new
   `_hooks`/`_utils`/`lib` files, baseline cannot grow. All one shape; build the shared harness
   HERE, not earlier. Rule of three.
6. **Slice 3 archaeology deletion** — the large size win, no new machinery, pure deletion.
7. **R0-ENUMERATION** — last. Noisiest detector; ships once the exclusion discipline is proven.

**Why not delete first, since that is the biggest number.** Deletion is a ONE-TIME win on text
that is not decaying. Items 1-4 stop the bleeding, and the bleeding is the recurring cost — a
measured five-to-one ratio of stale-claim findings to real runtime defects across slice 1. Once
the guards exist, slice 3 is safe at any pace and gets easier, because less prose remains making
checkable claims at all.

## Slice 2 — enforce the rules that keep the system maintainable (NEXT)

Full plan drafted 2026-09-09. All three are one shape — build a shared harness
(`check-companion-file.mjs` + config), not three programs.

- [x] **`--update-baseline` flag on the file-size guard.** SHIPPED EARLY in slice 1
      (`63c2356d`) — the guard's own error message already pointed at it, so the choice was
      implement it or delete a false claim. Without it,
      slice 1's exact-match ratchet fails CI on every legitimate shrink and gets disabled.
      Human-invoked; must never self-rewrite silently.
- [ ] **Commit the mutation harness.** Every commit in slice 1 asserts "N mutations run, N
      caught"; reviewers flagged TWICE that the figure is unverifiable, because the harness
      lives in the scratch directory and is deleted. That is the same unfalsifiable-claim class
      the slice exists to remove, in the slice's own commit messages. Either commit it as a
      dev script with the mutations as data (re-runnable, so the claim is checkable), or stop
      stating a number. Do not keep asserting an unverifiable count.
- [ ] **R0 — STALE-CLAIM GUARD. The highest-priority item in the programme.**
      User directive 2026-09-09: correcting prose that has gone stale is the single largest
      ongoing cost — "three weeks of correcting prose only because of this". Widened the same day
      from values-only to paths and enumerations: "fix it as hard as we can".

      **Why a check and not a rule — the archaeology, since a wrong citation here would be this
      very defect.** `code-style.md` §1's "Never restate a number here" was introduced in
      `7ca1f522` — and BROKEN IN THAT SAME COMMIT, which hardcoded cap literals into the guard
      and its tests. They were swept out of six files in `54fb4c6b`, whose own message records
      that the sweep REINTRODUCED the identical defect twice, inside the comment being used to
      remove it. A separate rule, §10 cl.7 ("recompute any count as the last authoring step"),
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
      2. **PATH** — a file path written in prose that does not resolve on disk. The strongest
         detector: a path either exists or it does not, so there is no judgment and no LLM.
         Would have caught the `check-file-size-guard.test.mjs` misattribution three times in
         this slice, instantly. Needs care for globs, patterns, and paths naming things that do
         not exist yet.
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

      **R0b-1 — RETRACTED-PHRASE CHECK. Highest value; §10 cl.3 made mechanical.**
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

      **R0b-3 — EDIT WITH A TOOL THAT FAILS LOUDLY.** Behavioural, not a hook, and stated because
      it bit: a `s.replace()` in a script silently no-ops when the anchor is absent. That is
      exactly how a "fixed" misquote survived an entire commit in this slice and had to be found
      by a reviewer two commits later. Prefer the editor tool, which errors on a missing anchor;
      where a script is genuinely needed, ASSERT the anchor before writing. Cheap to state,
      impossible to enforce mechanically, and worth writing down because the failure is SILENT.

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

## Slice 3 — archaeology deletion (pure deletion, no checks to write)

Largest size win in the programme; ~500-700 lines, one PR, no new machinery.

- [ ] `code-style.md` §8 — restates §1-§7 (~21 lines)
- [ ] `agent-workflow.md § Orchestrator Role` — restates the sections above it (~46)
- [ ] `agent-workflow.md` pipeline-order prose — facts already in `pipeline.json` (~167)
- [ ] `.claude/agent-*.md` precedent narratives → `docs/decisions.md` + git history (~450)

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

## Slice N — the 22 remaining contradictions

- [ ] Worklist is the memory note `reference-corpus-contradictions.md` (23 rows, row 23
      REFUTED, several settled by Decision 63). Do this LAST, on text no longer about to be
      deleted. Treat every row as a LEAD requiring verification, never a finding.

## Never
- [ ] ~~Enforce judgment~~ — convergence timing, PR-split calls, deferral honesty, whether a
      test is any good. These stay prose, and get shorter as the noise around them goes.
