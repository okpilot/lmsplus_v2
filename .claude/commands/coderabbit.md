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

2a. **ALWAYS extract the "Outside diff range comments" (MANDATORY — do not skip).**
   CodeRabbit cannot post inline comments on lines outside the PR diff, so it embeds those
   findings inside the **review body** instead (under a `⚠️ Outside diff range comments (N)`
   `<details>` block). They never appear in the `/comments` (inline) endpoint, so step 2's
   inline fetch alone WILL miss them. These are frequently the highest-severity findings
   (security/correctness on existing code the PR touches indirectly).

   - Do NOT triage from truncated review bodies — the `body` field is long and the outside-diff
     block is usually far down. Fetch each review body in FULL and search it:
     ```bash
     # For each review id that is CHANGES_REQUESTED/COMMENTED, dump the full body and locate the block
     gh api repos/{owner}/{repo}/pulls/NUMBER/reviews/REVIEW_ID --jq '.body' > /tmp/cr-review.txt
     grep -n "Outside diff range" /tmp/cr-review.txt   # then read that section in full
     ```
   - The header states the count (`Outside diff range comments (N)`) — confirm you extracted
     all N. Each entry has `file (k)`, a `` `line-range` `` + severity line, a bold title, and a
     suggested fix. Treat every one as a first-class comment in steps 3–7.
   - Also scan the same review bodies for any nested `<details>` finding blocks (CR sometimes
     nests additional remarks) so nothing is left untriaged.

3. **Investigate each comment against the source code** (MANDATORY — applies equally to inline AND outside-diff comments):
   - Do NOT triage based on CodeRabbit's severity labels, category tags, or summary alone
   - For every comment: read the actual file and lines referenced, verify the claim is true
   - Check whether the thing CodeRabbit says is missing actually exists somewhere else in the codebase (grep for it)
   - Check whether the suggestion contradicts an existing project rule or decision
   - Only after reading the source can you assign a verdict — never skip or dismiss based on labels
   - **Verifying the FILE PATH is not verifying the CLAIM.** A finding can cite a correct path and
     correct line numbers and still be wrong on the merits — that is the common case, not the rare
     one. Follow the claim-shape table in `.claude/rules/agent-coderabbit-local.md`
     § Verify Before Acting — MANDATORY GATE: trace a function to its LATEST definition (both
     `CREATE OR REPLACE` and `DROP`+`CREATE`), grep for a column said to exist, read the constraint
     body rather than trusting its name, run a SCOPED type-check for a claimed type error, confirm a
     proposed citation is current, and recompute any count. That gate is written for CR-local but
     applies identically here — Pitfall #7 was broadened to cloud CR at count=5.

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

`agent-workflow.md § Apply-vs-Defer Discipline` is binding here and **default is APPLY**. DEFER
requires **all three** of: ≥ 30 LOC estimated (code + tests + docs), a genuinely separate concern
that could stand as its own PR, and a design decision this PR does not establish. A finding that
meets only one — "it's just a UX enhancement", "it's only a coverage gap", "it's a big doc rewrite" —
is an APPLY, not a defer. Each of these used to be listed here as an independent defer criterion;
they are not, and the looser list is what let deferrals accumulate.

Every deferred issue carries effort (S/M/L) + priority (P0–P2) + acceptance criteria + a link to the
originating finding. And **two budgets bind on top of the per-item test**: VOLUME (0-2 deferrals
per PR; 3+ means re-triage every survivor and name them in the push summary) and RATIO (before
pushing, count issues this PR closes against issues it files (every issue created on this branch after the merge-base, whatever its origin — the PR body's `## Deferred` section must name them all) — if `filed > 0 AND filed >= closed`,
either claim the first-illumination exemption on its test or re-triage and apply some of them). A PR
that files nothing clears the ratio check whatever it closes.

### Skip if:
- False positive (CodeRabbit misread the code)
- Already handled by existing defense-in-depth
- Disagree with the suggestion (explain why)
