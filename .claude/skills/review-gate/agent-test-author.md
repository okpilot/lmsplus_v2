# Agent Rules — test-author
> Model: sonnet | Trigger: after plan approval, before Execute — once per plan | Writes failing tests; does not gate
## Dispatch
- `subagent_type: test-author`, no `isolation`.
- Brief = the `test-author` template in `.claude/hooks/gate-briefs.json`, `{plan}` and `{branch}` filled. `guard-agent-brief.js` blocks any other brief; SendMessage to test-author is blocked.
- `{plan}` is `.work/<path>.md`, no segment starting with `.`, an existing regular file inside `.work/`.
- Skip only when the plan records `Tests first: SKIP — <reason>`: no behaviour change (docs, rules, comments).
## Handling Results
### DO
- Read the terminal message's `EVIDENCE:` line: the failing run's command and summary.
- Re-run the command. Each failure must be an assertion failure for the behaviour the acceptance criterion states — not a syntax or fixture error; a module-not-found error is valid only for a module the plan creates.
- Check every acceptance criterion maps to a test, or the agent says it cannot test it.
- Commit the tests before dispatching a worktree-isolated implementer; otherwise they ride the execute or fixup commit.
- Name the test files read-only in every execute brief.
- Mutation entries (`*.mutations.json`) and their `// GROUP:` marker lines are written after execute, by the implementer.
- A wrong test: sharpen its acceptance criterion in the plan, have the revised plan re-approved, then re-dispatch test-author with the same template.
### NEVER
- Execute before the `EVIDENCE:` line exists.
- Let the implementer edit test-author's tests (`// GROUP:` marker lines excepted).
- Fix a wrong test by hand or via SendMessage.
- Let the agent write production code or under `apps/web/e2e/redteam/`.
