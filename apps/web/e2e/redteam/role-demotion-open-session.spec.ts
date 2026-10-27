/**
 * Red Team Spec — staff-to-student demotion keeps a non-enrolled open session (Vector KO, #1637).
 *
 * KO: an instructor (no PPL_A enrolment; staff read every subject) starts a PPL quick_quiz.
 *     The admin demotes them to student (`updateStudent`: service-role `users.role` update, then
 *     `set_user_enrolments`). Pre-fix the removed set was empty, so nothing ended and the demoted
 *     student kept a live PPL session; `check_quiz_answer` (session-keyed, Decision 162)
 *     returned the PPL answer key.
 *     BLOCKED (KO): `set_user_enrolments` discards every session outside the final enrolment
 *     set for a student target, and `updateStudent` sweeps on every student save.
 * CONTROL: a PPL-enrolled student whose PPL course is removed has the open session ended.
 *
 * Status: passes — exploit blocked by the sweep.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'

const E2E_REDTEAM_KO_MARKER = '[E2E_REDTEAM_KO]'
const ADMIN_EMAIL = 'redteam-ko-admin@lmsplus.local'
const ADMIN_PASSWORD = 'redteam-ko-admin-2026!'
const VICTIM_EMAIL = 'redteam-ko-demoted@lmsplus.local'
const VICTIM_PASSWORD = 'redteam-ko-demoted-2026!'
const CONTROL_EMAIL = 'redteam-ko-control@lmsplus.local'
const CONTROL_PASSWORD = 'redteam-ko-control-2026!'
const PPL_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000001'
const VFR_RT_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000002'

test.describe('Red Team: staff demotion ends non-enrolled open sessions (KO)', () => {
  test.setTimeout(120_000)

  let service: ReturnType<typeof getAdminClient>
  let victimId = ''
  let controlId = ''
  let adminUser: SupabaseClient
  let victim: SupabaseClient
  let control: SupabaseClient
  let pplSubjectId = ''
  let pplQuestions: { id: string; correct_option_id: string }[] = []

  const setRole = async (userId: string, role: 'student' | 'instructor') => {
    const { error } = await service.from('users').update({ role }).eq('id', userId)
    if (error) throw new Error(`${E2E_REDTEAM_KO_MARKER} set role: ${error.message}`)
  }

  const setCourses = async (userId: string, courseIds: string[]) => {
    const { error } = await adminUser.rpc('set_user_enrolments', {
      p_user_id: userId,
      p_course_ids: courseIds,
    })
    if (error) throw new Error(`${E2E_REDTEAM_KO_MARKER} set_user_enrolments: ${error.message}`)
  }

  const startPpl = async (client: SupabaseClient): Promise<string> => {
    const { data, error } = await client.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: pplSubjectId,
      p_topic_id: null,
      p_question_ids: pplQuestions.map((q) => q.id),
    })
    if (error || typeof data !== 'string') {
      throw new Error(`${E2E_REDTEAM_KO_MARKER} start: ${error?.message ?? 'no id'}`)
    }
    return data
  }

  const sessionState = async (sessionId: string) => {
    const { data, error } = await service
      .from('quiz_sessions')
      .select('deleted_at, ended_at')
      .eq('id', sessionId)
    if (error) throw new Error(`${E2E_REDTEAM_KO_MARKER} session: ${error.message}`)
    expect(data).toHaveLength(1)
    const row = data?.[0] as { deleted_at: string | null; ended_at: string | null }
    return { live: row.deleted_at === null && row.ended_at === null }
  }

  test.beforeAll(async () => {
    service = getAdminClient()
    const orgId = await getEgmontOrgId(service)
    await upsertUser(service, ADMIN_EMAIL, ADMIN_PASSWORD, orgId, 'admin')
    victimId = await upsertUser(service, VICTIM_EMAIL, VICTIM_PASSWORD, orgId, 'instructor')
    controlId = await upsertUser(service, CONTROL_EMAIL, CONTROL_PASSWORD, orgId)

    const { data: subj, error: subjErr } = await service
      .from('easa_subjects')
      .select('id, course_id')
      .eq('code', '050')
      .single()
    if (subjErr || !subj) throw new Error(`subject 050: ${subjErr?.message}`)
    expect(subj.course_id).toBe(PPL_COURSE_ID)
    pplSubjectId = subj.id

    const { data: qs, error: qErr } = await service
      .from('questions')
      .select('id, correct_option_id')
      .eq('organization_id', orgId)
      .eq('subject_id', pplSubjectId)
      .eq('status', 'active')
      .eq('question_type', 'multiple_choice')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(3)
    if (qErr) throw new Error(`questions: ${qErr.message}`)
    pplQuestions = (qs ?? []) as { id: string; correct_option_id: string }[]
    expect(pplQuestions).toHaveLength(3)

    adminUser = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    control = await createAuthenticatedClient(CONTROL_EMAIL, CONTROL_PASSWORD)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    for (const email of [VICTIM_EMAIL, CONTROL_EMAIL]) {
      try {
        await cleanupStudentActiveSessions(email)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    try {
      await setRole(victimId, 'instructor')
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await setCourses(controlId, [PPL_COURSE_ID, VFR_RT_COURSE_ID])
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('KO: demoting an instructor to a student not enrolled in PPL ends their open PPL session', async () => {
    await setRole(victimId, 'instructor')
    await setCourses(victimId, [VFR_RT_COURSE_ID])
    await setCourses(controlId, [PPL_COURSE_ID, VFR_RT_COURSE_ID])

    // CONTROL: course removal ends the open session of an enrolled student.
    const controlSession = await startPpl(control)
    expect(await sessionState(controlSession)).toEqual({ live: true })
    await setCourses(controlId, [VFR_RT_COURSE_ID])
    expect(await sessionState(controlSession)).toEqual({ live: false })

    // ATTACK: staff starts a PPL session, then is demoted by the updateStudent path.
    const victimSession = await startPpl(victim)
    expect(await sessionState(victimSession)).toEqual({ live: true })
    await setRole(victimId, 'student')
    await setCourses(victimId, [VFR_RT_COURSE_ID])

    // Demotion took effect: PPL questions are hidden from the demoted student.
    const hidden = await victim.from('questions').select('id').eq('subject_id', pplSubjectId)
    expect(hidden.error).toBeNull()
    expect(hidden.data).toEqual([])

    expect(await sessionState(victimSession)).toEqual({ live: false })
    const [first] = pplQuestions
    if (!first) throw new Error('no PPL question')
    const oracle = await victim.rpc('check_quiz_answer', {
      p_question_id: first.id,
      p_selected_option_id: first.correct_option_id,
      p_session_id: victimSession,
    })
    expect(oracle.data).toBeNull()
    expect(oracle.error).not.toBeNull()
  })
})
