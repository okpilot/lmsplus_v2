Review the current feature or recent changes for code quality, security, and correctness.

## What to do
1. Run `git diff master...HEAD` (full branch diff) or `git diff --staged` to see recent changes
2. Check against `.claude/rules/code-style.md` — flag any violations
3. Check against `docs/security.md` — flag any security issues
4. Look for: missing tests, missing error handling at boundaries, type safety gaps
5. Output a structured review with: PASS / WARNING / BLOCKING items

Be specific: include file:line references for every issue found.
