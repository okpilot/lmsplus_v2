Triage CodeRabbit review comments on the current PR and decide what to fix, skip, or defer to GitHub Issues.

## What to do

1. Find the open PR for the current branch:
   ```bash
   gh pr list --head $(git branch --show-current) --state open --json number,url --jq '.[0]'
   ```

2. Fetch all CodeRabbit signals (run these three `gh api` calls in parallel):
   ```bash
   # Inline review comments (file-level)
   gh api repos/{owner}/{repo}/pulls/NUMBER/comments --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]") | {type:"inline", id, path, body}'

   # PR-level comments (summary, walkthrough, general remarks)
   gh api repos/{owner}/{repo}/issues/NUMBER/comments --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]") | {type:"pr", id, body}'

   # Review metadata (approve/request-changes state + review body)
   gh api repos/{owner}/{repo}/pulls/NUMBER/reviews --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]") | {type:"review", id, state, submitted_at, body}'
   ```

3. **Investigate each comment against the source code** (MANDATORY):
   - Do NOT triage based on CodeRabbit's severity labels, category tags, or summary alone
   - For every comment: read the actual file and lines referenced, verify the claim is true
   - Check whether the thing CodeRabbit says is missing actually exists somewhere else in the codebase (grep for it)
   - Check whether the suggestion contradicts an existing project rule or decision
   - Only after reading the source can you assign a verdict — never skip or dismiss based on labels

4. For each comment, extract:
   - **Severity**: Trivial / Minor / Major (from CodeRabbit's own labels — but verify against source)
   - **Category**: Bug, Security, Refactor, Test, Docs, UX, Nitpick
   - **File + lines** affected
   - **One-line summary** of the issue

5. Triage into three buckets:
   - **FIX NOW** — real bugs, security issues, rule violations from `code-style.md` / `security.md`
   - **DEFER** — valid improvements that don't block merge (create GitHub Issues)
   - **SKIP** — false positives, already handled, or disagree with reasoning

6. Present a structured triage table to the user with columns: #, File, Severity, Issue, Verdict, Why

7. After user approval:
   - For FIX NOW items: plan and implement fixes (use subagents for multi-file changes)
   - For DEFER items: create GitHub Issues with CodeRabbit's context (`gh issue create`)
   - For SKIP items: optionally reply to the CodeRabbit comment explaining why

## Triage guidelines

### Fix now if:
- Real bug (wrong output, crash, data loss)
- Security gap (auth bypass, injection, DoS, answer exposure)
- Violates a rule in `code-style.md` or `security.md`
- **Any finding fixable in < 10 lines, regardless of category** — a one-line doc typo doesn't need a GitHub Issue, just fix it

### Defer if:
- Valid but too broad (affects 10+ files, systematic refactor)
- UX enhancement, not a functional bug
- Test coverage gap (tests work, just not comprehensive enough)
- Doc restructuring or large doc rewrites (not quick typo fixes — those are FIX NOW)

### Skip if:
- False positive (CodeRabbit misread the code)
- Already handled by existing defense-in-depth
- Disagree with the suggestion (explain why)
