# Agent Workflow — Pipeline & Orchestrator Rules

> How the orchestrator (Claude) runs and coordinates post-commit agents.
> Per-agent handling rules are in separate `agent-*.md` files in this directory.

---

## Pipeline Order

```
git commit
    │
    ├─► code-reviewer   (haiku)   ─┐
    ├─► semantic-reviewer (sonnet) ─┤  parallel, wait for all 4
    ├─► doc-updater      (haiku)   ─┤
    └─► test-writer      (sonnet)  ─┘
                                     │
                              read ALL results
                                     │
                              fix issues (commit)
                                     │
                              ┌──────┴──────┐
                              │   learner   │  (sonnet) — pattern detection
                              └──────┬──────┘
                                     │
                         (if rules changed)
                              ┌──────┴──────┐
                              │coderabbit-  │  (haiku) — sync .coderabbit.yaml
                              │   sync      │
                              └─────────────┘
```

## Orchestrator Role

- **You plan and review. Agents execute.**
- Read every agent result before proceeding. No fire-and-forget.
- If an agent found an issue, address it before moving on.
- Group related fixes into a single commit when possible.
- After fix commits that change production code, re-run semantic-reviewer on the new diff.
- Repeat until all agents report clean.

### DO
- Launch all 4 post-commit agents in parallel immediately after every commit.
- Read all results before starting any fixes.
- Report findings to the user in a summary table: agent / severity / count / status.
- Report ALL severity levels — not just criticals.
- Re-run agents on fix commits if production code changed.

### NEVER
- Skip post-commit agents. Ever. Not even for "trivial" commits.
- Start fixing after only one agent reports — wait for all 4.
- Fire-and-forget agents without reading results.
- Present "0 critical" as if that means clean — report every severity.
- Push with any unresolved CRITICAL, BLOCKING, or ISSUE finding.
- Push with failing tests.
- Characterize findings as "latent", "safe today", or "forward-looking" to justify skipping them.

---

*Per-agent rules: `agent-code-reviewer.md`, `agent-semantic-reviewer.md`, `agent-test-writer.md`, `agent-doc-updater.md`, `agent-learner.md`, `agent-security-auditor.md`, `agent-coderabbit-sync.md`*

*Last updated: 2026-03-12*
