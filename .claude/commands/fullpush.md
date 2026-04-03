Pre-push quality gate. Run this BEFORE pushing to catch drift, lazy triage, and missed issues.

## Self-Audit Checklist

Before doing anything else, answer these questions honestly. Do NOT skip any. Print each answer.

### Verification quality
1. **For every reviewer/agent finding this session:** Did you READ the actual source file and cross-reference tests, specs, and related files — or did you rely on labels/summaries?
2. **For every SKIP or DEFER verdict:** Can you cite the specific line numbers that support your verdict? If not, go back and verify now.
3. **Did you apply the "< 10 lines = fix now" rule** before marking anything SKIP or DEFER?

### Completeness
4. **Are there any unresolved CRITICAL, BLOCKING, or ISSUE findings** from any agent or reviewer?
5. **Did all post-commit agents run** on the latest commit? (code-reviewer, semantic-reviewer, doc-updater, test-writer, learner)
6. **If production code changed after initial review**, did you re-run semantic-reviewer on the fix commit?
7. **For every DEFER verdict this session:** Did you create a GitHub Issue to track it? List the issue numbers. No silent deferrals — every deferred item gets a ticket or it's not really deferred, it's forgotten.

### Cross-file consistency (for 2+ commit branches)
8. Run `git diff master...HEAD` and review the full PR diff — not just the latest commit.
9. Check: do test assertions match production code changed in different commits?
10. Check: do doc matrices/tables match schema changes from earlier commits?
11. Check: are fallback values and error handling consistent across all commits?

## Actions

After answering the checklist:

1. **If any answer is "no"** — fix it before proceeding. Do not rationalize.
2. **Run the full test suite**: `pnpm --filter @repo/web test -- --run` — report pass/fail count.
3. **Run type check**: `pnpm check-types`
4. **Show the agent findings summary table** for this session:

```
| Agent             | Severity | Count | Status   |
|-------------------|----------|-------|----------|
| code-reviewer     | ...      | ...   | fixed/clean |
| semantic-reviewer | ...      | ...   | fixed/clean |
| doc-updater       | ...      | ...   | clean    |
| test-writer       | ...      | ...   | added N  |
| learner           | ...      | ...   | done     |
```

5. **Ask for explicit push approval.** Never push without it.

## Why this exists

This command was created because Claude drifts toward lazy triage — relying on severity labels instead of reading source code, inventing justifications for SKIP/DEFER, and missing spec/test/code conflicts. This checklist forces verification before the push, not after.
