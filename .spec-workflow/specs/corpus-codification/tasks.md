# Corpus Codification — Tasks

> Ordering is deliberate and was REVISED 2026-09-09 (user directive): enforcement of
> maintenance comes before archaeology deletion. Deleting 600 lines is a one-time win on text
> that is not decaying; an unenforced rule IS decaying. Enforcement compounds.

## Slice 0 — groundwork (COMPLETE)

- [x] `.claude/pipeline.json` + `.claude/pipeline.test.mjs` — pipeline facts as validated data
      (PR #1268, Decision 62). Deduped nothing by design; bought the ability to delete safely.
- [x] Settle the five policy contradictions needing a human call (PR #1269, Decision 63).

## Slice 1 — file-size limits (COMPLETE)

- [x] `.claude/limits.json` + `check-file-size-guard.mjs` + 40 tests over two files
- [x] Ten prose copies → one source + one pinned mirror; 2 live drift bugs fixed
- [x] Ratchet with a 92-entry visible baseline; 19 mutations run, 19 caught
- [x] Both post-commit CRITICALs closed (same-path content swap; unreadable tracked path)
- [x] Decision 65 recorded
      Commits: `7ca1f522`, `3752c88a`. Injected corpus 3,383 → 3,379.

## Slice 2 — enforce the rules that keep the system maintainable (NEXT)

Full plan drafted 2026-09-09. All three are one shape — build a shared harness
(`check-companion-file.mjs` + config), not three programs.

- [ ] **`--update-baseline` flag on the file-size guard. HIGHEST PRIORITY.** Without it,
      slice 1's exact-match ratchet fails CI on every legitimate shrink and gets disabled.
      Human-invoked; must never self-rewrite silently.
- [ ] R1: every `*.test.*` under `.claude/hooks/` is referenced in `ci.yml`. Currently a
      COMMENT telling a human to run `find`; has already failed once (3 unwired files until
      2026-09-02). Measured 2026-09-09: 10/10 wired, so it lands clean, no baseline needed.
- [ ] R2: every new file in `apps/web/**/_hooks/`, `**/_utils/`, `apps/web/lib/**`, or
      `.claude/hooks/*.mjs` has a co-located test. Source: `code-style.md` §7, unenforced.
      MUST be diff-scoped + grandfathered (`check-test-title-leakage.mjs` pattern).
- [ ] R3: `.claude/limits.json` `baseline` never GROWS vs `origin/master`.
- [ ] Delete the prose those three replace, including the `ci.yml` comment.

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
