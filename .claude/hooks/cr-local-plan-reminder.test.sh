#!/usr/bin/env bash
# Tests for cr-local-plan-reminder.sh (stdin rewrite, commit 5923087a).
#
# The hook was rewritten from argv-based input to stdin-based input in this commit
# (mirroring guard-bash.js and review-gate.js), and the JSON key was updated from
# a flat `command` to `tool_input.command ?? command`.
#
# Run directly: bash .claude/hooks/cr-local-plan-reminder.test.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/cr-local-plan-reminder.sh"

if [ ! -f "$HOOK" ]; then
  echo "ERROR: Hook script not found at $HOOK" >&2
  exit 1
fi

PASS=0
FAIL=0

# run_case <name> <expected_exit_code> <stdin> [<grep_for_output>]
# When grep_for_output is set, also asserts stdout+stderr contains that pattern.
run_case() {
  local name="$1"
  local expected_exit="$2"
  local stdin="$3"
  local grep_pattern="${4:-}"
  local actual=0
  local output
  output="$(printf '%s' "$stdin" | bash "$HOOK" 2>&1)" || actual=$?
  if [ "$actual" -ne "$expected_exit" ]; then
    echo "FAIL: $name (expected exit $expected_exit, got $actual)"
    FAIL=$((FAIL + 1))
    return
  fi
  if [ -n "$grep_pattern" ] && ! printf '%s' "$output" | grep -q "$grep_pattern"; then
    echo "FAIL: $name (output did not match pattern: $grep_pattern)"
    printf '%s\n' "$output" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    return
  fi
  echo "PASS: $name (exit $actual)"
  PASS=$((PASS + 1))
}

# run_case_no_output <name> <stdin>
# Asserts the hook exits 0 AND emits no meaningful output (the reminder must NOT fire).
run_case_no_output() {
  local name="$1"
  local stdin="$2"
  local actual=0
  local output
  output="$(printf '%s' "$stdin" | bash "$HOOK" 2>&1)" || actual=$?
  if [ "$actual" -ne 0 ]; then
    echo "FAIL: $name (expected exit 0, got $actual)"
    FAIL=$((FAIL + 1))
    return
  fi
  if [ -n "$output" ]; then
    echo "FAIL: $name (expected no output, got: $(printf '%s' "$output" | head -1))"
    FAIL=$((FAIL + 1))
    return
  fi
  echo "PASS: $name (exit 0, no output)"
  PASS=$((PASS + 1))
}

# 1. The main happy path: nested tool_input.command contains 'coderabbit review'
#    → the reminder banner must fire.
run_case "tool_input.command with 'coderabbit review' fires the reminder" 0 \
  '{"tool_input":{"command":"coderabbit review --plain --base master -c .coderabbit.yaml"}}' \
  "cr-local-plan-reminder"

# 2. tool_input.command does NOT contain 'coderabbit review' — hook exits cleanly, no output.
run_case_no_output "tool_input.command with unrelated command produces no output" \
  '{"tool_input":{"command":"npx vitest run apps/web/src/foo.test.ts"}}'

# 3. Flat JSON shape backward-compat: the hook falls back to obj?.command when
#    tool_input is absent. The reminder must still fire on this older payload shape.
run_case "flat command field (backward-compat) fires the reminder" 0 \
  '{"command":"coderabbit review --plain --base master"}' \
  "cr-local-plan-reminder"

# 4. Empty stdin — the raw fallback string is empty, which does not contain
#    'coderabbit review', so the hook must exit 0 with no output.
run_case_no_output "empty stdin produces no output" ""

# 5. Unparseable JSON — falls back to the raw input string. Since the raw string
#    does not contain 'coderabbit review', no reminder should fire.
run_case_no_output "unparseable JSON produces no output" "not-json-at-all"

# 6. Oversized stdin — head -c 1000000 truncates the payload before the
#    'coderabbit review' substring (which lies past the 1MB mark), so the
#    hook must exit 0 with no output.
#    Regression guard: reverting to 'cat' would expose the full payload,
#    the raw-string fallback would see 'coderabbit review', and the reminder
#    would incorrectly fire.
big_padding="$(printf '%1100000s' '' | tr ' ' 'x')"
run_case_no_output \
  "oversized stdin: 'coderabbit review' past 1MB boundary is truncated — no reminder fires" \
  "${big_padding}coderabbit review"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
