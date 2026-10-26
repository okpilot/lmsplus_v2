#!/usr/bin/env bash
# Fails when a public SECURITY DEFINER function's search_path is not exactly `public, pg_temp`
# (extension members excluded). Reads pg_proc after the migrations applied, so ALTER FUNCTION and
# CREATE OR REPLACE supersession are both seen (#1611).
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h localhost -p 54322 -U postgres -d postgres -tA -v ON_ERROR_STOP=1)

DEFINER_FILTER="FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind IN ('f','p')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
    )"

DEFINER_COUNT=$("${PSQL[@]}" -c "SELECT count(*) $DEFINER_FILTER;")
if [ "$DEFINER_COUNT" -le 0 ]; then
  echo "ERROR: no public SECURITY DEFINER functions found — the check would pass vacuously"
  exit 1
fi

ROWS=$("${PSQL[@]}" -c "
  SELECT p.oid::regprocedure::text || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<no proconfig>')
  $DEFINER_FILTER
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS c
      WHERE c = 'search_path=public, pg_temp'
    )
  ORDER BY 1;")

echo "Public SECURITY DEFINER functions: $DEFINER_COUNT"
if [ -n "$ROWS" ]; then
  echo "ERROR: SECURITY DEFINER functions must SET search_path = public, pg_temp:"
  echo "$ROWS"
  exit 1
fi
