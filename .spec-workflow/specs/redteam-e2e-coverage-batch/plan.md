# Spec: Red-Team E2E Coverage Batch (#784, #786, #788, #781)

> Status: DRAFT (pre plan-critic) · Owner: orchestrator · Created 2026-06-07
> Scope: test-only (Playwright red-team specs) + `attack-surface.md` doc sync + one test-infra seam for #781.
> NO migration / production-code changes. No `docs/database.md` / `docs/security.md` schema edits.

## Requirements (from issues)

- **#788 (Vectors CN–CT)** — `record_auth_event` E2E coverage. New dedicated spec + Hub A anon case + audit-completeness positive emission.
- **#784 (Vectors CL1–CL3)** — `get_session_reports` auth + cross-user IDOR.
- **#786 (Vector CM)** — `void_internal_exam_code` must NOT stamp student `last_active_at` (addendum to existing spec). *(Issue body says "Vector CK" — stale; renumbered to CM on the #532 merge. Fix the issue body + use CM.)*
- **#781 (Vector CK2)** — anti-cache headers present on a **real token-refresh** response (user chose the full version → build a refresh seam).

## Verified facts (from exploration, traced to latest defs)

- `get_session_reports` (mig 091/20260606000007): SECURITY DEFINER; `v_uid := auth.uid(); IF NULL RAISE 'Not authenticated'`; `WHERE qs.student_id = v_uid AND qs.ended_at IS NOT NULL AND qs.deleted_at IS NULL AND qs.mode <> 'internal_exam'`. Takes NO student_id param — ownership is intrinsic. → anon = **error**, not empty set.
- `record_auth_event` (mig 093/20260606000009): SECURITY DEFINER; **three gates in order** — (1) auth.uid() null-check → `'not authenticated'` (lowercase); (2) actor lookup `SELECT ... FROM users WHERE id=auth.uid() AND deleted_at IS NULL` → if NULL `RAISE 'user not found or inactive'` (a soft-deleted/missing actor hits THIS before the event-type gate); (3) whitelist: `user.password_changed` (self: resource MUST equal actor else `'self event resource must be the actor'`); `user.password_reset|deactivated|created` (admin: `v_role<>'admin'` → `'not authorized'`); ELSE `'unsupported event_type: %'`. Cross-org resource_id ACCEPTED but row org = actor's org. INSERTs into `audit_events` (actor_id = auth.uid(), resource_id = p_resource_id).
- **RAISE-string capitalization differs across RPCs** — `record_auth_event` = `'not authenticated'` (lowercase), `get_session_reports` = `'Not authenticated'` (capital N), `void_internal_exam_code` = `'not_authenticated'` (snake_case). **All anon assertions MUST use the case-insensitive `/not[ _]authenticated/i` flag** — never a case-sensitive `.toMatch('not authenticated')`.
- `void_internal_exam_code` (mig 084/20260601000003): SECURITY DEFINER admin RPC; sets `quiz_sessions.ended_at=now()` with auth.uid()=admin → trigger guard `auth.uid()=NEW.student_id` is FALSE → no stamp.
- `stamp_last_active_on_session_complete` trigger (mig 092): `AFTER UPDATE OF ended_at ... WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)`, guard `IF auth.uid() = NEW.student_id`.
- `audit_events` is IMMUTABLE/append-only — do NOT clean; scope by `gte('created_at', testStart)`. Sessions/codes get soft-delete cleanup (deleted_at in mutable whitelist).
- Helpers: `getAdminClient()` (service-role, `e2e/helpers/supabase.ts`); `createAuthenticatedClient(email,pw)` (`redteam/helpers/redteam-client.ts`); `seedRedTeamUsers()`/`seedRedTeamAdmin()`/`createCrossOrgUser()`/marker constants (`redteam/helpers/seed.ts`). Anon client = inline `createClient(URL, ANON_KEY, {auth:{autoRefreshToken:false,persistSession:false}})`.
- Hub A = `server-action-unauthenticated.spec.ts` (serial anon probes). Hub B = `rpc-cross-tenant.spec.ts` (cross-user IDOR, non-vacuous). Hermeticity per code-style.md §7; non-vacuous negatives per §7.

## Files to change

