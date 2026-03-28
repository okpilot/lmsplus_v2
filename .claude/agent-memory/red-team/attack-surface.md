# Red Team — Attack Surface Map

> Last updated: 2026-03-27 (migration 059 review)

## Vector-to-Spec Mapping

| ID | Vector | Priority | Spec File | Status | Notes |
|----|--------|----------|-----------|--------|-------|
| A | submit_quiz_answer accepts foreign questionId | HIGH | rpc-question-membership.spec.ts | FIXED (migration 033) | Added question membership check to RPC |
| B | fetch-stats without auth | MEDIUM | server-action-unauthenticated.spec.ts | PASSING | RPCs require auth.uid() |
| C | Draft with foreign question_ids | MEDIUM | quiz-draft-injection.spec.ts | TBD | RLS may not check question ownership in drafts |
| D | start_quiz_session with cross-org subjectId | MEDIUM | rpc-cross-tenant.spec.ts | PASSING | RLS filters cross-org data |
| E | Topic lookups without auth | MEDIUM | server-action-unauthenticated.spec.ts | PASSING | Covered by unauthenticated spec |
| F | Student INSERT into audit_events | MEDIUM | audit-event-forgery.spec.ts | FIXED (migration 034) | INSERT policy replaced with WITH CHECK (false) |
| G | Concurrent discard + complete | LOW | session-race-condition.spec.ts | PASSING | FOR UPDATE lock prevents race |
| H | PKCE code forwarding | LOW | pkce-state.spec.ts | PASSING | Supabase validates PKCE server-side |
| J | batch_submit on completed session | LOW | session-replay.spec.ts | PASSING | RPC checks session status |
| K | Rapid-fire Server Action calls | MEDIUM | rate-limiting.spec.ts | DOCUMENTED GAP | No rate limiting implemented |
| L | get_report_correct_options called without auth | HIGH | server-action-unauthenticated.spec.ts | GAP — no test case for this RPC | RPC has auth.uid() guard but no spec exercises it |
| M | get_report_correct_options called with foreign session_id (cross-tenant) | HIGH | rpc-cross-tenant.spec.ts | GAP — spec does not test report RPC | RPC has session-ownership check but no spec verifies it holds |
| N | get_report_correct_options called on active (not completed) session | HIGH | (no spec) | GAP — no spec exists | RPC blocks on ended_at IS NOT NULL but no test exercises the bypass |
| O | quiz-report questions SELECT leaks raw correct boolean server-side | CRITICAL | (no spec) | GAP — latent exposure in quiz-report.ts line 88 | .select('options') pulls raw JSONB; correct field filtered only in buildReportQuestions — no spec verifies options are stripped before reaching client |
| P | deleteComment called by non-owner student (IDOR via RLS) | HIGH | (no spec) | GAP — migration 049 adds DELETE RLS but no spec exercises cross-user delete attempt | RLS policy question_comments_delete_own uses USING(user_id = auth.uid()); needs a spec that signs in as student-B and attempts to delete student-A's comment |
| Q | question_comments table read/write without auth (unauthenticated) | HIGH | server-action-unauthenticated.spec.ts | GAP — spec does not cover question_comments table or comments Server Actions | SELECT policy requires EXISTS(SELECT 1 FROM users WHERE id = auth.uid()); INSERT WITH CHECK enforces user_id = auth.uid(); unauthenticated access should return 0 rows / error — no spec verifies this |
| R | createComment/getComments called without auth via Server Action layer | HIGH | server-action-unauthenticated.spec.ts | GAP — getComments silently returns success:true+[] when unauthed (line 20 comments.ts); createComment returns error — inconsistency not tested | getComments does NOT return an error for unauthenticated callers; it silently succeeds with empty array — a spec should confirm no data leaks and that the silent-success behaviour is intentional |
| S | toggleFlag called with a foreign student's questionId (IDOR) | MEDIUM | (no spec) | GAP — no spec exists | toggleFlag hard-codes user.id from auth token for student_id filter; RLS WITH CHECK also binds student_id = auth.uid(); low risk but no spec verifies attacker cannot read or corrupt another student's flag state |
| T | getFlaggedIds called without auth | MEDIUM | server-action-unauthenticated.spec.ts | GAP — spec does not cover flagged_questions table | getFlaggedIds returns success:true+[] when unauthed (line 87 flag.ts); silent success not tested |
| U | deleteComment hard-delete bypasses soft-delete policy for deleted_at column | MEDIUM | (no spec) | GAP — table has deleted_at column but DELETE policy does not require deleted_at IS NULL; admin could hard-delete a comment that was already soft-deleted, which is consistent, but no spec checks the interplay | Low risk; document gap for completeness |
| V | Consent gate bypass via forged/missing __consent cookie | HIGH | (no spec) | GAP — proxy.ts consent gate reads cookie value only; no spec verifies that a user with no DB consent record cannot bypass gate by manually crafting a valid-looking cookie value | New vector from migration 057 + proxy.ts change |
| W | Unauthenticated access to check_consent_status and record_consent RPCs | HIGH | server-action-unauthenticated.spec.ts | GAP — spec does not cover the two new RPCs; both have auth.uid() guards but no spec exercises them without auth | New RPCs from migration 057 |
| X | Cross-tenant consent record read (user_consents SELECT cross-uid) | HIGH | rpc-cross-tenant.spec.ts | GAP — RLS policy user_consents_select_own uses user_id = auth.uid(); no spec verifies attacker cannot read another user's consent records by probing known UUIDs | New table from migration 057 |
| Y | Student direct INSERT into user_consents bypassing record_consent RPC | HIGH | audit-event-forgery.spec.ts | GAP — RLS WITH CHECK (false) blocks direct inserts, mirroring audit_events pattern; no spec exercises this — analogous to Vector F which is now passing | New table from migration 057 |
| Z | Consent cookie injected without completing actual consent flow (login-complete bypass) | HIGH | pkce-state.spec.ts | GAP — an authenticated user who navigates directly to /auth/login-complete (e.g., by replaying the URL) can trigger consent-cookie issuance without going through /consent page if they already have DB consent records; the inverse gap is also untested: a user with a crafted cookie but no DB record who reaches /app/* after the proxy allows them through because cookie matches expected format | New auth flow from login-complete/route.ts change |
| AA | Student reads another student's audit events via audit_read_own policy (cross-user SELECT) | HIGH | audit-event-forgery.spec.ts | GAP — the new policy USING (actor_id = auth.uid()) is correctly scoped and does NOT enable cross-user reads; however no spec verifies a student cannot SELECT audit events belonging to a different student_id. Existing spec only tests INSERT/UPDATE/DELETE forgery, not cross-user SELECT. | New SELECT surface from migration 059 |
| AB | Student probes audit_events for events where actor_id = their uid but metadata contains sensitive data about other users | MEDIUM | audit-event-forgery.spec.ts | ASSESSED LOW RISK — all event types written with student actor_id (quiz_session.started, quiz_session.completed, quiz_session.batch_submitted, student.login) contain only the student's own session/score data in metadata. No cross-user data in student-authored events confirmed by grep of all RPC inserts. No spec change required; document here for completeness. | Migration 059 impact analysis |

## Consent Gate — Seeding Note (added 2026-03-27)

All specs that use `seedRedTeamUsers()` and then exercise RPC calls or browser navigation to `/app/*` routes will now be blocked by the consent gate in proxy.ts. The gate checks the `__consent` cookie against `CURRENT_TOS_VERSION:CURRENT_PRIVACY_VERSION` (currently `v1.0:v1.0`).

**Specs that call RPCs directly via `createAuthenticatedClient` are NOT affected** — they bypass the Next.js proxy entirely and call Supabase directly. These specs (rpc-cross-tenant, rpc-question-membership, session-replay, session-race-condition, audit-event-forgery, server-action-unauthenticated) do not go through the proxy and therefore are unaffected by the cookie gate.

**Specs that use a real browser page (Playwright `page`) ARE affected** — pkce-state.spec.ts navigates to `/app/dashboard` in one test case. If the PKCE-failed user somehow obtains a valid session (which should not happen, but the spec verifies), the consent gate would redirect them to `/consent` rather than staying on `/app/dashboard`. The existing assertion `expect(page).not.toHaveURL(/\/app\/dashboard/)` still passes because `/consent` is also not `/app/dashboard`, so the spec remains valid without modification.

**Seeding consent records for future browser-based specs:** any new spec that logs a user in via the browser (not via `createAuthenticatedClient`) and then navigates to `/app/*` must either (a) seed consent records via admin client and set the cookie, or (b) complete the consent flow as part of test setup. The `seed.ts` helper does not currently seed consent records.

## Files to Watch

These files contain the attack surface. Changes here should trigger a red-team review:

- `supabase/migrations/*.sql` — RLS policies, RPCs, table definitions
- `packages/db/src/schema.ts` — Zod schemas for input validation
- `apps/web/app/app/quiz/actions/*.ts` — Server Actions (auth checks, input validation)
- `apps/web/proxy.ts` — session middleware
- `apps/web/app/auth/callback/route.ts` — PKCE callback
- `apps/web/app/auth/login-complete/route.ts` — consent check + cookie issuance
- `apps/web/lib/consent/versions.ts` — consent version constants (bump triggers re-consent)
- `apps/web/lib/consent/check-consent.ts` — checkConsentStatus + buildConsentCookieValue
- `apps/web/lib/queries/quiz-report.ts` — post-session report query (answer key access path)

## Lessons Learned

2026-03-16 — review of branch fix/45-remove-answer-keys-from-test:
- The migration sequence (032→033→034) shows iterative hardening: the final RPC correctly derives question IDs from quiz_session_answers rather than accepting them as a parameter, eliminating arbitrary question-ID probing. This is the right pattern.
- quiz-report.ts performs a direct .select('options') on the questions table (line 88). The `correct` boolean is filtered in TypeScript inside buildReportQuestions, not at the DB layer. A future refactor that changes the mapping logic could silently re-expose answer keys. A red-team spec should assert the report payload never contains `correct` fields.
- New RPCs require matching unauthenticated and cross-tenant test cases on every addition — these are not covered by default by the existing generic specs.

2026-03-27 — review of migration 059 (audit_read_own policy — GDPR Article 15 student self-read):
- The new SELECT policy `audit_read_own` uses `USING (actor_id = auth.uid())`. This is correctly scoped — a student can only see rows where they are the actor. They cannot enumerate other students' events by probing UUIDs.
- No event type in the system writes to audit_events with a student's actor_id AND contains data about a different user in metadata. All student-authored events (quiz_session.started, quiz_session.completed, quiz_session.batch_submitted, student.login) contain only session/score data for the student themselves. Admin-authored events (question.created, question.edited, question.deleted) use the admin's actor_id and are not reachable by the new policy.
- The policy does NOT conflict with audit_read_instructors. Postgres evaluates permissive policies with OR — instructors now match BOTH policies (their own events via audit_read_own PLUS all org events via audit_read_instructors). This is correct and additive; instructors do not lose access.
- The immutability policies (audit_no_update, audit_no_delete, audit_no_direct_insert) are unchanged and unaffected. Adding a SELECT policy cannot widen INSERT/UPDATE/DELETE surface.
- GAP IDENTIFIED: audit-event-forgery.spec.ts tests INSERT/UPDATE/DELETE forgery (Vector F) but has no test case for cross-user SELECT after the new policy is added. A student should attempt to SELECT with a filter against a known other user's actor_id and get 0 rows. This is now Vector AA.
- The server-action-unauthenticated.spec.ts test at line 136 ("unauthenticated client sees 0 rows from audit_events") remains valid and still passes — the new policy requires auth.uid() IS NOT NULL implicitly (auth.uid() returns null for unauthed clients, and null = null is false in SQL USING clauses).
- collect-user-data.ts audit_events query at line 63-67 now correctly returns data when called via the RLS-scoped client (exportMyData path), resolving the GDPR Article 15 compliance gap flagged as Issue 1 in the semantic-reviewer session log from 2026-03-27.

2026-03-27 — review of GDPR consent gate (migration 057 + proxy.ts + login-complete/route.ts):
- The consent gate in proxy.ts is cookie-only — it does not re-check the DB on every request. This is intentional (performance) but means a forged cookie with the correct format (`v1.0:v1.0`) bypasses the gate entirely. The DB is only consulted at login-complete time. A spec should confirm that an attacker who knows the cookie format and value cannot gain access to /app/* routes without a valid auth session — the auth session check in proxy.ts (lines 39-43 in the diff) still runs before the consent check, so unauthenticated requests remain blocked. The consent gate only applies to authenticated users.
- Two new RPCs (record_consent, check_consent_status) follow the correct SECURITY DEFINER + auth.uid() + SET search_path = public pattern. Neither accepts user_id as a parameter — both derive identity from auth.uid(). This is the correct IDOR-prevention pattern, matching the flag.ts precedent.
- user_consents table correctly mirrors the audit_events append-only pattern: INSERT only via RPC (WITH CHECK false on direct INSERT), no UPDATE policy, no DELETE policy. This is consistent with the immutable table rules.
- The cookie value is `${TOS_VERSION}:${PRIVACY_VERSION}` — currently `v1.0:v1.0`. This is a predictable format. If an attacker knows the current version strings (which are in client-side JS as they're imported into proxy.ts which runs as middleware), they can forge the cookie. The only protection against this is that the auth session check runs first. A spec should pin this dependency explicitly.
- pkce-state.spec.ts test "does not leak session after failed PKCE exchange" navigates to /app/dashboard after a failed exchange. With the consent gate active, even a user who somehow obtained a session but has no consent record would be redirected to /consent, not /app/dashboard. The existing assertion `not.toHaveURL(/\/app\/dashboard/)` remains correct either way.

2026-03-20 — review of branch adding migration 049 (question_comments) + comments.ts + flag.ts:
- Hard-delete on question_comments is an intentional, documented exception to the soft-delete rule. The migration comment names the rationale. The RLS DELETE policy is correctly scoped to user_id = auth.uid(). However, the absence of a spec means the IDOR protection has never been exercised end-to-end.
- getComments and getFlaggedIds both return success:true with empty data rather than an error when the caller is unauthenticated. This is a deliberate defensive pattern (no information leakage) but it creates an inconsistency with createComment/deleteComment which return error:Not authenticated. The inconsistency itself is not a vulnerability, but a spec should pin this behaviour so a future refactor does not accidentally start returning real data to unauthed callers.
- flag.ts correctly hard-codes user.id from the auth token in all DB filters — the student_id parameter is never accepted from client input. This is the correct IDOR-prevention pattern. Still needs a spec.
- New Server Action files (comments.ts, flag.ts) must be added to the server-action-unauthenticated spec's coverage list, same rule as every previous action file.
