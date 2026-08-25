# Handover — 2026-08-25

Live operational state. Not a changelog: git owns history. Delete a line here the moment it stops
being true.

> Filename is lowercase deliberately: `.gitignore:62` ignores `HANDOVER.md` anywhere in the tree,
> so the uppercase name is invisible to git and to the next session. Run `git check-ignore -v <path>`
> before creating any new file — `agent-workflow.md § Plan Validation` requires it, and this file was
> written to the ignored path first.

## 1. Where things are

| Item | State |
|---|---|
| **PR #1246** | OPEN, 7 commits, pushed. Deps + rules + hook. Needs CI + cloud CR. |
| **#1245** (dependabot, 20 bumps) | MERGED `77fe140b` |
| **W1 PR 3b (#991)** | **NOT STARTED** — next product work. Two migrations written but UNTRACKED (see §5) |
| Corpus amnesty | Investigated, not started. §3–§4 is the plan. |

## 2. The problem this session diagnosed

Every defect this session was the same shape: **the corpus records what git and grep already
compute, and each recorded fact is a claim that rots.**

Two directions:

- **Propagating** — an agent asserts something, the next actor builds on it without re-deriving.
  Tracker row 660 claimed commit `4938192b` *missed* two files it had in fact *fixed*; a rule was
  nearly promoted on top of it. A learner report claimed 60 de-listed rows were all preserved; seven
  had no archive row.
- **Stale dependents** — a claim is corrected and the number resting on it is not. Happened four
  times in one session, twice inside commits whose subject was fixing exactly that.

The only thing that reliably caught either was **executing a command against source**. Prose review
did not: five fail-opens in an eight-line bash snippet survived four internal agents and were found
by CR-local and by running it.

## 3. Measured evidence (2026-08-25)

Re-derive rather than trust these; commands are in the session transcript.

- Corpus: **3,220,725 bytes / 20,873 lines**
- **Auto-injected into every turn**: 424,748 bytes (`CLAUDE.md` + `.claude/rules/*.md` + 8 agent
  `MEMORY.md`) — 13.2% of the corpus, paid on every message
- `tracker-archive.md`: 705,898 bytes, **~86.5% per-instance case narration**; some single table
  cells exceed 9,000 bytes — longer than whole rule files
- Three memory topic files = 1,006,341 bytes = **31% of the corpus**
- 15 rule files carry `*Last updated:*` footers totalling 23,429 bytes. `agent-workflow.md`'s is a
  **single 7,220-byte line**. `docs/plan.md` has the same at the top: **one 15,662-byte line**
- **5 of 5 sampled footers were fully recoverable from `git log -1 --format='%B'`** — squash-merge
  already puts the rationale in the commit body
- Of ~336 distinct rules, ~112 (**33%**) have evidence of firing on product code. Only **~9** have a
  blocking mechanical enforcer
- `agent-workflow.md`: ~85% of its rules never reach product code. Its Delegation Protocol template
  (13.6 KB) has **zero** grep hits in commit history
- `github-projects.md`: orphan, in-degree 0
- **Product documentation: one file** (`docs/database.md`, schema-level only). No features or routes
  overview. **No `/help`, `/docs` or `/about` route exists in the app.**

## 4. The amnesty

**Deletion criteria** — a line goes if it is any of:

1. Recoverable from `git log -p` (every `*Last updated:*` footer)
2. Recoverable from a command — state the command, not the answer
3. Per-instance narration where the pattern is already stated
4. Already enforced mechanically — keep the enforcer, delete the prose
5. Never fired on product code

**Keep:** `security.md` (12/13 product-load-bearing — best density in the corpus), `code-style.md`
§5/§6/§7/§10, `agent-coderabbit-local.md` Common Pitfalls (9/9).

**Cut first:** rule-file footers, `docs/plan.md`'s header line, tracker per-instance narration
(keep `pattern │ count │ status │ promoted-to`), `agent-workflow.md`'s unfired process rules,
`github-projects.md`.

First pass ≈ **750 KB of 3.2 MB**, zero information loss.

**Do it as mechanical deletion plus one verification run — not a rules cycle per file.** The
deletions are provably lossless, so there is nothing for a critic to judge, and reviewing them with
the current pipeline would spend the day producing prose about deleting prose. That is the failure
mode being removed.

## 5. Then #991 (W1 PR 3b)

Two migrations exist, **untracked**, in the working tree:

- `supabase/migrations/20260824000100_get_admin_report_answer_keys.sql`
- `supabase/migrations/20260824000200_internal_exam_history_distinct_and_gates.sql`

Scope is **wider than the issue text**: `apps/web/lib/queries/admin-quiz-report.ts` contains zero
occurrences of `question_type`, and `apps/web/lib/queries/report-question-builder.ts:91` defaults a
missing type to `multiple_choice` — so a non-MC question on that route renders as an MC card with
empty options. Mis-typed, not merely mis-counted.

**#991 touches `supabase/migrations/**` — never auto-merged.** Merging deploys to the production
database. Take it to a green open PR and hand it over.

## 6. Machine-readable index (proposed, not built)

- `.claude/index.json` — *generated*: rule handle → file → anchor → mechanical enforcer →
  last-fired commit. One lookup instead of grepping twelve files.
- `tracker.jsonl` — the learner tracker as data with stable IDs (ten archive row numbers are
  currently duplicated), so counts are computed and cannot go stale.
- `verify-claims.mjs` pre-commit hook — a cited SHA must exist and touch the path claimed; a
  `file:line` citation must resolve; a bare count next to "instances/files/rows" needs a derivation
  marker or fails.

`.claude/hooks/check-mirror-sync.mjs` (shipped in #1246) is the pattern: an untestable prose snippet
became a tested script, and its six fail-opens are now regression tests.

## 7. Flags

- A subagent's output tripped the harness's instruction-shaped-pattern filter (`settings-json`) and
  was neutralized before reaching the orchestrator. Substantive claims were spot-checked
  independently and held. Probably a false positive on a report that legitimately discusses
  `.claude/settings.json`; **not certified either way.**
- A subagent published an Artifact nobody requested
  (`https://claude.ai/code/artifact/2b76dc3a-...`) during a read-only task. **Not opened, not
  treated as authoritative.** Review or delete.
- Learner promotion bar is self-contradictory: `agent-learner.md` says "2+ across different
  commits"; row 655 applies an unwritten "2nd branch" gate and sits unpromoted at count=11, while
  row 660 promoted at same-branch count=3. **Unresolved — needs a decision.**
- Pre-existing: `jsdom@30.0.1` declares `dependencies.undici: "^8.9.0"` but the `undici` override
  forces `7.29.0` — a major below what jsdom asks for. Untouched here; worth its own audit.
