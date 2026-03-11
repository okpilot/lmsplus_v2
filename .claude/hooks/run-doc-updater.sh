#!/usr/bin/env bash
# Post-commit hook: runs the doc-updater agent to check if docs need updating.
# Non-blocking — makes updates but does not fail the commit.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
DIFF=$(git diff HEAD~1..HEAD 2>/dev/null || echo "")
COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%s)

if [ -z "$DIFF" ]; then
  exit 0
fi

# Only run if the commit touches code files (not just docs)
CODE_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | grep -v '^docs/' | grep -v 'MEMORY.md' | grep -v '.md$' || true)
if [ -z "$CODE_FILES" ]; then
  echo "[doc-updater] Only doc files changed. Skipping."
  exit 0
fi

echo "[doc-updater] Checking if docs need updating after $COMMIT_HASH..."

TMPFILE=$(mktemp)
cat "$REPO_ROOT/.claude/agents/doc-updater.md" > "$TMPFILE"
printf "\n---\n\n## Commit: %s — %s\n\n## Changed files:\n%s\n\n## Diff:\n\`\`\`diff\n%s\n\`\`\`\n\nCheck if any project docs need updating based on this commit. If so, make the updates. If not, say 'No doc updates needed.'" "$COMMIT_HASH" "$COMMIT_MSG" "$CODE_FILES" "$DIFF" >> "$TMPFILE"

cat "$TMPFILE" | env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude --print \
  --model claude-haiku-4-5-20251001 \
  --allowedTools "Read Edit" \
  --no-session-persistence 2>&1 || true

rm -f "$TMPFILE"
echo "[doc-updater] Done."
