#!/usr/bin/env bash
# Pre-push hook: runs the security-auditor agent on all changes being pushed.
# BLOCKING — exits non-zero if CRITICAL or HIGH findings are found.

set -euo pipefail
unset CLAUDECODE

REPO_ROOT="$(git rev-parse --show-toplevel)"
AGENT_PROMPT="$REPO_ROOT/.claude/agents/security-auditor.md"

# Get the diff of what's being pushed
REMOTE_REF=$(git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "origin/master")
DIFF=$(git diff "$REMOTE_REF"...HEAD 2>/dev/null || git diff HEAD 2>/dev/null || echo "")

if [ -z "$DIFF" ]; then
  echo "[security-auditor] No diff to audit. Skipping."
  exit 0
fi

echo "[security-auditor] Auditing changes before push..."

PROMPT="$(cat "$AGENT_PROMPT")

---

## Diff being pushed:

\`\`\`diff
${DIFF}
\`\`\`

Audit this diff now. Output your findings in the format specified above.
IMPORTANT: If you find any CRITICAL or HIGH issues, your last line MUST be exactly: BLOCKED
If no CRITICAL or HIGH issues, your last line MUST be exactly: APPROVED"

OUTPUT=$(echo "$PROMPT" | claude --print --model claude-sonnet-4-6 --allowedTools "Read" --max-budget-usd 0.10 2>&1) || true

echo "$OUTPUT"

# Check if blocked
LAST_LINE=$(echo "$OUTPUT" | tail -1 | tr -d '[:space:]')
if [ "$LAST_LINE" = "BLOCKED" ]; then
  echo ""
  echo "[security-auditor] ❌ Push blocked. Fix CRITICAL/HIGH findings above."
  exit 1
fi

echo "[security-auditor] ✅ Push approved."
exit 0
