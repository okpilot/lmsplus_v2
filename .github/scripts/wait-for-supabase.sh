#!/usr/bin/env bash
# .github/scripts/wait-for-supabase.sh — issue #937
# Readiness-gate the local Supabase API (Kong) before CI test/build steps, so a
# slow gateway start (a 502 before Kong finishes booting) is waited out rather
# than surfacing as a test failure. Gates BRING-UP ONLY — it runs before the test
# runners, so real test/migration failures still fail on the first occurrence.
#
# `supabase start` already blocks on Postgres health (config.toml health_timeout), but every
# job that reaches the API through Kong needs this gate — including migration-test, whose
# `db reset` restarts the storage container and then probes the Storage API. The caller set is
# OPEN: derive it, do not trust a list here.
#   grep -rln wait-for-supabase.sh .github/workflows/
# (As of 2026-09-02 that is e2e.yml — migration-test, integration-tests, e2e-tests — plus
# redteam.yml and lighthouse.yml.) migration-test overrides SUPABASE_HEALTH_URL to
# /storage/v1/status, because the endpoint the CLI itself probes (/storage/v1/bucket) answers
# 400 without an apikey and so can never pass this script's `curl -sf`.
#
# There is NO stop/start restart path. If Kong is not serving within the budget it is a
# real failure, not a flake to re-run. (The previous inline `supabase stop && supabase start`
# recovery masked wedged startups and left the JWT keys already exported to $GITHUB_ENV /
# .env.local stale against the new instance.)
#
# Once ready, Kong's upstream keepalive pool is turned off (#1236, supabase/cli#6674): Kong
# 2.8 keeps idle PostgREST connections 60s, PostgREST closes them at ~30s, and a POST sent on
# a closed one returns 502 (nginx does not retry POST). Set SUPABASE_KONG_RELOAD=false to skip.
#
# Tunable via env: SUPABASE_HEALTH_URL, SUPABASE_HEALTH_MAX_ATTEMPTS, SUPABASE_HEALTH_INTERVAL,
# SUPABASE_KONG_RELOAD.
# Default budget: ~88s on the connection-refused path (45 probes, 44 × 2s sleeps between
# them; Kong typically boots in well under 30s on GitHub runners). Each probe is capped at
# 5s via curl --max-time, so a wedged-but-listening endpoint is bounded (worst case ~313s:
# 45 × 5s + 44 × 2s) rather than hanging the job.
# When the Kong reload runs (default), a second wait of up to 5 probes adds at most 33s
# (5 × 5s + 4 × 2s).
set -euo pipefail

HEALTH_URL="${SUPABASE_HEALTH_URL:-http://localhost:54321/auth/v1/health}"
MAX_ATTEMPTS="${SUPABASE_HEALTH_MAX_ATTEMPTS:-45}"
INTERVAL_SECONDS="${SUPABASE_HEALTH_INTERVAL:-2}"

# Probe until ready (exit status 0) or $1 attempts are spent (exit status 1).
wait_until_ready() {
  local max="$1" attempt=1
  echo "Waiting for Supabase API readiness at ${HEALTH_URL} (up to ${max} attempts, ${INTERVAL_SECONDS}s apart, 5s/probe)"
  while [ "$attempt" -le "$max" ]; do
    # Guarded under `set -e`: a failed probe (curl exit 7/22/28 while Kong is still
    # booting) is the expected not-ready state, not a script-fatal error.
    # --max-time caps each probe so a wedged-but-listening Kong (accepts the TCP
    # connection but never answers) can't hang the probe — and the job — forever.
    if curl -sf --max-time 5 -o /dev/null "$HEALTH_URL"; then
      echo "✓ Supabase API ready (attempt ${attempt}/${max})"
      return 0
    fi
    # Only sleep when another attempt remains — no wasted interval after the last probe.
    if [ "$attempt" -lt "$max" ]; then
      echo "… not ready (attempt ${attempt}/${max}) — retrying in ${INTERVAL_SECONDS}s"
      sleep "$INTERVAL_SECONDS"
    fi
    attempt=$((attempt + 1))
  done
  echo "::error::Supabase API did not become ready after ${max} attempts (${INTERVAL_SECONDS}s interval, 5s/probe) — failing the job"
  # Container-state snapshot to aid diagnosing a genuine stuck/wedged startup.
  docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -i supabase || true
  return 1
}

disable_kong_upstream_keepalive() {
  local kong
  kong=$(docker ps --format '{{.Names}}' | grep -m1 '^supabase_kong_' || true)
  if [ -z "$kong" ]; then
    echo "::error::no supabase_kong_* container to reload"
    exit 1
  fi
  # The template path must match the --nginx-conf the CLI starts Kong with:
  # docker inspect <kong> --format '{{json .Config.Cmd}}'
  if ! docker exec -e KONG_UPSTREAM_KEEPALIVE_POOL_SIZE=0 "$kong" \
    kong reload --nginx-conf /home/kong/custom_nginx.template; then
    echo "::error::kong reload failed"
    docker logs --tail 50 "$kong" || true
    exit 1
  fi
  if ! docker exec "$kong" grep -q '^upstream_keepalive_pool_size = 0$' /usr/local/kong/.kong_env; then
    echo "::error::Kong upstream keepalive pool is still enabled after reload"
    exit 1
  fi
  if ! docker exec "$kong" grep -q 'listen 0.0.0.0:8088' /usr/local/kong/nginx.conf; then
    echo "::error::Kong reload dropped the CLI's email_templates server (:8088)"
    exit 1
  fi
  echo "✓ Kong upstream keepalive pool disabled"
}

wait_until_ready "$MAX_ATTEMPTS" || exit 1
if [ "${SUPABASE_KONG_RELOAD:-true}" = true ]; then
  disable_kong_upstream_keepalive
  # Confirm the API still answers after the reload.
  wait_until_ready 5 || exit 1
fi
