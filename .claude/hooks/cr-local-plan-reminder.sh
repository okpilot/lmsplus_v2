#!/usr/bin/env bash
# PostToolUse hook for Bash. If the command invoked `coderabbit review`,
# emit a reminder to plan + run the post-commit pipeline before/after
# applying findings. The hook runs after the bash command's output has
# been returned to the orchestrator, so the reminder appears as the last
# thing the orchestrator reads from this tool result.
#
# Tool input is passed as a CLI argument by `.claude/settings.json`
# (interpolated from $CLAUDE_TOOL_INPUT at hook invocation time). This
# mirrors the proven pattern used by `guard-bash.js` for PreToolUse —
# relying on env var inheritance into PostToolUse hooks is unverified
# in this harness. Match the literal `coderabbit review` substring
# inside the JSON payload's .command field.

input="${1:-}"

# Robust substring check: look for `coderabbit review` anywhere in the
# command string. False positive risk is negligible — no other tool
# shares that token sequence.
if [[ "$input" != *'coderabbit review'* ]]; then
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
