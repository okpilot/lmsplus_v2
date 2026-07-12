#!/usr/bin/env bash
# PostToolUse hook for Bash. If the command invoked `coderabbit review`,
# emit a reminder to plan + run the post-commit pipeline before/after
# applying findings. The hook runs after the bash command's output has
# been returned to the orchestrator, so the reminder appears as the last
# thing the orchestrator reads from this tool result.
#
# Claude Code delivers the hook payload on STDIN as JSON
# ({"tool_input":{"command":"..."}}) — there is no $CLAUDE_TOOL_INPUT
# argv. This mirrors the stdin pattern used by `guard-bash.js` and
# `review-gate.js`. Match the literal `coderabbit review` substring
# inside the JSON payload's command field.

input="$(head -c 1000000)" # 1MB cap — parity with guard-bash/review-gate stdin bounds

# Parse the .command field from the JSON tool-input payload before
# matching, so a description or env value containing "coderabbit review"
# does not trigger the reminder. Falls back to the raw input if the
# payload is not JSON.
command_input="$input"
if parsed_command="$(node -e '
const raw = process.argv[1] ?? "";
try {
  const obj = JSON.parse(raw);
  const cmd = obj?.tool_input?.command ?? obj?.command;
  process.stdout.write(typeof cmd === "string" ? cmd : "");
} catch {
  process.stdout.write(raw);
}
' "$input" 2>/dev/null)"; then
  command_input="$parsed_command"
fi

if [[ "$command_input" != *'coderabbit review'* ]]; then
  exit 0
fi

cat <<'EOF'

════════════════════════════════════════════════════════════════════════════
[cr-local-plan-reminder] Triage → Plan → Execute → Pipeline → Re-run

The review output above is INPUT, not a TODO list. Required orchestrator
flow before reading the next user message:

  1. READ THE SOURCE for every finding. CR's file paths and line numbers
     are sometimes wrong — verify with grep/Read.
  2. TRIAGE each finding into apply / skip-with-reason / defer-to-issue.
     Output the triage table to the user.
  3. PLAN inline. Files to change, blast radius (callers, sibling files,
     tests, docs), risks, verification step. Plan autonomously — no need
     to wait for explicit approval if every applied finding is single-file
     < 10 LOC and pattern-matched. The plan is your contract with yourself
     to actually read the code, not a reflex-fix.
  4. EXECUTE the plan. Apply, type-check, run the affected tests, commit.
  5. RUN POST-COMMIT REVIEW AGENTS in parallel: code-reviewer,
     semantic-reviewer, doc-updater, test-writer (mandatory) plus red-team
     if security-sensitive paths changed, plus coderabbit-sync if rules
     files changed. Then learner.
  6. RE-RUN `coderabbit review` for the next round.

Do NOT skip step 3 (plan) or step 5 (review agents). Both have been
called out as recurring failure modes during PR #108 / 2026-05-07.
════════════════════════════════════════════════════════════════════════════
EOF

exit 0