### A. #788 — record_auth_event (CN–CT)
1. **NEW** `apps/web/e2e/redteam/rpc-record-auth-event.spec.ts`:
   - **CN** (A1): student calls each admin-only event_type (`user.created`/`password_reset`/`deactivated`) → `/not authorized/i`, data null.
   - **CO** (A2): student calls `user.password_changed` with another user's id → `/self event resource must be the actor/i`.
   - **CP** (A3): authed caller passes unlisted event_type → `/unsupported event_type/i`.
   - **CR** (A5): cross-org admin records admin event for a user in another org → ACCEPTED (error null), and the audit row's `organization_id` = the **admin's own org** (assert via service-role read), proving no cross-org write. Non-vacuous.
   - **CS** (actor_id invariant): admin records `user.created` with `p_resource_id=studentId` → audit row `actor_id=adminUserId`, `resource_id=studentId` (not swapped).
   - **Actor-liveness pre-check (plan-critic ISSUE 2):** in beforeAll, assert via service-role that BOTH the student and admin caller rows have `deleted_at IS NULL` before any test runs — otherwise the RPC's gate-2 (`'user not found or inactive'`) fires first and CN/CO assertions (`/not authorized/i`, `/self event resource must be the actor/i`) fail spuriously. `upsertUser`/`seedRedTeam*` do NOT restore `deleted_at`, so a failed prior afterEach elsewhere could leave a caller soft-deleted (cross-spec risk). Guard explicitly.
   - Cleanup: do NOT touch audit_events (append-only); scope reads by testStart. No seeded sessions/codes here.
2. **EDIT** `apps/web/e2e/redteam/server-action-unauthenticated.spec.ts`: **CQ** (A4) — anon calls `record_auth_event` → `/not authenticated/i`, data null. Append to the serial chain.
3. **EDIT** `apps/web/e2e/redteam/audit-completeness.spec.ts`: **CT** — 4 positive-emission cases calling `record_auth_event` directly (not via Server Action — best-effort timing). Each captures testStart, calls RPC, asserts `audit_events` row via `expectAuditRow(eventType, actorId, testStart, resourceId)`. Per-event `p_resource_id` (plan-critic S3):
     - `user.password_changed` — student client; `p_resource_id = studentId` (self); expect actor=student, resource=student.
     - `user.password_reset` — admin client; `p_resource_id = studentId` (seeded active student); expect actor=admin, resource=student.
     - `user.created` — admin client; `p_resource_id =` a freshly-seeded student UUID; expect actor=admin, resource=newUser.
     - `user.deactivated` — admin client; to mirror the real Server-Action flow (resource already soft-deleted by audit time), **soft-delete the target student first**, then call; `p_resource_id = deactivatedStudentId`; expect actor=admin, resource=deactivatedStudent. (RPC does NOT re-SELECT the resource, so a soft-deleted resource_id is accepted — the test stays representative.) Restore the soft-delete in afterEach.
   No audit cleanup (append-only); testStart scoping.

### B. #784 — get_session_reports (CL1–CL3)
4. **EDIT** `apps/web/e2e/redteam/server-action-unauthenticated.spec.ts`: **CL1** — anon calls `get_session_reports()` → error `/not authenticated/i`, data null. (SECURITY DEFINER RAISE — NOT empty-set.)
5. **EDIT** `apps/web/e2e/redteam/rpc-cross-tenant.spec.ts`: 
   - **CL2** — authenticated student (cross-org user with no completed sessions) calls `get_session_reports()` → error null, empty array. (This is the "auth-passed, no-rows" control; CL3 is the true non-vacuous ownership proof — plan-critic S2.)
   - **CL3** — non-vacuous IDOR: seed a completed quiz_session for the egmont victim (service-role, ended_at set); victim's own client sees ≥1 row whose id == seeded id; the cross-org attacker's `get_session_reports()` result contains 0 rows with the victim's session id (it only ever returns the caller's own). Seed cleanup: soft-delete the seeded session in afterAll.

### C. #786 — void no-stamp (CM)
6. **EDIT** `apps/web/e2e/redteam/rpc-void-internal-exam-code.spec.ts`: addendum test — seed active consumed internal-exam session for victim student (existing `seedSession`/`seedCode` helpers, ended:false + consumed_session_id); read `users.last_active_at` via service-role BEFORE; admin calls `void_internal_exam_code`; assert RPC `session_ended=true` (proves the void fired — non-vacuous); re-read `last_active_at` → **unchanged** (===, parse timestamps). Reuse the spec's existing afterEach cleanup.

