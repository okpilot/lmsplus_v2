#!/usr/bin/env bash
# Post-commit hook: runs the doc-updater agent to check if docs need updating.
# Non-blocking — makes updates but does not fail the commit.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
AGENT_PROMPT="$REPO_ROOT/.claude/agents/doc-updater.md"

DIFF=$(git diff HEAD~1..HEAD 2>/dev/null || echo "")
COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%s)

if [ -z "$DIFF" ]; then
  echo "[doc-updater] No diff to check. Skipping."
  exit 0
fi

# Only run if the commit touches code files (not just docs)
CODE_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | grep -v '^docs/' | grep -v 'MEMORY.md' | grep -v '.md$' || true)
if [ -z "$CODE_FILES" ]; then
  echo "[doc-updater] Only doc files changed. Skipping."
  exit 0
fi

echo "[doc-updater] Checking if docs need updating after $COMMIT_HASH..."

PROMPT="$(cat "$AGENT_PROMPT")

---

## Commit: ${COMMIT_HASH} — ${COMMIT_MSG}

## Changed files:
${CODE_FILES}

## Diff:
\`\`\`diff
${DIFF}
\`\`\`

Check if any project docs need updating based on this commit. If so, make the updates. If not, say 'No doc updates needed.'"

echo "$PROMPT" | claude --print --model claude-haiku-4-5-20251001 --allowedTools "Read Edit" --max-budget-usd 0.05 2>&1 || true

echo "[doc-updater] Done."
