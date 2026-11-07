/**
 * Red Team Spec: Vector LL — get_vfr_rt_exam_results passed_overall forgery.
 *
 * Migration 20261110000200 returns passed_overall = the stored quiz_sessions.passed.
 * Attack: the owner of a failed, ended vfr_rt_exam session UPDATEs its own row to
 * passed = true. Defence: `passed` is outside the authenticated column UPDATE grant
 * (migration 20260605000001).
 * CONTROL: a service-role write of passed = true DOES flip passed_overall, so the
 * attacker arm is held by the grant, not by the RPC ignoring the column.
 */

import { expect, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { buildVfrRtProgressAnswers, saveAndFinish } from './helpers/finish-session'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'
import { cleanupVfrRtPool, seedVfrRtPool, type VfrRtPool } from './helpers/seed-vfr-rt-pool'

type StartedSession = { session_id: string }
type PoolQuestion = { id: string; question_type: string }
type Results = {
  part1_pct: number | null
  part2_pct: number | null
  part3_pct: number | null
  passed_overall: boolean
  passed_per_part: { part1: boolean | null; part2: boolean | null; part3: boolean | null }
}

test.describe('Red Team: get_vfr_rt_exam_results passed_overall forgery (LL)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let pool: VfrRtPool
  let orgId: string
  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: seed.victimUserId })
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
  })

  test.afterAll(async () => {
    await cleanupVfrRtPool({ admin, orgId, pool })
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      if (createdSessionIds.size > 0) {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', Array.from(createdSessionIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[vfr-rt-passed-forgery] soft-deleted ${data?.length} session(s)`)
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      createdSessionIds.clear()
    }
    try {
      await cleanupStudentActiveSessions(VICTIM_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  const readResults = async (sessionId: string): Promise<Results> => {
    const { data, error } = await victimClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    return data as Results
  }

  const runFailedSession = async (): Promise<string> => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const { data: startedRaw, error: startErr } = await victimClient.rpc(
      'start_vfr_rt_exam_session',
      { p_subject_id: pool.subjectId },
    )
    expect(startErr).toBeNull()
    expect(startedRaw).not.toBeNull()
    const sessionId = (startedRaw as StartedSession).session_id
    createdSessionIds.add(sessionId)

    const { data: qRaw, error: qErr } = await victimClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(qErr).toBeNull()
    expect(Array.isArray(qRaw)).toBe(true)
    const answers = buildVfrRtProgressAnswers(qRaw as PoolQuestion[], { failPart2: true })
    const { error: finishErr } = await saveAndFinish(victimClient, sessionId, answers)
    expect(finishErr).toBeNull()
    return sessionId
  }

  test('LL: the owner cannot flip a failed vfr rt result to passed', async () => {
    const sessionId = await runFailedSession()

    const before = await readResults(sessionId)
    expect(before.part2_pct).toBe(0)
    expect(before.passed_per_part).toEqual({ part1: true, part2: false, part3: true })
    expect(before.passed_overall).toBe(false)

    const { data: forged, error: forgeErr } = await victimClient
      .from('quiz_sessions')
      .update({ passed: true })
      .eq('id', sessionId)
      .select('id')
    expect(forgeErr).not.toBeNull()
    expect(forgeErr?.code).toBe('42501')
    expect(forged).toBeNull()

    const { data: row, error: rowErr } = await admin
      .from('quiz_sessions')
      .select('passed, ended_at')
      .eq('id', sessionId)
      .single()
    expect(rowErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()
    expect(row?.passed).toBe(false)

    const after = await readResults(sessionId)
    expect(after.passed_overall).toBe(false)

    // CONTROL: the column is what the RPC reads — a privileged write flips it.
    const { data: ctl, error: ctlErr } = await admin
      .from('quiz_sessions')
      .update({ passed: true })
      .eq('id', sessionId)
      .select('id')
    expect(ctlErr).toBeNull()
    expect(ctl?.length).toBe(1)
    const controlled = await readResults(sessionId)
    expect(controlled.passed_overall).toBe(true)
    expect(controlled.passed_per_part.part2).toBe(false)
  })
})
