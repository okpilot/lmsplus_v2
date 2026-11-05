/**
 * Red Team Spec — Vector KZ (#1177): flagged_questions INSERT/UPDATE require a question visible
 * to the caller.
 *   KZ1: INSERT own flag on a cross-org active question is refused (42501).
 *   KZ2: INSERT own flag on an own-org question of a course the student is not enrolled in is
 *        refused (42501).
 *   KZ3: INSERT own flag on a soft-deleted own-org question is refused (42501).
 *   KZ4: UPDATE of an own flag's question_id to a cross-org question is refused (42501); the row
 *        keeps its question_id.
 *        A combined repoint + soft-delete is refused too (42501, 'immutable').
 *   KZ5: quiz_drafts UPDATE of organization_id is refused (42501, no UPDATE grant); the row is
 *        unchanged.
 *   KZ6: undelete of a soft-deleted flag whose question became invisible is refused (42501).
 * CONTROLS: flag + re-flag of a visible question succeeds; unflag of an existing flag whose
 * question was soft-deleted afterwards succeeds.
 *
 * Mechanism: KZ1-KZ3 = RESTRICTIVE `flagged_questions_insert_visible_question`; KZ6 = RESTRICTIVE
 * `flagged_questions_update_visible_question`; KZ4 = trigger `trg_flagged_questions_protect_question_id`.
 * quiz_drafts has no INSERT/UPDATE grant or policy.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, getOrCreateOtherOrg, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_KZ_MARKER,
  E2E_REDTEAM_KZ_RT_ONLY_EMAIL,
  E2E_REDTEAM_KZ_RT_ONLY_PASSWORD,
} from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

const PPL_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000001'
const VFR_RT_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000002'
const RLS_VIOLATION = '42501'

type Scaffold = {
  bank_id: string
  subject_id: string
  topic_id: string
  created_by: string
}

test.describe('Red Team: flagged_questions question scope (KZ1-KZ6)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let otherOrgId: string
  let attackerId: string
  let rtOnlyId: string
  let attacker: SupabaseClient
  let rtOnly: SupabaseClient
  let scaffold: Scaffold
  let pplQuestionId: string
  let draftSeededByUs = false
  let draftId = ''
  const createdQuestions = new Set<string>()
  const tracker = createFixtureTracker()

  async function insertQuestion(label: string, organizationId: string): Promise<string> {
    const { data, error } = await admin
      .from('questions')
      .insert({
        organization_id: organizationId,
        ...scaffold,
        question_text: `${E2E_REDTEAM_KZ_MARKER} ${label}`,
        question_number: `${E2E_REDTEAM_KZ_MARKER} ${label} ${Date.now()}`,
        explanation_text: `${E2E_REDTEAM_KZ_MARKER} explanation`,
        difficulty: 'easy',
        status: 'active',
        question_type: 'multiple_choice',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
          { id: 'd', text: 'D' },
        ],
        correct_option_id: 'a',
        canonical_answer: null,
        accepted_synonyms: [],
        dialog_template: null,
        blanks_config: [],
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`insert question ${label}: ${error?.message}`)
    createdQuestions.add(data.id)
    return data.id
  }

  async function softDeleteQuestion(id: string): Promise<void> {
    const { error } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(`soft-delete question: ${error.message}`)
  }

  async function seedFlag(studentId: string, questionId: string): Promise<void> {
    const { error } = await admin
      .from('flagged_questions')
      .upsert(
        { student_id: studentId, question_id: questionId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    if (error) throw new Error(`seed flag: ${error.message}`)
    tracker.flags.add(`${studentId}::${questionId}`)
  }

  async function flagRows(studentId: string, questionId: string) {
    const { data, error } = await admin
      .from('flagged_questions')
      .select('question_id, deleted_at')
      .eq('student_id', studentId)
      .eq('question_id', questionId)
    if (error) throw new Error(`flagRows: ${error.message}`)
    return data ?? []
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerId = seed.attackerUserId
    otherOrgId = await getOrCreateOtherOrg(admin)
    expect(otherOrgId).not.toBe(orgId)

    rtOnlyId = await upsertUser(
      admin,
      E2E_REDTEAM_KZ_RT_ONLY_EMAIL,
      E2E_REDTEAM_KZ_RT_ONLY_PASSWORD,
      await getEgmontOrgId(admin),
    )
    const { error: unenrolErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', rtOnlyId)
      .eq('course_id', PPL_COURSE_ID)
      .is('deleted_at', null)
    if (unenrolErr) throw new Error(`unenrol PPL: ${unenrolErr.message}`)
    const { data: live, error: liveErr } = await admin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', rtOnlyId)
      .is('deleted_at', null)
    if (liveErr) throw new Error(`enrolments: ${liveErr.message}`)
    expect((live ?? []).map((r) => r.course_id)).toEqual([VFR_RT_COURSE_ID])

    const { data: subj, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id, course_id')
      .eq('code', '050')
      .single()
    if (subjErr || !subj) throw new Error(`subject 050: ${subjErr?.message}`)
    expect(subj.course_id).toBe(PPL_COURSE_ID)
    const { data: q, error: qErr } = await admin
      .from('questions')
      .select('id, bank_id, subject_id, topic_id, created_by')
      .eq('organization_id', orgId)
      .eq('subject_id', subj.id)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(1)
      .single()
    if (qErr || !q) throw new Error(`ppl question: ${qErr?.message}`)
    pplQuestionId = q.id
    scaffold = {
      bank_id: q.bank_id,
      subject_id: q.subject_id,
      topic_id: q.topic_id,
      created_by: q.created_by,
    }

    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    rtOnly = await createAuthenticatedClient(
      E2E_REDTEAM_KZ_RT_ONLY_EMAIL,
      E2E_REDTEAM_KZ_RT_ONLY_PASSWORD,
    )
  })

  test.afterEach(async () => {
    await cleanupFixtures(admin, tracker)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    if (createdQuestions.size > 0) {
      try {
        const { error } = await admin
          .from('questions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', Array.from(createdQuestions))
          .is('deleted_at', null)
        if (error) throw new Error(`afterAll questions: ${error.message}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        createdQuestions.clear()
      }
    }
    if (draftSeededByUs && draftId) {
      try {
        const { error } = await admin.from('quiz_drafts').delete().eq('id', draftId)
        if (error) throw new Error(`afterAll draft: ${error.message}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        draftSeededByUs = false
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('CONTROL: flag and re-flag of a visible question succeeds', async () => {
    const qid = await insertQuestion('control-visible', orgId)
    tracker.flags.add(`${attackerId}::${qid}`)
    const flag = await attacker
      .from('flagged_questions')
      .upsert(
        { student_id: attackerId, question_id: qid, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    expect(flag.error).toBeNull()
    expect(await flagRows(attackerId, qid)).toEqual([{ question_id: qid, deleted_at: null }])

    const unflag = await attacker
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', attackerId)
      .eq('question_id', qid)
    expect(unflag.error).toBeNull()
    const unflagged = await flagRows(attackerId, qid)
    expect(unflagged).toHaveLength(1)
    expect(unflagged[0]?.deleted_at).not.toBeNull()

    const reflag = await attacker
      .from('flagged_questions')
      .upsert(
        { student_id: attackerId, question_id: qid, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    expect(reflag.error).toBeNull()
    const rows = await flagRows(attackerId, qid)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deleted_at).toBeNull()
  })

  test('CONTROL: unflag succeeds on a flag whose question was soft-deleted afterwards', async () => {
    const qid = await insertQuestion('control-unflag', orgId)
    await seedFlag(attackerId, qid)
    await softDeleteQuestion(qid)
    const visible = await attacker.from('questions').select('id').eq('id', qid)
    expect(visible.error).toBeNull()
    expect(visible.data).toHaveLength(0)

    const unflag = await attacker
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', attackerId)
      .eq('question_id', qid)
      .select('question_id')
    expect(unflag.error).toBeNull()
    expect(unflag.data).toHaveLength(1)
    const rows = await flagRows(attackerId, qid)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deleted_at).not.toBeNull()
  })

  test('KZ1: flagging a cross-org active question is refused', async () => {
    const qid = await insertQuestion('kz1-cross-org', otherOrgId)
    const own = await insertQuestion('kz1-own-org-control', orgId)
    tracker.flags.add(`${attackerId}::${qid}`)
    tracker.flags.add(`${attackerId}::${own}`)
    const control = await attacker
      .from('flagged_questions')
      .insert({ student_id: attackerId, question_id: own })
    expect(control.error).toBeNull()

    const { data: exists, error: existsErr } = await admin
      .from('questions')
      .select('id')
      .eq('id', qid)
    expect(existsErr).toBeNull()
    expect(exists).toHaveLength(1)
    const hidden = await attacker.from('questions').select('id').eq('id', qid)
    expect(hidden.error).toBeNull()
    expect(hidden.data).toHaveLength(0)

    const attack = await attacker
      .from('flagged_questions')
      .insert({ student_id: attackerId, question_id: qid })
    expect(attack.error?.code).toBe(RLS_VIOLATION)
    expect(await flagRows(attackerId, qid)).toHaveLength(0)
  })

  test('KZ2: flagging a question of a not-enrolled course is refused', async () => {
    tracker.flags.add(`${rtOnlyId}::${pplQuestionId}`)
    const control = await attacker
      .from('flagged_questions')
      .insert({ student_id: attackerId, question_id: pplQuestionId })
    if (!control.error) tracker.flags.add(`${attackerId}::${pplQuestionId}`)
    // The attacker may already hold a flag on this question (23505): visible either way.
    expect([null, '23505']).toContain(control.error?.code ?? null)

    const hidden = await rtOnly.from('questions').select('id').eq('id', pplQuestionId)
    expect(hidden.error).toBeNull()
    expect(hidden.data).toHaveLength(0)

    const attack = await rtOnly
      .from('flagged_questions')
      .insert({ student_id: rtOnlyId, question_id: pplQuestionId })
    expect(attack.error?.code).toBe(RLS_VIOLATION)
    expect(await flagRows(rtOnlyId, pplQuestionId)).toHaveLength(0)
  })

  test('KZ3: flagging a soft-deleted own-org question is refused', async () => {
    const qid = await insertQuestion('kz3-soft-deleted', orgId)
    tracker.flags.add(`${attackerId}::${qid}`)
    // Control: the attacker sees the question until it is soft-deleted.
    const visible = await attacker.from('questions').select('id').eq('id', qid)
    expect(visible.error).toBeNull()
    expect(visible.data).toHaveLength(1)
    await softDeleteQuestion(qid)
    const hidden = await attacker.from('questions').select('id').eq('id', qid)
    expect(hidden.error).toBeNull()
    expect(hidden.data).toHaveLength(0)

    const attack = await attacker
      .from('flagged_questions')
      .insert({ student_id: attackerId, question_id: qid })
    expect(attack.error?.code).toBe(RLS_VIOLATION)
    expect(await flagRows(attackerId, qid)).toHaveLength(0)
  })

  test('KZ4: repointing an own flag to a cross-org question is refused', async () => {
    const own = await insertQuestion('kz4-own', orgId)
    const foreign = await insertQuestion('kz4-cross-org', otherOrgId)
    await seedFlag(attackerId, own)
    expect(await flagRows(attackerId, own)).toEqual([{ question_id: own, deleted_at: null }])

    const attack = await attacker
      .from('flagged_questions')
      .update({ question_id: foreign })
      .eq('student_id', attackerId)
      .eq('question_id', own)
      .select('question_id')
    expect(attack.error?.code).toBe(RLS_VIOLATION)
    expect(await flagRows(attackerId, own)).toEqual([{ question_id: own, deleted_at: null }])
    expect(await flagRows(attackerId, foreign)).toHaveLength(0)

    const combined = await attacker
      .from('flagged_questions')
      .update({ question_id: foreign, deleted_at: new Date().toISOString() })
      .eq('student_id', attackerId)
      .eq('question_id', own)
      .select('question_id')
    expect(combined.error?.code).toBe(RLS_VIOLATION)
    expect(combined.error?.message).toContain('immutable')
    expect(await flagRows(attackerId, own)).toEqual([{ question_id: own, deleted_at: null }])
    expect(await flagRows(attackerId, foreign)).toHaveLength(0)
  })

  test('KZ5: quiz_drafts organization_id cannot be updated by the owner', async () => {
    const { data: existing, error: exErr } = await admin
      .from('quiz_drafts')
      .select('id')
      .eq('student_id', attackerId)
    if (exErr) throw new Error(`draft lookup: ${exErr.message}`)
    if ((existing ?? []).length > 0) {
      draftId = existing?.[0]?.id ?? ''
    } else {
      const { data, error } = await admin
        .from('quiz_drafts')
        .insert({
          student_id: attackerId,
          organization_id: orgId,
          question_ids: [],
          session_config: { e2e_marker: E2E_REDTEAM_KZ_MARKER },
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(`seed draft: ${error?.message}`)
      draftId = data.id
      draftSeededByUs = true
    }

    const own = await attacker.from('quiz_drafts').select('id').eq('id', draftId)
    expect(own.error).toBeNull()
    expect(own.data).toHaveLength(1)

    const attack = await attacker
      .from('quiz_drafts')
      .update({ organization_id: otherOrgId })
      .eq('id', draftId)
      .select('id')
    expect(attack.error?.code).toBe(RLS_VIOLATION)
    const { data: after, error: afterErr } = await admin
      .from('quiz_drafts')
      .select('organization_id')
      .eq('id', draftId)
      .single()
    expect(afterErr).toBeNull()
    expect(after?.organization_id).toBe(orgId)
  })

  test('KZ6: undeleting a flag whose question became invisible is refused', async () => {
    const qid = await insertQuestion('kz6-undelete', orgId)
    await seedFlag(attackerId, qid)
    const unflag = await attacker
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', attackerId)
      .eq('question_id', qid)
    expect(unflag.error).toBeNull()
    await softDeleteQuestion(qid)
    const hidden = await attacker.from('questions').select('id').eq('id', qid)
    expect(hidden.data).toHaveLength(0)
    const before = await flagRows(attackerId, qid)
    expect(before).toHaveLength(1)
    expect(before[0]?.deleted_at).not.toBeNull()

    const attack = await attacker
      .from('flagged_questions')
      .update({ deleted_at: null })
      .eq('student_id', attackerId)
      .eq('question_id', qid)
      .select('question_id')
    expect(attack.error?.code).toBe(RLS_VIOLATION)
    const after = await flagRows(attackerId, qid)
    expect(after).toHaveLength(1)
    expect(after[0]?.deleted_at).not.toBeNull()
  })
})
