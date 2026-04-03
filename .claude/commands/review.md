Review the current feature or recent changes for code quality, security, and correctness.

## What to do
1. Run `git diff master...HEAD` (full branch diff) or `git diff --staged` to see recent changes
2. Check against `.claude/rules/code-style.md` — flag any violations
3. Check against `docs/security.md` — flag any security issues
4. Look for: missing tests, missing error handling at boundaries, type safety gaps
5. **Spec compliance** — if a spec exists for this feature (check via spec-workflow MCP `spec-status`), verify implementation matches the approved spec
6. **Implementation-critic coordination** — implementation-critic runs pre-commit on staged changes. Avoid duplicating its checks; focus on branch-level and cross-file concerns here.
7. **Steering drift** — note any drift findings from doc-updater agent (stale docs, mismatched schemas). Flag for resolution before merge.
8. Output a structured review with: PASS / WARNING / BLOCKING items

Be specific: include file:line references for every issue found.
