Start the spec-workflow dashboard and confirm it's running.

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

## What to do
1. Run `npx -y @pimzino/spec-workflow-mcp@latest --dashboard` in the background
2. Wait a few seconds, then confirm the dashboard is accessible on http://localhost:5000
3. Report the URL to the user
