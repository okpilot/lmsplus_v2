#!/usr/bin/env bash
# Post-commit hook: runs the test-writer agent to check for missing tests.
# Non-blocking — writes tests but does not fail the commit.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMIT_HASH=$(git rev-parse --short HEAD)

# Find new/modified .ts/.tsx files that are NOT tests and NOT config
NEW_FILES=$(git diff --name-only --diff-filter=AM HEAD~1..HEAD 2>/dev/null \
  | grep -E '\.(ts|tsx)$' \
  | grep -v '\.test\.' \
  | grep -v '\.spec\.' \
  | grep -v 'node_modules' \
  | grep -v 'types\.ts$' \
  | grep -v 'config' \
  | grep -v 'migrations' \
  || true)

if [ -z "$NEW_FILES" ]; then
  echo "[test-writer] No new source files to test. Skipping."
  exit 0
fi

echo "[test-writer] Checking for missing tests after $COMMIT_HASH..."

TMPFILE=$(mktemp)
cat "$REPO_ROOT/.claude/agents/test-writer.md" > "$TMPFILE"
printf "\n---\n\n## New/modified source files in commit %s:\n\n%s\n\nFor each file above:\n1. Read the source file\n2. Check if a co-located .test.ts/.test.tsx file exists\n3. If no test exists and the file exports testable functions/components, write tests\n4. If tests exist, check if they cover the new changes — add tests if needed\n5. Skip files that are pure types, config, or have no testable exports" "$COMMIT_HASH" "$NEW_FILES" >> "$TMPFILE"

cat "$TMPFILE" | env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude --print \
  --model claude-sonnet-4-6 \
  --allowedTools "Read Write Edit Glob Grep" \
  --no-session-persistence 2>&1 || true

rm -f "$TMPFILE"
echo "[test-writer] Done."
