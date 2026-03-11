#!/usr/bin/env bash
# Post-commit hook: runs the code-reviewer agent on the last commit diff.
# Non-blocking — logs output but does not fail the commit.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
AGENT_PROMPT="$REPO_ROOT/.claude/agents/code-reviewer.md"
MEMORY_FILE="$REPO_ROOT/.claude/agent-memory/code-reviewer/patterns.md"
RULES_FILE="$REPO_ROOT/.claude/rules/code-style.md"

DIFF=$(git diff HEAD~1..HEAD 2>/dev/null || echo "No previous commit to diff against")
COMMIT_HASH=$(git rev-parse --short HEAD)

if [ -z "$DIFF" ] || [ "$DIFF" = "No previous commit to diff against" ]; then
  echo "[code-reviewer] No diff to review. Skipping."
  exit 0
fi

echo "[code-reviewer] Reviewing commit $COMMIT_HASH..."

PROMPT="$(cat "$AGENT_PROMPT")

---

## Commit diff (${COMMIT_HASH}):

\`\`\`diff
${DIFF}
\`\`\`

Review this diff now. Output your findings in the format specified above."

echo "$PROMPT" | claude --print --model claude-haiku-4-5-20251001 --allowedTools "Read Edit" --max-budget-usd 0.05 2>&1 || true

echo "[code-reviewer] Done."
