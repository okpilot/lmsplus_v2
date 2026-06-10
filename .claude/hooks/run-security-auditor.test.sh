#!/usr/bin/env bash
# Tests for the verdict parser in run-security-auditor.sh (--parse-verdict mode).
# Regression coverage for issue #832: a `BLOCKED: ...` verdict with trailing prose
# was mis-parsed as approval and let a HIGH finding reach the remote.
# No framework — run directly: bash .claude/hooks/run-security-auditor.test.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/run-security-auditor.sh"

if [ ! -f "$HOOK" ]; then
  echo "ERROR: Hook script not found at $HOOK" >&2
  exit 1
fi

PASS=0
FAIL=0

# run_case <name> <expected_exit_code> <transcript>
run_case() {
  local name="$1"
  local expected="$2"
  local transcript="$3"
  local actual=0
  printf '%s\n' "$transcript" | bash "$HOOK" --parse-verdict >/dev/null 2>&1 || actual=$?
  if [ "$actual" -eq "$expected" ]; then
    echo "PASS: $name (exit $actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# 1. The real #832 regression transcript: BLOCKED with trailing prose on the last line.
run_case "BLOCKED with trailing prose (issue #832 regression)" 1 \
"## Security Audit Findings

[HIGH] 099b migration: get_admin_dashboard_students missing org filter
Details of the finding go here.

--- VERDICT ---
BLOCKED: Fix the HIGH finding before pushing."

# 2. Bare BLOCKED as last line.
run_case "bare BLOCKED as last line" 1 \
"Some findings text.

BLOCKED"

# 3. BLOCKED mid-transcript followed by other lines.
run_case "BLOCKED mid-transcript followed by other lines" 1 \
"Findings:
BLOCKED
Additional trailing commentary the model added afterwards."

# 4. Clean transcript ending with a lone APPROVED line.
run_case "lone APPROVED line approves" 0 \
"## Security Audit Findings

No CRITICAL or HIGH issues found.

APPROVED"

# 5. APPROVED with trailing prose and no bare APPROVED line — fail closed.
run_case "APPROVED with trailing prose fails closed" 1 \
"No CRITICAL or HIGH issues found.

APPROVED — no issues"

# 6. BLOCKED with leading whitespace — the [[:space:]]* anchor must still match.
run_case "BLOCKED with leading whitespace" 1 \
"Findings text.
  BLOCKED: indented verdict"

# 7. Neither token present (e.g. an API error) — fail closed.
run_case "neither token present fails closed" 1 \
"Error: API connection refused (ECONNREFUSED 127.0.0.1:443)
Please try again later."

# 8. Empty transcript (e.g. claude CLI produces no output) — fail closed.
run_case "empty transcript fails closed" 1 ""

# 9. APPROVED appears before BLOCKED in the same transcript — BLOCKED must win.
#    This is the critical fail-closed property: any BLOCKED anywhere blocks the push,
#    regardless of what other tokens appear. The parser checks BLOCKED first.
run_case "APPROVED then BLOCKED — BLOCKED wins" 1 \
"No issues found.

APPROVED

Wait, actually one more thing:
BLOCKED: forgot to mention the HIGH finding."

# 10. CRLF line endings — Windows-style transcripts (e.g. pipes through cmd.exe on CI).
#     [[:space:]] in the POSIX character class includes \r, so both verdicts must parse.
#     APPROVED\r should satisfy ^[[:space:]]*APPROVED[[:space:]]*$ because \r matches [[:space:]].
run_case_raw_bytes() {
  local name="$1"
  local expected="$2"
  local actual=0
  printf '%b' "$3" | bash "$HOOK" --parse-verdict >/dev/null 2>&1 || actual=$?
  if [ "$actual" -eq "$expected" ]; then
    echo "PASS: $name (exit $actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}
run_case_raw_bytes "CRLF APPROVED approves" 0 \
  "No CRITICAL or HIGH issues found.\r\nAPPROVED\r\n"
run_case_raw_bytes "CRLF BLOCKED blocks" 1 \
  "Findings:\r\nBLOCKED: RLS gap.\r\n"

# 11. APPROVED with leading whitespace — the ^[[:space:]]* anchor allows indented verdicts
#     (symmetrical with case 6 for BLOCKED). Mirrors real-world agent output where the
#     model may indent its verdict line. Pinning as approved so a future regex tightening
#     is visible and deliberate.
run_case "APPROVED with leading whitespace approves" 0 \
"No CRITICAL or HIGH issues found.

  APPROVED"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
