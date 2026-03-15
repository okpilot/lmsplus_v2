Reply directly to all CodeRabbit review comments on the current PR, inline on the exact comment thread.

## What to do

1. Find the open PR for the current branch:
   ```bash
   gh pr list --head $(git branch --show-current) --state open --json number,url --jq '.[0]'
   ```

2. Fetch all CodeRabbit inline comments and extract their IDs:
   ```bash
   gh api repos/{owner}/{repo}/pulls/NUMBER/comments --paginate \
     --jq '.[] | select(.user.login == "coderabbitai[bot]") | {id, path, body: (.body | split("\n")[0:3] | join(" "))}'
   ```

3. Also fetch the review body for any "outside diff range" comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/NUMBER/reviews --paginate \
     --jq '.[] | select(.user.login == "coderabbitai[bot]") | {id, state, body: (.body | split("\n")[0:5] | join(" "))}'
   ```

4. For each **inline comment** (from step 2), reply directly on the comment thread:
   ```bash
   gh api repos/{owner}/{repo}/pulls/NUMBER/comments/COMMENT_ID/replies \
     -f body="Fixed in COMMIT_SHA. Brief description of what was done."
   ```
   - Reference the specific commit hash that contains the fix
   - Keep replies concise — one sentence describing the fix
   - If the finding was skipped, explain why (e.g., "False positive — the guard already exists at line X")

5. For **outside-diff-range comments** (mentioned in the review body from step 3, not addressable inline), post a single **general PR comment** that addresses all of them:
   ```bash
   gh api repos/{owner}/{repo}/issues/NUMBER/comments \
     -f body="## Addressing outside-diff review comments

   All outside-diff findings have been fixed in COMMIT_SHA:

   **1. file.tsx (lines X-Y)** — description of fix
   **2. file.ts (lines X-Y)** — description of fix
   ..."
   ```

## Rules

- **Always reply inline** when the comment has a comment ID from the pulls/comments endpoint. Use the `/replies` sub-endpoint.
- **Never** leave a CodeRabbit comment without a response — every finding gets a reply.
- **Reference the fix commit** hash in every reply so reviewers can verify.
- If a finding was **not fixed** (skipped or deferred), still reply explaining the decision.
- Run all reply API calls in parallel when possible for speed.
- Verify replies posted by checking for your comments afterward:
  ```bash
  gh api repos/{owner}/{repo}/pulls/NUMBER/comments --paginate \
    --jq '.[] | select(.user.login != "coderabbitai[bot]") | {id, path, body: (.body[:80])}'
  ```
