#!/usr/bin/env bash
# Pre-push hook: runs the security-auditor agent on all changes being pushed.
# BLOCKING — exits non-zero if CRITICAL or HIGH findings are found.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REMOTE_REF=$(git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "origin/master")
DIFF=$(git diff "$REMOTE_REF"...HEAD 2>/dev/null || git diff HEAD 2>/dev/null || echo "")

if [ -z "$DIFF" ]; then
  echo "[security-auditor] No diff to audit. Skipping."
  exit 0
fi

echo "[security-auditor] Auditing changes before push..."

TMPFILE=$(mktemp)
cat "$REPO_ROOT/.claude/agents/security-auditor.md" > "$TMPFILE"
printf "\n---\n\n## Diff being pushed:\n\n\`\`\`diff\n%s\n\`\`\`\n\nAudit this diff now. Output your findings in the format specified above.\nIMPORTANT: If you find any CRITICAL or HIGH issues, your last line MUST be exactly: BLOCKED\nIf no CRITICAL or HIGH issues, your last line MUST be exactly: APPROVED" "$DIFF" >> "$TMPFILE"

OUTPUT=$(cat "$TMPFILE" | env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude --print \
  --model claude-sonnet-4-6 \
  --allowedTools "Read" \
  --max-budget-usd 0.10 \
  --no-session-persistence 2>&1) || true

rm -f "$TMPFILE"
echo "$OUTPUT"

LAST_LINE=$(echo "$OUTPUT" | tail -1 | tr -d '[:space:]')
if [ "$LAST_LINE" = "BLOCKED" ]; then
  echo ""
  echo "[security-auditor] Push blocked. Fix CRITICAL/HIGH findings above."
  exit 1
fi

echo "[security-auditor] Push approved."
exit 0
