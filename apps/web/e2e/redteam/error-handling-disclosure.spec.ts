/**
 * Red Team Spec: OWASP A10:2025 — Mishandling of Exceptional Conditions
 *
 * Issue #634. Proves that our SECURITY DEFINER RPCs do NOT leak DB-internal
 * details on their error paths. The contract: when an authenticated attacker
 * calls an RPC with a well-formed-but-non-existent identifier, the RPC's own
 * `RAISE EXCEPTION` fires with a CLEAN named domain token — and the surfaced
 * message must NOT disclose schema/relation/column names, function source,
 * SQLSTATE, connection params, or any other Postgres internal.
 *
 * Hermeticity: every probe targets a freshly generated `crypto.randomUUID()`
 * (or a randomised non-existent code string) so the RAISE fires BEFORE any DML.
 * No rows are created or mutated, therefore NO afterEach/afterAll cleanup is
 * needed. Users are seeded once in beforeAll (idempotent).
 *
 * `permission denied` (SQLSTATE 42501) is deliberately EXCLUDED from the
 * disclosure regex — it is the expected clean authorization verdict from the
 * GRANT-revoke batch and other specs rely on it.
 *
 * RPC tokens re-confirmed against the latest CREATE OR REPLACE in each chain:
 *  - start_internal_exam_session  → code_not_found
 *      (20260606000003_cache_actor_role_internal_exam.sql:71)
 *  - complete_overdue_exam_session → session not found or not accessible
 *      (20260429000008_extend_overdue_for_internal_exam.sql:52)
 *  - complete_empty_exam_session   → session not found or not accessible
 *      (20260429000008_extend_overdue_for_internal_exam.sql:189)
 *  - void_internal_exam_code       → code_not_found (admin client; p_code_id uuid)
 *      (20260601000003_void_internal_exam_code_failfast_session.sql:84)
 *  - get_report_correct_options    → Session not found, not owned, or not completed
 *      (20260316231503_report_correct_options_orderby_and_history.sql:25)
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

// Patterns that would indicate a DB-internal leak. `permission denied` (42501)
// is intentionally absent — it is an expected clean authorization verdict.
const DISCLOSURE_PATTERNS: RegExp[] = [
  /relation "?.*"? does not exist/i,
  /column "?.*"? does not exist/i,
  /function .* does not exist/i,
  /search_path/i,
  /\bpg_[a-z]/i,
  /SQLSTATE/i,
  /\bCONTEXT:/i,
  /at character \d+/i,
  /(host|port|dbname|password)=/i,
  /\bpostgres(ql)?:\/\//i,
]

type Actor = 'student' | 'admin'

type Probe = {
  title: string
  actor: Actor
  expected: RegExp
  // Generated at call time so the RAISE fires before any DML (read-only probe).
  call: (client: SupabaseClient) => Promise<{ data: unknown; error: { message: string } | null }>
}

const PROBES: Probe[] = [
  {
    title: 'start_internal_exam_session is called with a non-existent redeem code',
    actor: 'student',
    expected: /code_not_found/i,
    call: (client) =>
      client.rpc('start_internal_exam_session', { p_code: `NX-${crypto.randomUUID()}` }),
  },
  {
    title: 'complete_overdue_exam_session is called with a non-existent session id',
    actor: 'student',
    expected: /session not found or not accessible/i,
    call: (client) =>
      client.rpc('complete_overdue_exam_session', { p_session_id: crypto.randomUUID() }),
  },
  {
    title: 'complete_empty_exam_session is called with a non-existent session id',
    actor: 'student',
    expected: /session not found or not accessible/i,
    call: (client) =>
      client.rpc('complete_empty_exam_session', { p_session_id: crypto.randomUUID() }),
  },
  {
    title: 'void_internal_exam_code is called by an admin with a non-existent code id',
    actor: 'admin',
    expected: /code_not_found/i,
    call: (client) =>
      client.rpc('void_internal_exam_code', {
        p_code_id: crypto.randomUUID(),
        p_reason: 'redteam a10 probe',
      }),
  },
  {
    title: 'get_report_correct_options is called with a non-existent session id',
    actor: 'student',
    expected: /session not found, not owned, or not completed/i,
    call: (client) =>
      client.rpc('get_report_correct_options', { p_session_id: crypto.randomUUID() }),
  },
]

test.describe('Red Team: OWASP A10 — error-path information disclosure', () => {
  let studentClient: SupabaseClient
  let adminClient: SupabaseClient

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    const seedAdmin = await seedRedTeamAdmin()
    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminClient = await createAuthenticatedClient(seedAdmin.email, seedAdmin.password)
  })

  for (const probe of PROBES) {
    test(`does not disclose DB internals when ${probe.title}`, async () => {
      const client = probe.actor === 'admin' ? adminClient : studentClient
      const { data, error } = await probe.call(client)

      // Non-vacuous: the RAISE must genuinely fire (error present, no data)
      // before we inspect the message shape.
      expect(error).not.toBeNull()
      expect(data).toBeNull()

      const message = error?.message ?? ''
      // The clean named domain token is surfaced...
      expect(message).toMatch(probe.expected)
      // ...and the message leaks none of the DB-internal patterns.
      for (const pattern of DISCLOSURE_PATTERNS) {
        expect(message).not.toMatch(pattern)
      }
    })
  }
})
