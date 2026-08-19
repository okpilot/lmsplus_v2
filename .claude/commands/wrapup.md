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

### 3. Docs sync — VERIFY, don't discover

Docs, rules and mirrors are a **pre-push** gate (`/fullpush` **self-audit item 7b** — not action
step 7b, which is the Red Team run), so by the time you reach wrap-up they should already be
**committed**. This step confirms that, it does not do the work for the first time.

Committed-but-unpushed is a **valid** end state — pushing needs explicit user approval, and
`agent-workflow.md § Push Batching` says a change that does not move an open PR toward merge should
wait for a push that something else needs anyway. Report unpushed commits as status, never as a
process failure. The failure mode this step exists to catch is docs that were never *written*.

- Is `docs/plan.md` status current? Any decision made this session recorded in `docs/decisions.md`?
- Did every rule change land with its full mirror set? Read the rows off `agent-workflow.md
  § Rule-Mirror Sync` — do not work from a copy here, which is how the executable `.claude/hooks/*.sh`
  and `package.json` rows came to be missed on the branch that added them. The table is the list;
  its last row is open-ended and is answered by reading, not grepping.

**If you find something missing here, that is a process failure, not a to-do.** Say so explicitly,
fix it, and note it — because it means the change shipped in a PR whose docs did not match its
code, and the reviewers on that PR were reading the stale text. Do not quietly patch it and move
on; the point of finding it here is that it should have been impossible.

### 4. Sanity checks

Run through each item. Report pass/fail with brief notes.

**Rules & memory:**
- **Rules consistency** — did any subagent propose a rule change? Does it conflict with existing rules? (e.g., triage rules contradicting each other)
- **Memory drift** — is MEMORY.md under 200 lines and accurate? Any stale entries to remove?

**Agent pipeline:**
- **Agent findings resolved** — every ISSUE/CRITICAL from post-commit agents got fixed? No orphans?
- **Non-blocking findings surfaced** — list ALL SUGGESTION/WARNING/non-blocking findings from every agent and reviewer (post-commit agents, CodeRabbit, critics). For each one, the user must see it and decide: FIX NOW (<10 lines), DEFER (create GitHub issue), or SKIP (with reason). "Noted" is not a valid disposition — every finding gets a ticket or an explicit skip.
- **Post-commit pipeline completeness** — did every commit get the full cycle, or an explicitly-named exemption from `CLAUDE.md § Post-commit review` (docs-only → doc-updater; review-follow-up → semantic-reviewer — learner skipped on both)? Did we run the learner after each full cycle? **And the two CONDITIONAL agents** — red-team when the diff touched the security-path set (`supabase/migrations/**`, `packages/db/src/**`, quiz actions, auth, `proxy.ts`, `docs/security.md`), and coderabbit-sync when a rules file changed (`code-style.md`, `.claude/rules/security.md`, `docs/security.md`, `biome.json`, `CLAUDE.md`, or a new/changed `.claude/hooks/*.mjs` guard). Checking only the four core agents plus the learner silently passes a security-path commit that red-team never saw.
- **Fix-commit re-review** — when production code was fixed from agent findings, did we re-run agents on the fix commit?
- **Pre-push PR sweep** — for branches with 2+ commits, did we `git fetch origin` (and abort on failure) then run `git diff origin/master...HEAD` semantic review before pushing? A stale base silently distorts the sweep scope.
- **Pre-commit critics** — did plan-critic and implementation-critic run before each commit? Any skipped without justification? (Plan-critic can skip for single-file <10 lines; implementation-critic never skips)
- **Critic revision caps** — any plan-critic gate that hit the 4-round ceiling without meeting the consecutive-clean floor (2/3)? Any implementation-critic findings that took more than 2 rounds?
- **Agent scope violations** — did any agent act outside its scope? (test-writer editing prod code, doc-updater making arch decisions)

**Spec workflow:**
- **Spec artifacts** — if a spec was created this session, is it up-to-date with what was actually implemented? Any deviations not recorded?
- **Steering drift** — did doc-updater report any DRIFT findings? Were they resolved (steering doc updated or code fixed)?
- **Interview phase** — for multi-file changes, was the requirement interview run or explicitly skipped with "No ambiguities identified"?

**Task tracking:**
- **Task persistence** — if TaskCreate was used, are all tasks marked completed or properly noted as in-progress for next session?
- **Delegation protocol** — any delegation failures logged this session? Were they addressed in future prompts?

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

### 7. Log the run

- Invoke `/endrun` to append this session's row to `.claude/run-log.md`. Mandatory terminal step, not optional — the wrap-up is not complete until the run is logged.
