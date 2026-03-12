Triage CodeRabbit review comments on the current PR and decide what to fix, skip, or defer to GitHub Issues.

## What to do

1. Find the open PR for the current branch:
   ```bash
   gh pr list --head $(git branch --show-current) --state open --json number,url --jq '.[0]'
   ```

2. Fetch all CodeRabbit review comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/NUMBER/comments --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]") | {id, path, body}'
   ```

3. For each comment, extract:
   - **Severity**: Trivial / Minor / Major (from CodeRabbit's own labels)
   - **Category**: Bug, Security, Refactor, Test, Docs, UX, Nitpick
   - **File + lines** affected
   - **One-line summary** of the issue

4. Triage into three buckets:
   - **FIX NOW** — real bugs, security issues, rule violations from `code-style.md` / `security.md`
   - **DEFER** — valid improvements that don't block merge (create GitHub Issues)
   - **SKIP** — false positives, already handled, or disagree with reasoning

5. Present a structured triage table to the user with columns: #, File, Severity, Issue, Verdict, Why

6. After user approval:
   - For FIX NOW items: plan and implement fixes (use subagents for multi-file changes)
   - For DEFER items: create GitHub Issues with CodeRabbit's context (`gh issue create`)
   - For SKIP items: optionally reply to the CodeRabbit comment explaining why

## Triage guidelines

### Fix now if:
- Real bug (wrong output, crash, data loss)
- Security gap (auth bypass, injection, DoS, answer exposure)
- Violates a rule in `code-style.md` or `security.md`
- Quick fix (< 10 lines, single file)

### Defer if:
- Valid but too broad (affects 10+ files, systematic refactor)
- UX enhancement, not a functional bug
- Test coverage gap (tests work, just not comprehensive enough)
- Doc polish

### Skip if:
- False positive (CodeRabbit misread the code)
- Already handled by existing defense-in-depth
- Disagree with the suggestion (explain why)
