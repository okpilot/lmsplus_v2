/**
 * Red Team Spec: save-for-later on the same session id (#1026 PR 1b) — Vectors GM/GN/GO
 *
 * Surface: quiz_sessions.saved_at (no UPDATE column grant), CHECKs quiz_sessions_saved_requires_deleted /
 * quiz_sessions_saved_practice_open, save_quiz_for_later, resume_saved_quiz, discard_saved_quiz,
 * get_quiz_progress status 'saved', uq_one_active_session_per_student.
 *
 * GM (soft-delete-bypass): the owner revives a saved row by direct UPDATE instead of resume_saved_quiz.
 * GN (answer-oracle): a saved practice quiz is resumed or graded while a mock_exam on the same
 *     questions is active; an exam session is saved.
 * GO (idor): another student drives save/resume/discard/progress against the victim's saved row.
 *
 * Status: Expected to PASS. Each test carries a control arm proving the guarded effect occurs once
 * the guard's condition is absent.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SQ_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const DEVICE_A = '00000000-0000-4000-8000-0000000000a1'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: saved quizzes (Vectors GM/GN/GO)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let victim: Client
  let orgId: string
  let attackerUserId: string
  let victimUserId: string
  let q1: string
  let q2: string

  const clearActive = async (studentId: string): Promise<void> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`clearActive: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[saved-quiz] cleared ${data?.length} session(s)`)
  }

  const seedSession = async (studentId: string, mode: 'quick_quiz' | 'mock_exam') => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode,
        total_questions: 2,
        time_limit_seconds: mode === 'mock_exam' ? 3600 : null,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_SQ_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const seedSaved = async (): Promise<string> => {
    const sessionId = await seedSession(victimUserId, 'quick_quiz')
    const save = await victim.rpc('save_quiz_for_later', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    expect(save.error).toBeNull()
    return sessionId
  }

  const readRow = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at, saved_at, ended_at, active_device_id')
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`readRow: ${error?.message}`)
    return data
  }

  const status = async (client: Client, sessionId: string): Promise<unknown> => {
    const r = await client.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(r.error).toBeNull()
    return isRecord(r.data) ? r.data.status : undefined
  }

  const resume = (sessionId: string) =>
    victim.rpc('resume_saved_quiz', { p_session_id: sessionId, p_device_id: DEVICE_A })

  const grade = (sessionId: string, deviceId?: string) =>
    victim.rpc('check_quiz_answer', {
      p_question_id: q1,
      p_selected_option_id: 'a',
      p_session_id: sessionId,
      ...(deviceId ? { p_device_id: deviceId } : {}),
    })

  // Every direct-UPDATE revive route the owner holds is refused.
  const expectDirectReviveRefused = async (sessionId: string): Promise<void> => {
    const reviveDeleted = await victim
      .from('quiz_sessions')
      .update({ deleted_at: null })
      .eq('id', sessionId)
      .select('id')
    // students_update_sessions reaches live rows only (mig 20261003000400): zero rows, no error.
    expect(reviveDeleted.error).toBeNull()
    expect(reviveDeleted.data).toEqual([])
    for (const patch of [{ saved_at: null }, { deleted_at: null, saved_at: null }]) {
      const r = await victim.from('quiz_sessions').update(patch).eq('id', sessionId).select('id')
      expect(r.error?.code).toBe('42501')
    }
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerUserId = seed.attackerUserId
    victimUserId = seed.victimUserId
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    q1 = data[0]?.id as string
    q2 = data[1]?.id as string
  })

  test.beforeEach(async () => {
    await clearActive(victimUserId)
    await clearActive(attackerUserId)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ saved_at: null })
        .eq('config->>e2e_marker', E2E_REDTEAM_SQ_MARKER)
        .not('saved_at', 'is', null)
        .select('id')
      if (error) throw new Error(`unsave: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[saved-quiz] unsaved ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_SQ_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[saved-quiz] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('GM: a saved row cannot be revived by a direct UPDATE', async () => {
    const sessionId = await seedSaved()
    const before = await readRow(sessionId)
    expect(before.deleted_at).not.toBeNull()
    expect(before.saved_at).not.toBeNull()
    expect(await status(victim, sessionId)).toBe('saved')

    await expectDirectReviveRefused(sessionId)
    expect(await readRow(sessionId)).toEqual(before)

    // Control: the RPC path revives the same id.
    expect((await resume(sessionId)).error).toBeNull()
    const after = await readRow(sessionId)
    expect(after).toEqual({
      deleted_at: null,
      saved_at: null,
      ended_at: null,
      active_device_id: DEVICE_A,
    })
    expect(await status(victim, sessionId)).toBe('open')
  })

  test('GN: a saved quiz cannot be resumed or graded while an exam is active', async () => {
    const savedId = await seedSaved()
    const examId = await seedSession(victimUserId, 'mock_exam')

    const saveExam = await victim.rpc('save_quiz_for_later', {
      p_session_id: examId,
      p_device_id: null,
    })
    expect(saveExam.error?.message).toBe('unsupported_session_mode')
    expect(await readRow(examId)).toEqual({
      deleted_at: null,
      saved_at: null,
      ended_at: null,
      active_device_id: null,
    })

    expect((await resume(savedId)).error?.message).toBe('another_session_active')
    const oracle = await grade(savedId)
    expect(oracle.data).toBeNull()
    expect(oracle.error?.message).toMatch(/session not found or not owned/)
    expect(await status(victim, savedId)).toBe('saved')

    // Control: with the exam gone, the same resume and grading succeed.
    await clearActive(victimUserId)
    expect((await resume(savedId)).error).toBeNull()
    const graded = await grade(savedId, DEVICE_A)
    expect(graded.error).toBeNull()
    expect(isRecord(graded.data) && typeof graded.data.correct_option_id === 'string').toBe(true)
  })

  test('GO: another student cannot save, resume, discard or read the victim saved quiz', async () => {
    const savedId = await seedSaved()
    const before = await readRow(savedId)
    expect(before.saved_at).not.toBeNull()

    const probes = await Promise.all([
      attacker.rpc('resume_saved_quiz', { p_session_id: savedId, p_device_id: DEVICE_A }),
      attacker.rpc('discard_saved_quiz', { p_session_id: savedId }),
      attacker.rpc('save_quiz_for_later', { p_session_id: savedId, p_device_id: null }),
      attacker.rpc('get_quiz_progress', { p_session_id: savedId }),
    ])
    for (const r of probes) {
      expect(r.data).toBeNull()
      expect(r.error?.message).toBe('session_not_found')
    }
    expect(await readRow(savedId)).toEqual(before)

    // Control: the owner's discard clears the marker; the row stays soft-deleted and is no longer resumable.
    const discard = await victim.rpc('discard_saved_quiz', { p_session_id: savedId })
    expect(discard.error).toBeNull()
    const after = await readRow(savedId)
    expect(after.saved_at).toBeNull()
    expect(after.deleted_at).not.toBeNull()
    expect((await resume(savedId)).error?.message).toBe('session_not_saved')
    expect(await status(victim, savedId)).toBe('discarded')
  })
})
