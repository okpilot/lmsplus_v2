# Tasks — Filtered Question-Pool RPCs (#678 + #679)

- [x] 1. Migration `20260528000001_filtered_question_pool_rpcs.sql` — `_filtered_question_pool` helper + `get_random_question_ids` + `get_filtered_question_counts` + grants + comments.
- [x] 2. Rewrite `getRandomQuestionIds` (quiz.ts) to call `get_random_question_ids`; drop `userId` opt; delete `filterUnseen/filterIncorrect/filterFlagged` + orphaned local types.
- [x] 3. Update `start.ts` caller — remove `userId` arg.
- [x] 4. Rewrite `getFilteredCount` (lookup.ts) to call `get_filtered_question_counts`; aggregate count/byTopic/bySubtopic with `Number(n)`; drop helper imports + empty-array bail.
- [x] 5. Delete `lookup-helpers.ts` (buildQuestionQuery, groupCounts) + `filter-helpers.ts` (applyFilters), and their `.test.ts` files.
- [x] 6. `quiz.test.ts`: delete all 5 getRandomQuestionIds describe blocks (≈L189–513), keep `mockFrom` in `vi.hoisted()` (other suites use it), add rpc-mocked getRandomQuestionIds suite.
- [x] 7. `lookup.test.ts`: switch 8 filter tests to `mockRpc` grouped rows; bail-logic block — L495 `count:2→0`, L510 `count:1→0` (intentional empty-array=match-nothing change, retitle + comment), L525 stays 0 via rpc mock; add aggregation/coercion/auth/error tests.
- [x] 8. Update `docs/database.md` (RPC entries) + `docs/plan.md` (#678/#679).
- [x] 9. Verify: `pnpm check-types`, `pnpm lint`, unit suite (3374 tests / 247 files pass), `pnpm build`, migration applied to local DB.
- [x] 10. Post-commit pipeline incl. red-team (migration + quiz actions touched). Findings: code-reviewer/test-writer clean; semantic-reviewer 0/0/2-SUGG (#1 applied, #2 skipped on merits); doc-updater 1-ISSUE (security.md §11→§3 drift, applied in 12ffa414); red-team filed #689 (CA unauthenticated) + #690 (CB cross-org); learner promoted §11/§3 mismatch at count=3 → meta-note added to `.claude/rules/security.md` (d98ee01f); coderabbit-sync ran.
