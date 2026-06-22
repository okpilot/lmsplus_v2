#!/usr/bin/env bash
# .github/scripts/wait-for-supabase.sh — issue #937
# Readiness-gate the local Supabase API (Kong) before CI test/build steps, so a
# slow gateway start (a 502 before Kong finishes booting) is waited out rather
# than surfacing as a test failure. Gates BRING-UP ONLY — it runs before the test
# runners, so real test/migration failures still fail on the first occurrence.
#
# `supabase start` already blocks on Postgres health (config.toml health_timeout),
# so the psql-only migration-test job does not call this; only the jobs that drive
# the REST API (integration-tests, e2e-tests, redteam, lighthouse) need the Kong gate.
#
# Tunable via env: SUPABASE_HEALTH_URL, SUPABASE_HEALTH_MAX_ATTEMPTS, SUPABASE_HEALTH_INTERVAL.
set -euo pipefail

HEALTH_URL="${SUPABASE_HEALTH_URL:-http://localhost:54321/auth/v1/health}"
MAX_ATTEMPTS="${SUPABASE_HEALTH_MAX_ATTEMPTS:-45}"
INTERVAL_SECONDS="${SUPABASE_HEALTH_INTERVAL:-2}"

echo "Waiting for Supabase API readiness at ${HEALTH_URL} (max ${MAX_ATTEMPTS} attempts × ${INTERVAL_SECONDS}s)"
attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  # Guarded under `set -e`: a failed probe (curl exit 7/22 while Kong is still
  # booting) is the expected not-ready state, not a script-fatal error.
  if curl -sf -o /dev/null "$HEALTH_URL"; then
    echo "✓ Supabase API ready (attempt ${attempt}/${MAX_ATTEMPTS})"
    exit 0
  fi
  echo "… not ready (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${INTERVAL_SECONDS}s"
  attempt=$((attempt + 1))
  sleep "$INTERVAL_SECONDS"
done

echo "::error::Supabase API did not become ready within $((MAX_ATTEMPTS * INTERVAL_SECONDS))s (${MAX_ATTEMPTS} attempts × ${INTERVAL_SECONDS}s) — failing the job"
# Container-state snapshot to aid diagnosing a genuine stuck/wedged startup.
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -i supabase || true
exit 1
