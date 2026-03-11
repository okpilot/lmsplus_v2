Run all tests and report the results clearly.

## What to do
1. Run `pnpm test` from the project root
2. If tests fail, read the failing test files and the source files they test
3. Diagnose the root cause of failures
4. Fix the failures (prefer fixing source over changing tests, unless tests are wrong)
5. Re-run tests to confirm all pass
6. Report: X passed, Y failed, any skipped

Do not change test assertions unless the test itself is wrong.
