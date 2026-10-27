/**
 * Red Team Spec — start RPCs answer a non-enrolled student before the enrolment gate (#1637).
 * `trg_quiz_sessions_enforce_enrolment` fires at the session INSERT, after each SECURITY DEFINER
 * start RPC has already read hidden rows, so the error differs by hidden state:
 *   KP: `start_exam_session` on PPL 050 (exam config present) raises `not_enrolled`; on a subject
 *       with no config it raises `no exam configuration found for this subject` — an existence
 *       oracle on `exam_configs`, which `exam_configs_select_enrolled` hides (Decision 167).
 *   KQ: `start_discovery` on PPL 050 raises `not_enrolled` when the draw is non-empty and returns
 *       `{session_id: null}` when it is empty — an existence oracle on hidden `questions`
 *       (any filter combination: topic, subtopic, calc_mode, has_image, unseen/incorrect/flagged).
 * SHOULD: a non-enrolled caller gets `not_enrolled` regardless of hidden state.
 *
 * Status: BLOCKED — migs 20261028000700–20261028001000 raise `not_enrolled` before any subject-scoped read.
 */

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'

const E2E_REDTEAM_KP_MARKER = '[E2E_REDTEAM_KP]'
const UNENROLLED_EMAIL = 'redteam-kp-unenrolled@lmsplus.local'
const UNENROLLED_PASSWORD = 'redteam-kp-unenrolled-2026!'
const PPL_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000001'

test.describe(`Red Team: start RPC pre-gate oracle (KP, KQ) ${E2E_REDTEAM_KP_MARKER}`, () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let studentId: string
  let student: SupabaseClient
  let pplSubjectId: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    orgId = await getEgmontOrgId(admin)
    studentId = await upsertUser(admin, UNENROLLED_EMAIL, UNENROLLED_PASSWORD, orgId)

    const { error: unenrolErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', studentId)
      .eq('course_id', PPL_COURSE_ID)
      .is('deleted_at', null)
    if (unenrolErr) throw new Error(`unenrol PPL: ${unenrolErr.message}`)

    const { data: subj, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id, course_id')
      .eq('code', '050')
      .single()
    if (subjErr || !subj) throw new Error(`subject 050: ${subjErr?.message}`)
    expect(subj.course_id).toBe(PPL_COURSE_ID)
    pplSubjectId = subj.id

    // Preconditions the oracle reads: an enabled, live 050 exam config and active 050 MC questions.
    const { data: cfg, error: cfgErr } = await admin
      .from('exam_configs')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', pplSubjectId)
      .eq('enabled', true)
      .is('deleted_at', null)
    if (cfgErr) throw new Error(`exam config: ${cfgErr.message}`)
    expect(cfg?.length).toBe(1)

    const { count, error: qErr } = await admin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('subject_id', pplSubjectId)
      .eq('status', 'active')
      .eq('question_type', 'multiple_choice')
      .is('deleted_at', null)
    if (qErr) throw new Error(`questions: ${qErr.message}`)
    expect(count ?? 0).toBeGreaterThan(0)

    student = await createAuthenticatedClient(UNENROLLED_EMAIL, UNENROLLED_PASSWORD)

    // The hidden state is invisible through RLS: the oracle is the only read path.
    const [s, c] = await Promise.all([
      student.from('easa_subjects').select('id').eq('id', pplSubjectId),
      student.from('exam_configs').select('id').eq('subject_id', pplSubjectId),
    ])
    expect(s.error).toBeNull()
    expect(c.error).toBeNull()
    expect(s.data).toHaveLength(0)
    expect(c.data).toHaveLength(0)
  })

  test.afterEach(async () => {
    await cleanupStudentActiveSessions(UNENROLLED_EMAIL)
  })

  test('KP: start_exam_session raises not_enrolled whether or not the hidden subject has an exam config', async () => {
    const withConfig = await student.rpc('start_exam_session', { p_subject_id: pplSubjectId })
    const withoutConfig = await student.rpc('start_exam_session', { p_subject_id: randomUUID() })

    expect(withConfig.error?.message).toBe('not_enrolled')
    expect(withoutConfig.error?.message).toBe('not_enrolled')
  })

  test('KQ: start_discovery raises not_enrolled whether or not the hidden draw is empty', async () => {
    const args = {
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 1,
      p_filters: ['all'],
      p_calc_mode: 'all',
    }
    const nonEmpty = await student.rpc('start_discovery', {
      ...args,
      p_subject_id: pplSubjectId,
      p_has_image: 'all',
    })
    const empty = await student.rpc('start_discovery', {
      ...args,
      p_subject_id: randomUUID(),
      p_has_image: 'all',
    })

    expect(nonEmpty.error?.message).toBe('not_enrolled')
    expect(empty.data).toBeNull()
    expect(empty.error?.message).toBe('not_enrolled')

    const { data: rows, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentId)
      .is('deleted_at', null)
    expect(error).toBeNull()
    expect(rows).toHaveLength(0)
  })
})