### D. #781 — anti-cache headers on real refresh (CK2)
7. **NEW** seam helper `apps/web/e2e/redteam/helpers/force-token-refresh.ts` (or inline): `forceTokenRefresh(context)` — read the `sb-*-auth-token` cookie(s) from the Playwright context, decode the session JSON (handle the `base64-` prefix + chunked-cookie format), rewrite `expires_at` to a past unix ts and `expires_in` to 0, write the cookie(s) back. This makes @supabase/ssr treat the access token as stale → the next request through `proxy.ts` calls `getUser()` → refresh → `setAll(cookies, headers)` writes anti-cache headers.
   - **SPIKE (first step):** confirm the rewrite actually triggers a refresh — assert the response carries a fresh `Set-Cookie` (new access token) AND the 3 anti-cache headers. **Mechanism confirmed by plan-critic:** `@supabase/auth-js` `EXPIRY_MARGIN_MS = 90_000ms`; setting `expires_at` to `now-200s` makes `hasExpired=true` in `__loadSession`, firing `_callRefreshToken` on the next `getUser()` in proxy.ts → `setAll(cookies, headers)`. So the cookie-rewrite is the real path, not a long shot.
   - **Fallback (only if spike fails):** do NOT lower `supabase/config.toml jwt_expiry` — it is GLOBAL to the docker stack and would intermittently break the other 36 redteam specs (no per-project gate). If the cookie-rewrite genuinely fails, STOP and re-evaluate the CK2 test approach with the user rather than shipping a global config hack or a vacuous header-only assertion.
8. **NEW** `apps/web/e2e/redteam/token-refresh-anti-cache.spec.ts`:
   - Sign in via UI (real session cookie), `forceTokenRefresh(context)`, then:
     - **redirect exit:** request `/` (authenticated → 302 to `/app/dashboard`) → assert 3 anti-cache headers + a refreshed Set-Cookie.
     - **pass-through exit:** request an authenticated `/app/*` page → assert the 3 anti-cache headers on the 200 response.
   - Covers acceptance: "at least one redirect exit and the pass-through exit."

### E. Doc sync
9. **EDIT** `.claude/agent-memory/red-team/topics/attack-surface.md`: mark CN–CT COVERED (rpc-record-auth-event.spec.ts / Hub A / audit-completeness.spec.ts), CL COVERED (Hub A + Hub B), CM COVERED (rpc-void-internal-exam-code.spec.ts addendum), CK2 COVERED (token-refresh-anti-cache.spec.ts). Update the header line.
10. **GH issue #786**: fix the stale "Vector CK" → CM in the body.

## Validation

- **Impact:** test-only; no importers of production code change. The new specs join the `redteam` Playwright project (auto-discovered by `testMatch '**/*.spec.ts'`). No CI workflow file change needed.
- **Contracts:** assertions match the RPC's real RAISE strings (quoted above). `get_session_reports` anon = RAISE (corrected). `audit_events` reads scoped by testStart (immutable). `void` non-stamp asserts unchanged timestamp.
- **Patterns:** every new/edited spec follows the existing helper + hermeticity + non-vacuous conventions; new dedicated spec mirrors `rpc-comment-idor.spec.ts`/`rpc-report.spec.ts` skeleton.
- **Security surface:** specs live under `apps/web/e2e/redteam/**` → red-team agent trigger path; run red-team agent post-commit + `pnpm --filter @repo/web e2e:redteam` before push.
- **Hermeticity:** sessions/codes soft-deleted in afterEach/afterAll with `.select('id')` + log-on-nonzero; audit_events NOT cleaned (append-only) — testStart scoping; #781 restores any cookie/context state by closing the context.

## Risks

- **#781 refresh seam (HIGH):** cookie-rewrite may not trigger a refresh depending on @supabase/ssr internals → spike first; fallback = jwt_expiry lower (config, env-gated). If neither is reliable in CI, escalate (do not silently ship a vacuous header-only assertion).
- **CL3 non-vacuity:** must assert victim-owner sees the seeded session (≥1) before asserting attacker sees 0 — else vacuous.
- **CR semantics:** cross-org admin event is ACCEPTED (not rejected) by design — the assertion is "logged under actor's org," not an error. Easy to mis-assert as a rejection.
- **CT immutability:** must NOT attempt to soft-delete audit_events (would throw / violate append-only) — scope by testStart only.

## Test / verification

- `pnpm --filter @repo/web e2e:redteam` green locally before push.
- Post-commit: code-reviewer, semantic-reviewer, doc-updater, test-writer, red-team. fullpush gate + `/crlocal`. Merge only when CI fully green + CR no-change-requested.

## Out of scope

- No production code, migrations, or `docs/*.md` schema edits.
- The 2 local `chore(memory)` /insights commits on master ride this PR branch (per workflow: never push to master).
