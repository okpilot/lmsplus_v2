#!/usr/bin/env bash
# Post-commit hook: runs the test-writer agent to check for missing tests.
# Non-blocking — writes tests but does not fail the commit.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
AGENT_PROMPT="$REPO_ROOT/.claude/agents/test-writer.md"

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

PROMPT="$(cat "$AGENT_PROMPT")

---

## New/modified source files in commit ${COMMIT_HASH}:

${NEW_FILES}

For each file above:
1. Read the source file
2. Check if a co-located .test.ts/.test.tsx file exists
3. If no test exists and the file exports testable functions/components, write tests
4. If tests exist, check if they cover the new changes — add tests if needed
5. Skip files that are pure types, config, or have no testable exports"

echo "$PROMPT" | claude --print --model claude-sonnet-4-6 --allowedTools "Read Write Edit Glob Grep" --max-budget-usd 0.10 2>&1 || true

echo "[test-writer] Done."
