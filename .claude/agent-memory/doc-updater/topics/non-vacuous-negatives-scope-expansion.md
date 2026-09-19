---
name: non-vacuous-negatives-scope-expansion
description: 2026-09-19 rule scope widening for non-vacuous negatives from red-team-only to all test tiers
metadata:
  type: project
---

**Branch:** test/non-vacuous-integration-negatives

Code-style.md §7 scope changed from red-team-only to all test tiers (red-team specs + integration tests + unit tests). Heading changed from "Red-Team Isolation/..." to "Isolation/...". New bullet added about `.every()/.some()` on possibly-empty arrays.

**Mirror audit results:**

1. `.coderabbit.yaml` — currently scopes to `apps/web/e2e/redteam/**/*.spec.ts` only. Coderabbit-sync must add path blocks for `*.integration.test.ts` and unit test patterns to enforce the widened scope.

2. `docs/decisions.md` — Decision 31 rationale mentions the rule via `code-style.md §7` (section number unchanged; citation still accurate).

3. Steering docs — no references to this rule found.

4. Agent/command/skill/hook files — no references found.

5. Test enumeration — new helper file `seed-unauth-fixtures.ts` is internal to red-team suite; no public docs enumerate red-team specs or helpers that would become incomplete.

6. Deleted file entry — `.claude/limits.json` correctly removes `server-action-unauthenticated.spec.ts` (deleted in this branch).

**No doc edits needed (except coderabbit-sync's own work on `.coderabbit.yaml`).**
