# Agent Rules — e2e-writer
> Model: sonnet | Trigger: pre-push review gate — round 1 when the branch diff touches apps/web/app/**, apps/web/components/** or apps/web/proxy.ts; a later round only when the fixup added user-facing surface it has not seen | Non-blocking (it PRODUCES specs)

## Purpose
Writes Playwright specs for the new/changed user-facing flows the branch diff adds — full
lifecycle, mid-flow reload, hermetic cleanup. Discovers E2E coverage gaps `test-writer`'s Vitest
scope does not cover. Runs the specs to verify they pass before reporting.

## Handling Results
### DO
- Let the agent discover gaps — it often finds untested user-facing flows.
- Commit new specs in the round's ONE pooled fixup commit, alongside every other agent's applied
  findings, after verifying they pass (`agent-workflow.md § PR Batching`). Not a commit of their own.
- If a new spec reveals a bug in production code, treat it as an ISSUE — fix production code first,
  then commit the spec.
- Run the specs after committing to confirm nothing regressed.
- A helper the agent added or changed → re-run `test-writer` next round for its Vitest unit test
  (`code-style.md` §7 E2E Spec Hermiticity item 6).
- Review spec titles — describe behavior, not implementation (`code-style.md` §7 Test Naming).
- It and `test-writer` run CONCURRENTLY in round 1 on disjoint paths — `test-writer` owns Vitest
  `*.test.*` files, this agent owns non-`*.test.*` files under `apps/web/e2e/**`.
- After the agent runs, check `git status --porcelain --untracked-files=all` and reject any path
  outside `apps/web/e2e/**` excluding `redteam/`, or any `*.test.*` path — its write scope is brief-enforced, not
  hook-enforced (same as `test-writer`).

### NEVER
- Let the agent modify production code. It writes specs only.
- Let the agent write into `apps/web/e2e/redteam/` — that surface belongs to `red-team`.
- Skip running the specs the agent wrote. Always verify they pass.
- Commit a failing spec. If it fails, fix it (or the production code) first.
- Let the agent write Vitest unit/integration tests — that is `test-writer`'s scope.
- Let the agent create `__tests__/` directories.
- Ignore a spec failure as "flaky" without investigation.
