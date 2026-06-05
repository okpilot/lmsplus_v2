---
name: postgres-security-invoker-rls-pattern
description: Postgres SECURITY INVOKER execution context + RLS filtering behavior for unauthenticated function calls
metadata:
  type: reference
---

## Postgres SECURITY INVOKER + RLS Unauthenticated Behavior

**First seen:** 2026-06-04 (Hub A unauth-path red-team specs, commit f02031fa)

### The Pattern

When a Postgres function is:
1. Declared `SECURITY INVOKER` (executes as the calling user)
2. Performs SELECTs on RLS-protected tables
3. Called by an unauthenticated/public client (`anon` role)

The execution flow:
- Function grants EXECUTE to PUBLIC by default — `anon` **can** call the function (no GRANT rejection, error code 42501)
- Function runs with `auth.uid() = null` (the unauthenticated context)
- RLS filters on `auth.uid()` evaluate to false for all rows
- Query returns `error: null` with `data: []` (empty result set, not a rejection)

### Why This Is NOT a GRANT Rejection

```sql
CREATE FUNCTION get_user_data() SECURITY INVOKER
RETURNS TABLE(id uuid, name text)
AS $$
  SELECT id, name FROM users;
$$ LANGUAGE SQL;

-- No explicit GRANT — defaults to PUBLIC
-- anon client CAN call this (no 42501 error)
-- But RLS filters the result to empty set
```

When tested from an unauthenticated context:
- Expected: `{ error: null, data: [] }` — RLS filtered the result
- NOT expected: `{ error: { code: 42501, message: "permission denied" } }` — that would be a WITH CHECK rejection on INSERT/UPDATE, not a SELECT rejection

### False Positive Signature

Impl-critic / semantic-reviewer may flag:
> "These functions are GRANT TO authenticated; anon shouldn't execute."

**This is incorrect.** Postgres defaults to `GRANT EXECUTE ... TO PUBLIC` for newly created functions. No migration revokes this, so the default stands. The RLS policy is the gatekeeper, not the function grant.

### Evidence & Precedent

- **Master specs BW, BX:** both use `SECURITY INVOKER` functions on RLS-protected tables, called from anon, expect `error: null + data: []`
- **Hub A specs AG/AN/CA/W:** mirror BW/BX pattern, all pass with empty results from anon calls
- **Rule location:** `docs/security.md` rule 7 (auth check in RPCs) applies to SECURITY DEFINER functions only; SECURITY INVOKER functions rely on RLS

### When To Apply This Knowledge

- **Red-team spec review:** If an unauth-path spec asserts `error: null` on a SECURITY INVOKER function call to RLS-protected data, this is correct — do not flag as a gap
- **Impl-critic / semantic-reviewer:** When a red-team spec tests unauth access via SECURITY INVOKER, expect the `error: null + data: []` pattern; do not assume it requires a GRANT rejection
- **New unauth-path spec authoring:** Use this pattern for RLS-protected queries; no explicit GRANT needed, RLS handles the gating

### Distinction: SECURITY DEFINER

Security-definer functions are different:
- Execute as the function owner (typically postgres role with higher privileges)
- MUST include explicit `auth.uid()` checks and `SET search_path = public`
- RLS does NOT apply inside them (they run with elevated privileges)
- Unauth calls that reach unguarded code can expose data

This pattern applies to SECURITY INVOKER only.
