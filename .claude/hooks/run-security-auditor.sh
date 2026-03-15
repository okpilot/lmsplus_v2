#!/usr/bin/env bash
# Pre-push hook: runs the security-auditor agent on all changes being pushed.
# BLOCKING — exits non-zero if CRITICAL or HIGH findings are found.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REMOTE_REF=$(git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "origin/master")
DIFF_FULL=$(git diff "$REMOTE_REF"...HEAD 2>/dev/null || git diff HEAD 2>/dev/null || echo "")

if [ -z "$DIFF_FULL" ]; then
  echo "[security-auditor] No diff to audit. Skipping."
  exit 0
fi

DIFF_LINES=$(printf '%s' "$DIFF_FULL" | wc -l)
MAX_DIFF_LINES=3000

echo "[security-auditor] Auditing changes before push ($DIFF_LINES lines)..."

# For large diffs, filter to security-sensitive files only
if [ "$DIFF_LINES" -gt "$MAX_DIFF_LINES" ]; then
  echo "[security-auditor] Diff too large ($DIFF_LINES lines). Filtering to security-sensitive files..."
  DIFF=$(git diff "$REMOTE_REF"...HEAD -- \
    '*.env*' '**/migrations/**' '**/admin.*' '**/auth/**' \
    '**/middleware.*' '**/proxy.*' '**/actions.*' '**/route.ts' \
    '**/server.ts' '**/*schema*' '**/*security*' '**/next.config.*' \
    '**/*.sql' '**/fsrs.*' '**/.env*' 2>/dev/null || echo "")

  # If filtered diff is still too large, truncate
  FILTERED_LINES=$(printf '%s' "$DIFF" | wc -l)
  if [ "$FILTERED_LINES" -gt "$MAX_DIFF_LINES" ]; then
    echo "[security-auditor] Filtered diff still large ($FILTERED_LINES lines). Truncating to $MAX_DIFF_LINES lines."
    DIFF=$(printf '%s' "$DIFF" | head -n "$MAX_DIFF_LINES")
    DIFF="$DIFF
... (truncated — $FILTERED_LINES total lines, showing first $MAX_DIFF_LINES)"
  fi

  if [ -z "$DIFF" ]; then
    echo "[security-auditor] No security-sensitive files changed. Running stat-only audit..."
    DIFF=$(git diff "$REMOTE_REF"...HEAD --stat 2>/dev/null || echo "No changes")
  fi
else
  DIFF="$DIFF_FULL"
fi

TMPFILE=$(mktemp)
cat "$REPO_ROOT/.claude/agents/security-auditor.md" > "$TMPFILE"
printf "\n---\n\n## Diff being pushed:\n\n\`\`\`diff\n%s\n\`\`\`\n\nAudit this diff now. Output your findings in the format specified above.\nIMPORTANT: If you find any CRITICAL or HIGH issues, your last line MUST be exactly: BLOCKED\nIf no CRITICAL or HIGH issues, your last line MUST be exactly: APPROVED" "$DIFF" >> "$TMPFILE"

# Timeout after 120 seconds to prevent hanging
if command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout 120"
else
  TIMEOUT_CMD=""
fi

OUTPUT=$($TIMEOUT_CMD cat "$TMPFILE" | env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude --print \
  --model claude-sonnet-4-6 \
  --allowedTools "Read" \
  --no-session-persistence 2>&1) || {
  EXIT_CODE=$?
  rm -f "$TMPFILE"
  if [ "$EXIT_CODE" -eq 124 ]; then
    echo "[security-auditor] Timed out after 120s. Running basic checks instead..."
    # Fallback: simple grep-based checks for critical issues
    ISSUES=0

    # Check for .env files in diff
    if printf '%s' "$DIFF_FULL" | grep -q '^\+\+\+ b/.*\.env'; then
      echo "[CRITICAL] .env file being committed!"
      ISSUES=$((ISSUES + 1))
    fi

    # Check for hardcoded secrets
    if printf '%s' "$DIFF_FULL" | grep -qE '^\+.*(eyJ|sk_live_|service_role|-----BEGIN)'; then
      echo "[CRITICAL] Potential secret/credential in diff!"
      ISSUES=$((ISSUES + 1))
    fi

    # Check for SELECT * on questions
    if printf '%s' "$DIFF_FULL" | grep -qE "^\+.*select\('\*'\).*questions|^\+.*SELECT \* FROM questions"; then
      echo "[CRITICAL] Direct SELECT * on questions table (answer exposure risk)!"
      ISSUES=$((ISSUES + 1))
    fi

    # Check for adminClient in added lines of app/ files
    if printf '%s' "$DIFF_FULL" | grep -E '^\+.*adminClient' | grep -v '^\+\+\+' | grep -q 'adminClient'; then
      # Verify it's in an app/ file by checking surrounding file headers
      if printf '%s' "$DIFF_FULL" | awk '/^\+\+\+ b\/apps\/web\/app\/.*\.tsx?/{found=1} found && /^\+[^+]/ && /adminClient/{print; exit}' | grep -q 'adminClient'; then
        echo "[HIGH] adminClient used in app/ code!"
        ISSUES=$((ISSUES + 1))
      fi
    fi

    if [ "$ISSUES" -gt 0 ]; then
      echo "[security-auditor] Found $ISSUES issue(s) in fallback scan. Push blocked."
      exit 1
    fi
    echo "[security-auditor] Fallback scan passed. Push approved."
    exit 0
  fi
  echo "[security-auditor] Agent failed (exit $EXIT_CODE). Running fallback checks..."
  # Run the same fallback grep checks as the timeout branch
  ISSUES=0
  if printf '%s' "$DIFF_FULL" | grep -q '^\+\+\+ b/.*\.env'; then
    echo "[CRITICAL] .env file being committed!"
    ISSUES=$((ISSUES + 1))
  fi
  if printf '%s' "$DIFF_FULL" | grep -qE '^\+.*(eyJ|sk_live_|service_role|-----BEGIN)'; then
    echo "[CRITICAL] Potential secret/credential in diff!"
    ISSUES=$((ISSUES + 1))
  fi
  if printf '%s' "$DIFF_FULL" | grep -qE "^\+.*select\('\*'\).*questions|^\+.*SELECT \* FROM questions"; then
    echo "[CRITICAL] Direct SELECT * on questions table (answer exposure risk)!"
    ISSUES=$((ISSUES + 1))
  fi
  # Check for adminClient in added lines of app/ files
  if printf '%s' "$DIFF_FULL" | awk '/^\+\+\+ b\/apps\/web\/app\/.*\.tsx?/{found=1} /^\+\+\+ b\//{if(!/apps\/web\/app\//)found=0} found && /^\+[^+]/ && /adminClient/{print; exit}' | grep -q 'adminClient'; then
    echo "[HIGH] adminClient used in app/ code!"
    ISSUES=$((ISSUES + 1))
  fi
  if [ "$ISSUES" -gt 0 ]; then
    echo "[security-auditor] Found $ISSUES issue(s) in fallback scan. Push blocked."
    exit 1
  fi
  echo "[security-auditor] Fallback scan passed. Push approved."
  exit 0
}

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
