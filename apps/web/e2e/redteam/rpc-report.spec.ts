/**
 * Red Team Spec: get_report_correct_options RPC (#253)
 *
 * SECURITY DEFINER RPC returning the correct-option ids for a COMPLETED session
 * the caller owns (the report answer key). Vectors (attack-surface.md):
 *  - L  unauthenticated → 'Not authenticated'.
 *  - M  cross-tenant / foreign session_id (not owned) →
 *       'Session not found, not owned, or not completed'.
 *  - N  the owner's own session that is still active (ended_at IS NULL) →
 *       same message (the EXISTS guard requires ended_at IS NOT NULL).
 *  - positive: the owner reads their own completed session (guard passes).
 *
 * Vector O (the raw `correct` boolean must never reach the client in the report
 * QUESTIONS payload) is an application-layer concern in buildReportQuestions and
 * is covered by a co-located unit test, not this PostgREST-level spec.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const RPC = 'get_report_correct_options'

test.describe('Red Team: get_report_correct_options RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let orgId: string
  let subjectId: string

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    orgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
  })

  const seedSession = async (opts: { completed: boolean }): Promise<string> => {
    const row: Record<string, unknown> = {
      organization_id: orgId,
      student_id: victimUserId,
      mode: 'quick_quiz',
      subject_id: subjectId,
      config: { question_ids: [] },
      total_questions: 1,
      started_at: new Date(Date.now() - 60_000).toISOString(),
    }
    if (opts.completed) {
      row.ended_at = new Date().toISOString()
      row.score_percentage = 0
      row.passed = false
      row.correct_count = 0
    }
    const { data, error } = await admin.from('quiz_sessions').insert(row).select('id').single()
    if (error || !data) throw new Error(`seed session: ${error?.message}`)
    createdSessionIds.add(data.id)
    return data.id
  }

  test.afterEach(async () => {
    if (createdSessionIds.size === 0) return
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(createdSessionIds))
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[report-rpc] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  test('L: an unauthenticated caller is rejected', async () => {
    const sessionId = await seedSession({ completed: true })
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data).toBeNull()
  })

  test('M: a different student cannot read a foreign session report (IDOR)', async () => {
    const sessionId = await seedSession({ completed: true })
    const { data, error } = await attackerClient.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found, not owned, or not completed/i)
    expect(data).toBeNull()
  })

  test('N: the owner cannot read a report for a still-active session', async () => {
    // Same combined-guard message as M; the distinguishing factor is the setup
    // (own-but-active session vs. foreign-completed session).
    const sessionId = await seedSession({ completed: false })
    const { data, error } = await victimClient.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found, not owned, or not completed/i)
    expect(data).toBeNull()
  })

  test('positive: the owner can read the report for their own completed session', async () => {
    const sessionId = await seedSession({ completed: true })
    const { data, error } = await victimClient.rpc(RPC, { p_session_id: sessionId })
    // The ownership + completion guard passes; the result is an array (empty is
    // fine — this session has no answered questions).
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})
