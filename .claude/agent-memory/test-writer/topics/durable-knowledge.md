# Durable Knowledge — Test Writer (detail for MEMORY.md one-liners)

---

## Untested branches in a feature commit {#untested-branches}

`git show <sha> --stat --name-only` vs the same filtered to `*.test.{ts,tsx}` — any `.ts`/`.tsx` file missing its co-located test is a gap. Common miss: a new question-type cloned from an existing one adds branches to N already-tested sibling files (Zod schema, RPC-shape guard, localStorage rehydrate validator, draft-load validator, load-query shape guard) but only the brand-new files get tests — the old branches already have co-located tests so they "look tested". Found 8 such files in d74f3e0e (VFR RT Phase 6). Mirror the exact test shape of the sibling branch (`ordering` tests → ready-made template).

---

## Catch block multi-effect ordering {#catch-block-multi-effect}

When a catch block has two sequential effects gated by different conditions — teardown (`if (flagCreated) await cleanup()`) then a specific-error branch (`if (err.message.includes('token')) return specificMsg`) — test the specific-error path WITH both effects asserted together (assert teardown was called AND the specific message is returned). Testing each separately leaves an invisible regression: if someone moves the early-return before the teardown, both individual tests still pass but teardown is silently skipped. First confirmed: `study.ts` `active_exam_session` + `endDiscovery` ordering, PR #1011 sweep.

---

## Bash security-gate parser extra cases {#bash-security-gate}

Beyond happy/unhappy paths, pin four cases:
- **(a) empty input** — must fail closed (exit non-zero / block push)
- **(b) BLOCKED wins regardless of order** — transcript with APPROVED before BLOCKED: BLOCKED must win. The parser checks BLOCKED first.
- **(c) CRLF line endings** — `[[:space:]]` absorbs `\r`, so `APPROVED\r` matches `^[[:space:]]*APPROVED[[:space:]]*$`. Use `run_case_raw_bytes` with `printf '%b'` for the raw-bytes variant.
- **(d) leading-whitespace variant** — if the regex allows indented tokens, add a pinning test so future regex tightening is visible.

