#!/usr/bin/env bash
# Post-commit hook: runs the code-reviewer agent on the last commit diff.
# Non-blocking — logs output but does not fail the commit.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
DIFF=$(git diff HEAD~1..HEAD 2>/dev/null || echo "")
COMMIT_HASH=$(git rev-parse --short HEAD)

if [ -z "$DIFF" ]; then
  echo "[code-reviewer] No diff to review. Skipping."
  exit 0
fi

echo "[code-reviewer] Reviewing commit $COMMIT_HASH..."

# Write prompt to temp file to avoid argument length limits
TMPFILE=$(mktemp)
cat "$REPO_ROOT/.claude/agents/code-reviewer.md" > "$TMPFILE"
printf "\n---\n\n## Commit diff (%s):\n\n\`\`\`diff\n%s\n\`\`\`\n\nReview this diff now. Output your findings in the format specified above." "$COMMIT_HASH" "$DIFF" >> "$TMPFILE"

env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude -p "$(cat "$TMPFILE")" \
  --model claude-haiku-4-5-20251001 \
  --allowedTools "Read Edit" \
  --max-budget-usd 0.05 \
  --no-session-persistence 2>&1 || true

rm -f "$TMPFILE"
echo "[code-reviewer] Done."
