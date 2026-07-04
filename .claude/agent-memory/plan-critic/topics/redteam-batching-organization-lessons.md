---
name: redteam-batching-organization-lessons
description: Red-team PR/spec batching organization lessons — how to group red-team issues into PRs, plus the batch_submit_quiz RETURNS jsonb contract shape.
metadata:
  type: project
---

## Red-team batching plans (organization plans, not implementation)

Relocated verbatim from plan-critic MEMORY.md (curated to stay under the 25 KB native-injection cap).

- "One spec file = one PR" principle must be verified against the *issue bodies*, not assumed from the PR's headline. Multiple issues in a single PR may each touch a different spec file (e.g. #557 requires both a new rpc-complete-empty-exam.spec.ts AND extending server-action-unauthenticated.spec.ts for Vector AN). Check each issue body for target spec file(s).
- A batch labeled "new file only" is only parallel-safe if NONE of its constituent issues also touch shared existing files. A single issue that spans 3 existing files (e.g. #517 covers AG in server-action-unauthenticated + AH/AK in rpc-cross-tenant + AI in session-replay) makes the whole PR conflict-prone.
- Issues with overlapping scope (e.g. #545 covers AG+AH; #517 also covers AG+AH) must be noted with a deduplication callout — both issues close from a single test implementation, and the plan must say which test file owns the implementation.
- Feature issues (e.g. #379, labeled `feature`, requiring new SECURITY DEFINER RPCs and Server Action wiring) cannot be "split out" from a red-team PR without production code — they require a migration + production code change + manual eval. Grouping them in a spec-only batch without noting production code is a false "automatable" classification.
- Attack-surface.md Vector O ("quiz-report leaks raw correct boolean server-side") is labeled CRITICAL in the matrix, not "possibly-CRITICAL". Plans that understate it need correction. The defense (buildReportQuestions strips the field in TypeScript) exists but is asserted only at the unit test layer — no E2E spec yet. It IS spec-only (no production fix needed), but the severity label must match the matrix.
- #551 (batch_submit_quiz soft-deleted question SQL integration test) has an undecided home: issue says "Playwright e2e/redteam/ pattern OR new integration/ Vitest suite hitting local Supabase Docker". The redteam CI workflow does not trigger on a new Vitest integration file — the plan must choose and state which, and if Vitest, note that the redteam.yml will NOT run it. RESOLVED in this PR: plan chose Vitest integration (packages/db/src/__integration__/rpc-batch-submit-quiz.integration.test.ts) and noted CI exclusion. Correct choice.
- batch_submit_quiz `RETURNS jsonb` — result is `{ results: [...], total_questions, answered_count, ... }`. Plans that write `data.length>=1` intending to test the results array are wrong; correct is `data.results.length>=1`. Plans must spell out `data.results[N].field` for all batch_submit_quiz assertions. Also: the `p_answers` element JSON key is `selected_option` (not `selected_option_id`) — the table column is `selected_option_id` but the JSON key the RPC reads via `v_answer->>'selected_option'` is `selected_option`.