Pattern confirmed: `.claude/hooks/run-security-auditor.test.sh` (2026-06-10, issue #832).

---

## sessionStorage replacement in jsdom {#sessionstorage}

`vi.spyOn(window.sessionStorage, 'setItem')` does NOT intercept calls made inside the module under test in jsdom. Replace via:

```ts
const mockSetItem = vi.hoisted(() => vi.fn())
Object.defineProperty(globalThis, 'sessionStorage', {
  value: { setItem: mockSetItem, getItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
  writable: true,
})
```

Pattern confirmed: `use-exam-start.test.ts` and `quiz-recovery-handlers.test.ts`.

---

## layout.tsx testing {#layout-testing}

Async Server Component layouts ARE testable: call `await Layout({ children })` directly to get JSX, then `render(jsx)`. Mock `next/navigation` for `redirect` (vi.hoisted); stub `'use client'` children as plain `<div data-testid="…" data-prop="…">` so RTL can run without hook deps. Wrap `AppLayout({ children })` in try/catch when `redirect` is mocked as a no-op — in real Next.js it throws, so the try/catch future-proofs the test. Pattern confirmed: `app/app/layout.test.tsx` (2026-06-01).

---

## SECURITY DEFINER RPC integration tests {#rpc-integration}

Must apply `supabase db push --local` first (PGRST202 = schema cache stale). Use `supabase migration repair --status reverted <id>` to unblock a push when a prior remote migration is missing locally. Use `getAuthenticatedClient()` from `__integration__/setup.ts` for auth.uid()-dependent RPCs — service-role always gets `auth.uid() = null`. Cross-org rejection tests: `.single()` lookup to confirm target row exists before asserting RPC rejects it.

**In-place migration edits:** if a migration was edited after its first `db push`, `db push` no-ops (hash already in ledger) — run `supabase db reset` + re-seed instead.

Pattern confirmed: `rpc-record-auth-event.integration.test.ts` (2026-06-06). Also covers: CHECK constraints test via service-role admin INSERT (not RPC) — assert `23514`/`check`/constraint name + positive control (pattern: `rpc-vfr-rt-constraint-regression.integration.test.ts`).

---

## PostgREST unnamed TEXT parameter encoding {#postgrest-text-param}

PostgREST (14.12) maps JSON key `""` (empty string) to the first unnamed `text` parameter. Call with `body: JSON.stringify({ '': input })`. Scalar results: `{value}` (normal), `{ value }` (leading/trailing whitespace), `{}` (empty). Unwrap: `raw.slice(1, -1).trim()`.

**CRITICAL:** inputs containing `"` corrupt via JSON encoding — `JSON.stringify({'': '"cleared"'})` → `{"":"\"cleared\""}` → SQL receives `\"cleared\"` (with literal backslashes), NOT `"cleared"`. Do NOT write `it.each` test cases with `"` in the input when using this calling convention. Pattern confirmed: `rpc-vfr-rt-start.integration.test.ts` `normalize_answer` tests (2026-06-10).

---

## App-layer integration test setup pattern {#app-layer-integration}

Per-file `const suffix = Date.now()`, `const admin = getAdminClient()`. `beforeAll` seeds: org → users → refs → questions → `getAuthenticatedClient` → open/completed sessions. **DO NOT call `signInAs` in `beforeAll`** — cookie jar resets per-test. Call `signInAs(email, password)` at the TOP of EACH test. `afterAll`: error-accumulator pattern (`const errors: string[] = []`; each step in its own try/catch; `if (errors.length) throw`). Session-ending actions need a FRESH `seedOpenSession` per test — checkAnswer does NOT end the session so a shared `seedOpenSession` in `beforeAll` is safe. Guard `questionIds[]` access with null check + throw. Prefix unused captured variables with `_` (Biome `noUnusedVariables`). First confirmed: `{start,submit,check-answer,complete,batch-submit}.integration.test.ts` (2026-06-20, #925 Phase 2).

---

## Zero-export CLI scripts are not unit-testable — say so, don't force it {#zero-export-cli-scripts}

A script under `apps/web/scripts/*.ts` with (a) **no `export` statements at all** (`grep '^export'` returns nothing) and (b) **top-level side effects that run at import time** — `config()` loading `.env.local`, `process.argv`-gated `process.exit(1)` calls, `createClient(...)` constructed at module scope, a trailing `main().catch(...)` — cannot be unit-tested without adding exports to production code, which is out of scope for test-writer (tests only, never modify production code). Importing the module for a test would immediately execute every gate in argv/env-dependent order, and every function worth testing (validators, guards, pagination loops) is module-private with no seam to reach it from outside.

This is NOT the same class as the Playwright-helper rule above ("export pure logic, add a co-located test") — that rule applies when a script already has (or could trivially gain, at the ORIGINAL author's hand) exported pure functions. When a script has zero exports and is entirely wrapped in a `main()` IIFE-style invocation, the correct test-writer output is a plain, explicit "not unit-testable as-is" report, not a forced test and not a silent skip. Confirmed: `apps/web/scripts/import-vfr-rt-content.ts` (2026-08-16) — `assertSyncPreconditions`, the paginated `listUsers` loop inside `createAuthUser`, `syncOneQuestion`, etc. are all module-private; the file gates on `SUPABASE_SERVICE_ROLE_KEY`/`--force-remote`/`--replace`/`--sync-content` via `process.exit` at module load. Its behavioral correctness is covered by the `packages/db/src/__integration__/rpc-*.integration.test.ts` tier and by reading the code directly in review, not by a Vitest unit test.

A pure REFACTOR inside such a file (e.g. hoisting a repeated `new RegExp(...)` literal to a module constant with identical semantics — no `/g` flag, so no `.test()` statefulness difference) is not a new coverage gap either; confirm behavioral equivalence by reading, and don't write a test to "cover the refactor" when the underlying function already has coverage (or, as here, has none because the whole file is unexported).

---

## Isolating a guard-path integration test from a shared deterministic question pool {#isolate-from-shared-pool}

Some VFR RT / exam RPC integration-test files seed a question pool sized EXACTLY to the RPC's per-part selection count (e.g. 8 SA + 9 DF + 8 MC matching `start_vfr_rt_exam_session`'s `part1.count=8/part2.count=9/part3.count=8` defaults) so that `ORDER BY random() LIMIT N` against a pool of exactly N is deterministic — every fixture question is always selected. **Never add a new fixture question to that shared pool with `status: 'active'`** to test a new guard/error path — a pool of N+1 makes the RPC's selection non-deterministic and can make every other test in the file flaky.

Instead: insert the new fixture question with **`status: 'draft'`** (excluded by every start-RPC's `WHERE q.status = 'active'` filter, so it never enters the random-selection pool) and construct the session directly via the admin/service-role client — `INSERT INTO quiz_sessions (organization_id, student_id, mode, subject_id, config, total_questions, time_limit_seconds)` with `config: { question_ids: [theDraftQuestionId] }` — bypassing the start-RPC's selection logic entirely. The graders (`submit_vfr_rt_exam_answers` et al.) read question membership from `config->question_ids`, not from a live re-query with a status filter, so a draft question submitted this way is graded normally. This exact "insert the session row directly" pattern is already established in the same test files for the timer-expiry guard (backdated `started_at`) — reuse the existing shared `studentId`/`orgId`, and `forceEndSession(sessionId)` in a `finally` block afterward (a RAISE EXCEPTION mid-RPC rolls back the whole call, including the `ended_at` UPDATE, so the directly-inserted session is still "active" and must be force-ended or it trips the single-active-session invariant for the next test). Confirmed: `rpc-vfr-rt-submit.integration.test.ts` `question_blank_missing_canonical` guard test (2026-08-16, mig `20260815000300`) — also needed `dialog_template` in the `{{n|value}}` token form (a bare `{{0}}` trips `questions_dialog_fill_template_wellformed`) even though the blank's `canonical` key is intentionally omitted from `blanks_config`.

---

## Sibling-parity: diff `it()` titles, not mechanisms {#sibling-title-diff}

When two hook test files are structural siblings of the same logic (e.g. `use-active-practice-discard.ts` + its DI-based twin `resume-exam-handlers.ts`, both implementing the identical discard-with-re-entry-guard shape), the fast and reliable way to find a real parity gap is a raw title diff, not a mental "does each mechanism look tested" pass:

```bash
diff <(grep -oE "it\('[^']+'" sibling-A.test.ts) <(grep -oE "it\('[^']+'" sibling-B.test.ts)
```

A title present in one file and absent in the other is the lead — verify it's a genuine gap (not a rename) by mutation-testing the mechanism the missing title would cover, per code-style.md §7 "A Test Must Fail If Its Mechanism Is Removed": temporarily comment out the production line, run the target file, confirm something goes red; if nothing does, the title names a real gap.

**Worked example (commit 1ea45b5c review, 2026-08-17):** `resume-exam-handlers.test.ts` has `'clears the error state at the start of each attempt'` (asserts `setError` is called with `null` as call #1 of `handleDiscard()`); `use-active-practice-discard.test.ts` has no equivalent — only `'clears the error when clearError is called'`, which tests the *separate* `clearError()` callback, not the `setError(null)` line at the top of `discard()` itself. Mutation-verified real: deleting `setError(null)` from `use-active-practice-discard.ts` left all 13 then-existing tests green (confirmed by running the file with the line commented out). The reason the file's own "retry" tests (added in the same commit) didn't already catch it: they assert only the END state after the retry resolves — a resolved-failure retry always overwrites the stale error via `setError(result.error ?? fallback)`, and a successful retry hides it because `discarded` unmounts the banner before the stale error would render. Neither retry test observes the *momentary* clear at the start of the new attempt.

The fix does not require spying on `setError` (this file uses `renderHook` + real React state, not DI mocks like the sibling) — hold the SECOND `discardQuiz` call pending with an unresolved promise, invoke `discard()` again without awaiting, and assert `result.current.error` is `null` while the second call is in flight, before resolving it. This is the same pending-promise idiom already used by this file's `'submits a single discard when invoked twice before the first settles'` test — reuse it rather than inventing a new observation mechanism.

---

## `pipeline.test.mjs` subset-extraction blind spots {#pipeline-subset-extraction}

A derived SUBSET-filtered value (`present = tracked.map(extractX).filter(x => ALLOWLIST.includes(x))`) has no check on its own extraction step — only a "present ⊆ allowlist" inclusion check downstream, which gets MORE lenient as the extraction shrinks. In `.claude/pipeline.test.mjs` the total-emptying forms (`indexOf` first-dot, `lastIndexOf('/')` basename) were 92/0 until `ec9ba068` added a `present.includes('mjs')` pin — RESOLVED by it (re-confirmed 93/0 stays green post-revert).

STILL OPEN, both mutation-confirmed 93/0 on `ec9ba068` (2026-09-08):
(a) a SELECTIVE shrink of the FILTER predicate (`BIOME_EXTS.includes(x) && x !== 'js'`) — evades both the emptiness pin and `droppedFromBiomeExts` (reads `BIOME_EXTS`, never `present`);
(b) a collapse of the EXTRACTION step itself to the sentinel alone (`n.endsWith('.mjs') ? 'mjs' : ''`, or even a constant `'mjs'`) — `present.includes('mjs')` is satisfied trivially while js/json silently drop out of `present`, and `missing`/`droppedFromBiomeExts` stay green because both are one-directional (`present ⊆ X`, never `X ⊆ present`).

Shrinking the `BIOME_EXTS` CONSTANT itself is NOT open — caught by the `droppedFromBiomeExts` reverse pin (confirmed: `BIOME_EXTS=['mjs']` → 92/0). Also confirmed harmless (not a gap): `.sort()` removal (order-only, no check depends on it) and `new Set` dedup removal (duplicates don't change subset membership) — both stay 93/0 but hide no defect.

Fix shape unchanged: assert `present`'s distinct-extension SET (or count) against an independently-computed value, not just single-membership.

---

## Shell embedded in `.claude/commands/*.md` — untestable in place, but for a different reason than prose {#commands-md-shell}

Not the same case as "rule-prose-only commits owe no test" — this shell is genuinely first-party logic with a proven bug history, not third-party behavior or inert prose. `ee0186d9` fixed real bugs in `RAW=$(git diff --name-status -M ...) || abort; CHANGED=$(printf ... | cut -f2- | tr '\t' '\n')`, embedded similarly-shaped (not byte-identical) in both `crlocal.md` and `fullpush.md`, which had already regressed TWICE in one PR: `--name-only` (rename-blind) → `--name-status -M`, then a wrong-exit-code `||` guard on the whole pipe instead of the diff. That history argues FOR pinning it in the abstract.

It still gets no test because nothing in the repo executes `.claude/commands/*.md` bodies — no `.claude/scripts/` dir exists, no command file sources one, and `pipeline.test.mjs` never parses command-file content. There is no artifact to attach a test to without inventing new infra.

Verify instead by DIRECT EXECUTION in a scratch repo and report inline (satisfies "verify by executing" without a persisted test):
- bad ref (`origin/master` unresolvable) → `git rev-parse --verify` fails → script's own `|| abort` fires, exit 1
- bad diff range (ref resolves but the range is invalid) → `git diff --name-status -M` fails → `|| abort` fires, exit 1, never read as empty
- good diff, with a rename OUT of a security path → the final path list contains the rename SOURCE (verified via a fixture: `packages/db/src/admin.ts` → `other/admin-moved.ts`, `git diff --name-status -M` emits `R100\t<src>\t<dst>`, `cut -f2- | tr '\t' '\n'` splits both onto their own line)
- a path containing a space → survives as one unsplit line (only literal tabs from `--name-status` are split, never internal spaces)

Do NOT write a `.test.sh` against a copy-pasted duplicate of the snippet — the two markdown copies already aren't byte-identical to each other, so a third copy in a test file is a fourth text nothing keeps in sync; it can stay green while the real snippet drifts, which is worse than no test. If duplication/regression rate ever justifies it, the fix is extracting the shared logic into a real script under a new `.claude/scripts/` — that's infra work for the orchestrator to scope (Apply-vs-Defer), not something test-writer does unilaterally on a coverage pass.

Checked in the same pass: whether the new clause is now byte-identical across 2+ files (a `check-mirror-sync.mjs` candidate) — `node .claude/hooks/check-mirror-sync.mjs '<anchor>'`, exit 0 = in sync. Two topically-related but differently-worded clauses in sibling rule files are NOT a duplicate; the guard only matters for verbatim-shared text. A short fixed-string overlap found by `git grep -F` is not proof of a real mirror — `check-mirror-sync.mjs` compares the full CLAUSE BLOCK (anchor line to next blank line), and two blocks can share one substring while continuing differently (confirmed divergent, exit 1: `c787b0d2`'s deliberate restatement across `.claude/agents/doc-updater.md` and `.claude/rules/agent-doc-updater.md`). `b177a3d2` (learner row 663 promotion) checked clean with no duplicate clause found.

---

## Prose-only commits touching `.coderabbit.yaml` {#coderabbit-yaml-prose}

`.coderabbit.yaml` prose edits owe no test IF the commit is otherwise prose-only (`git show <sha> --stat` shows zero `.ts`/`.tsx`/`.mjs`/`.sh`/`.sql`). Confirm by checking whether anything actually reads the yaml BODY: `git grep -rln 'coderabbit.yaml' -- ':/*.mjs' ':/*.ts' ':/*.test.*'` — as of 2026-09-02, 3 hits, none of them a test reading the yaml body (`cr-local-plan-reminder.test.sh` pins a literal CLI-invocation fixture string; `import-vfr-rt-content.ts` / `seed-more-questions.ts` only mention the file in prose comments).

`check-mirror-sync.mjs` (CI-run via `check-mirror-sync.test.mjs`, synthetic fixtures only) is a generic anchor-driven CLI invoked manually per `agent-workflow.md § Rule-Mirror Sync` — never auto-wired to specific new clause text. Its `clauseBlock()` treats 2+ occurrences of one anchor WITHIN THE SAME FILE as an unresolvable ambiguity (fails, doesn't diff them), so it cannot self-verify two identical same-file insertions (e.g. a clause duplicated across two `.coderabbit.yaml` `path_instructions` blocks) — that needs a different invocation shape, out of scope to build unprompted. Confirmed: `18757ddf` (prose-only across CLAUDE.md/code-style.md/agent-doc-updater.md/`.coderabbit.yaml` ×2 identical inserts) — no test written.

---

## One-position-fixed sweep on a multi-view fan-out function {#one-position-fixed-sweep}

`check-commit-claims.mjs`'s `extractRefs` maintains a raw view and a normalized (backtick-stripped)
view of the text around each hex token, and OR's together 4-5 positional rules (`TRIGGER_BEFORE`,
`POSSESSIVE_AFTER`, `PAREN` pair + its `ACTION_PIN` exclusion, `BARE_START`, `TRIGGER_AFTER`
cancellation). `371bfe49` fixed exactly one of them (POSSESSIVE reading raw `after` instead of the
stripped `afterForExclusion`) and added exactly one regression test for it.

A bugfix that pins ONE sibling position in a multi-position OR-chain is not evidence the siblings are
covered — each reads a *different slice* of the surrounding text, so a test on position A cannot
exercise position B's normalization. Swept all four remaining positions by mutation (scratch worktree
off the commit, one mutation at a time, `git checkout --` between each, baseline/HEAD/stash verified
before and after):

- `TRIGGER_BEFORE_RE.test(beforeForTrigger)` → `.test(before)` — 34/34 still green pre-fix-commit
  test file; production code is CORRECT (reads the right view), but no test pinned it with a
  backticked token, so the exact same silent-drop bug class as the fixed one was reintroducible
  invisibly.
- `TRIGGER_AFTER_RE.test(afterForExclusion)` → `.test(after)` (the BARE_START cancellation) — same
  gap, opposite failure mode: makes a backticked *content digest* wrongly resolve as a citation
  (false block, not a silent drop).
- `PAREN_BEFORE_RE`/`PAREN_AFTER_RE` dropping their built-in optional-backtick (`` `? ``) — these two
  don't use the stripped views at all (the regex itself tolerates the backtick), so this is a
  different code shape from the other three but the same test gap.
- `BARE_START_RE` dropping its built-in optional-backtick — same shape as PAREN.

Each mutation was applied singly, confirmed to isolate to exactly its intended new test (`grep -n
"not ok\|✖ [a-z]"` on the TAP output — no other test moved), then reverted (`git checkout --`) before
the next. Four tests added, grouped near their non-backticked siblings, each carrying a comment
naming the exact mutation it catches. Suite total moves every cycle — derive it (`grep -c '^test(' <file>`), do not quote one here, `check-commit-claims.test.mjs`.

General lesson: for any function with N positional rules reading M distinct text views (raw vs.
normalized), a regression fix to one (rule, view) pair earns exactly one test for that pair — sweep
the other N-1 rules against the same view-mismatch shape before calling the coverage gap closed.
