/**
 * Red Team Spec: VFR RT audit-event completeness (Vector DP, #873).
 *
 * Pins the VFR-RT audit_events.event_type literals to the flows that emit them,
 * so a future CREATE OR REPLACE can't silently rename or drop them:
 *   - vfr_rt_exam.started   ← start_vfr_rt_exam_session (mig 140)
 *   - vfr_rt_exam.completed ← submit_vfr_rt_exam_answers, fresh completion (mig 129)
 *   - vfr_rt_exam.completed ← complete_empty_exam_session, non-overdue empty session (mig 102 L264)
 *   - vfr_rt_exam.expired   ← complete_overdue_exam_session on a vfr_rt session (mig 102 L140)
 *
 * A dedicated file (extracted from audit-completeness.spec.ts to keep both under
 * the 500-line test ceiling) that owns the VFR-RT pool lifecycle: seed once in
 * beforeAll, soft-delete in afterAll. Each test captures testStart before its
 * trigger and clears any leftover active session first (single-active-session
 * invariant, #1011). Every created/started session id is registered in the
 * tracker so afterEach soft-deletes it.
 */

import { expect, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { expectAuditRow } from './helpers/audit-helpers'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'
import { buildVfrRtAnswers, cleanupVfrRtPool, seedVfrRtPool } from './helpers/seed-vfr-rt-pool'

async function startTrackedVfrRtSession(
  client: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  subjectId: string,
  tracker: ReturnType<typeof createFixtureTracker>,
): Promise<string> {
  const { data: started, error } = await client.rpc('start_vfr_rt_exam_session', {
    p_subject_id: subjectId,
  })
  expect(error).toBeNull()
  const sessionId = (started as { session_id?: string } | null)?.session_id
  expect(sessionId).toBeTruthy()
  if (!sessionId) throw new Error('start_vfr_rt_exam_session returned no session_id')
  tracker.sessions.add(sessionId)
  return sessionId
}

async function seedAdminVfrRtSession(opts: {
  admin: ReturnType<typeof getAdminClient>
  orgId: string
  studentId: string
  startedAtMsAgo: number
  tracker: ReturnType<typeof createFixtureTracker>
}): Promise<string> {
  const { admin, orgId, studentId, startedAtMsAgo, tracker } = opts
  const { data: sessionRow, error: insErr } = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: orgId,
      student_id: studentId,
      mode: 'vfr_rt_exam',
      config: { question_ids: [] },
      total_questions: 1,
      time_limit_seconds: 1800,
      started_at: new Date(Date.now() - startedAtMsAgo).toISOString(),
    })
    .select('id')
    .single()
  if (insErr || !sessionRow) throw new Error(`seed vfr_rt session: ${insErr?.message}`)
  tracker.sessions.add(sessionRow.id)
  return sessionRow.id
}

test.describe('Red Team: Audit Event Completeness — VFR RT (Vector DP, #873)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let orgId: string
  let pool: Awaited<ReturnType<typeof seedVfrRtPool>>

  const tracker = createFixtureTracker()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seeded = await seedRedTeamUsers()
    victimUserId = seeded.victimUserId
    orgId = seeded.orgId
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: victimUserId })
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
  })

  test.afterEach(async () => {
    await cleanupFixtures(admin, tracker)
  })

  test.afterAll(async () => {
    await cleanupVfrRtPool({ admin, orgId, pool })
  })

  test('writes vfr_rt_exam.started when start_vfr_rt_exam_session runs', async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const testStart = new Date().toISOString()

    const sessionId = await startTrackedVfrRtSession(victimClient, pool.subjectId, tracker)

    await expectAuditRow(admin, 'vfr_rt_exam.started', victimUserId, testStart, sessionId)
  })

  test('writes vfr_rt_exam.completed on submit_vfr_rt_exam_answers within time limit', async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)

    const sessionId = await startTrackedVfrRtSession(victimClient, pool.subjectId, tracker)

    const { data: questions, error: qErr } = await victimClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(qErr).toBeNull()
    // §5 cast-guard: verify the shape before treating it as the typed question list.
    if (!Array.isArray(questions)) {
      throw new Error(`get_vfr_rt_exam_questions returned non-array: ${JSON.stringify(questions)}`)
    }
    const answers = buildVfrRtAnswers(questions as Array<{ id: string; question_type: string }>)

    const testStart = new Date().toISOString()
    const { error: submitErr } = await victimClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()

    await expectAuditRow(admin, 'vfr_rt_exam.completed', victimUserId, testStart, sessionId)
  })

  // Non-overdue empty completion path: complete_empty_exam_session on a fresh
  // (within-time-limit) empty vfr_rt session emits vfr_rt_exam.completed — the
  // ELSE branch of mig 102 (L264), symmetric to the overdue vfr_rt_exam.expired
  // test below. Distinct emitter from submit_vfr_rt_exam_answers, so lock it too.
  test('writes vfr_rt_exam.completed when complete_empty_exam_session runs on an empty vfr_rt session', async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)

    // Admin-insert an EMPTY, NON-overdue active vfr_rt session (started now, within
    // the time limit → the non-overdue branch runs, emitting vfr_rt_exam.completed).
    // config.question_ids empty drives the "completed with no answers" path.
    // Service-role insert bypasses the immutable-columns trigger.
    const sessionId = await seedAdminVfrRtSession({
      admin,
      orgId,
      studentId: victimUserId,
      startedAtMsAgo: 0,
      tracker,
    })

    const testStart = new Date().toISOString()
    const { error: completeErr } = await victimClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })
    expect(completeErr).toBeNull()

    await expectAuditRow(admin, 'vfr_rt_exam.completed', victimUserId, testStart, sessionId)
  })

  test('writes vfr_rt_exam.expired when complete_overdue runs on an overdue vfr_rt session', async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)

    // Admin-insert a backdated active vfr_rt session (no pool needed for the
    // overdue path): started 2000s ago > time_limit(1800)+30s grace → overdue.
    // config.question_ids empty → per-part scoring averages over zero rows
    // (COALESCE → 0). Service-role insert bypasses the immutable-columns trigger.
    const sessionId = await seedAdminVfrRtSession({
      admin,
      orgId,
      studentId: victimUserId,
      startedAtMsAgo: 2_000_000,
      tracker,
    })

    const testStart = new Date().toISOString()
    const { error: overdueErr } = await victimClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })
    expect(overdueErr).toBeNull()

    await expectAuditRow(admin, 'vfr_rt_exam.expired', victimUserId, testStart, sessionId)
  })
})
