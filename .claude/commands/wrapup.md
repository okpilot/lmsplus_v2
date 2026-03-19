# End-of-session wrap-up

Sync the project board, docs, and leave things clean for next session.

## Checklist

### 1. Board sync

- List all items currently "In Progress" on the board:

  ```bash
  gh project item-list 2 --owner okpilot --format json
  ```

- For each: is it actually done? → close the issue. Still in progress? → leave it, add a comment with current state.
- Any work done this session that has no issue? → create one and close it.

### 2. New issues discovered

- Any bugs found during this session? → create issues, add to board with Priority + Size.
- Any tech debt noted? → create issues with `tech-debt` label.
- Any feature ideas discussed? → create draft issues or full issues as appropriate.

### 3. Docs sync

- Is `docs/plan.md` status section current? Update if needed.
- Any decisions made this session? → check `docs/decisions.md`.

### 4. Sanity checks

Run through each item. Report pass/fail with brief notes.

**Rules & memory:**
- **Rules consistency** — did any subagent propose a rule change? Does it conflict with existing rules? (e.g., triage rules contradicting each other)
- **Memory drift** — is MEMORY.md under 200 lines and accurate? Any stale entries to remove?

**Agent pipeline:**
- **Agent findings resolved** — every ISSUE/CRITICAL from post-commit agents got fixed? No orphans?
- **Post-commit pipeline completeness** — did every commit get all 4 agents? Did we run the learner after?
- **Fix-commit re-review** — when production code was fixed from agent findings, did we re-run agents on the fix commit?
- **Pre-push PR sweep** — for branches with 2+ commits, did we run `git diff master...HEAD` semantic review before pushing?
- **Agent scope violations** — did any agent act outside its scope? (test-writer editing prod code, doc-updater making arch decisions)

**Process compliance:**
- **Context7 compliance** — list any instance where training data or web search was used for external tools before checking Context7. Note consequences.
- **Orphaned follow-ups** — grep the conversation for "follow-up", "separate issue", "later", "next session". Did each get a GitHub issue?
- **Deferred items tracked** — anything marked DEFER in CodeRabbit triage — was a GitHub issue created?
- **Secret hygiene** — any secrets logged, echoed, or displayed during the session? Note if rotation needed.

### 5. Session summary

Present to user:
- **Done this session:** list of closed issues
- **Still in progress:** list of items left open (with context)
- **New issues created:** list with priority
- **Board state:** X todo / Y in progress / Z done (current sprint)

### 6. Next session hint

- What should the next session start with?
- Any blockers or dependencies to resolve before then?
