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
