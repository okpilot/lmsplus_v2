#!/usr/bin/env bash
# Fires before Claude Code compresses conversation context.
# Saves a HANDOVER file so nothing is lost when context is compressed.
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel)" || { echo "ERROR: not in a git repo"; exit 1; }
HANDOVER_DIR="$PROJECT_ROOT/.claude/handovers"
mkdir -p "$HANDOVER_DIR"

DATE=$(date +%Y-%m-%d)
HANDOVER_FILE="$HANDOVER_DIR/HANDOVER-$DATE.md"

cat > "$HANDOVER_FILE" << 'HANDOVER'
# Session Handover

This file was auto-generated before context compression.
It captures the current state to allow seamless continuation.

## What to do next
1. Read `docs/plan.md` — check current phase and status
2. Read this file for session-specific context
3. Check `git log --oneline -10` to see what was built

## Current session summary
(This is an auto-generated stub — the PreCompact hook fires before the AI
can write session-specific notes. Check git log for actual progress.)
HANDOVER

echo "Handover saved to $HANDOVER_FILE"
exit 0
