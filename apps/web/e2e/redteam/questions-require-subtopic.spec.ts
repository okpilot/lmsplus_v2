/**
 * Red Team Spec — questions_require_subtopic trigger (mig 20261113000100, #1181).
 *
 *  - LX: a student INSERTs a NULL-subtopic question under a topic of a subject outside their
 *        enrolment → 42501 RLS, never `subtopic_required` (BEFORE-row trigger runs as INVOKER
 *        under the student's syllabus RLS, so it must not reveal non-enrolled subtopics).
 *        Control: the admin's identical insert raises `subtopic_required`.
 *  - LY: an admin moves a live subtopic to another topic via PostgREST (would detach every
 *        question filed under it from its topic) → 42501, topic_id unchanged.
 *        Control: the admin renames the same subtopic.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SYLLABUS_CODE_PREFIX } from './helpers/seed-markers'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>
type Admin = ReturnType<typeof getAdminClient>

const MARKER_LIKE = `${E2E_REDTEAM_SYLLABUS_CODE_PREFIX}%`
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

function markerCode(): string {
  return `${E2E_REDTEAM_SYLLABUS_CODE_PREFIX}${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

async function cleanupMarkerSyllabus(admin: Admin): Promise<void> {
  const errors: string[] = []
  const subj = await admin.from('easa_subjects').select('id').like('code', MARKER_LIKE)
  if (subj.error) throw new Error(`afterEach: marker subjects lookup: ${subj.error.message}`)
  const subjectIds = (subj.data ?? []).map((r) => r.id as string)
  if (subjectIds.length === 0) return
  const top = await admin.from('easa_topics').select('id').in('subject_id', subjectIds)
  if (top.error) throw new Error(`afterEach: marker topics lookup: ${top.error.message}`)
  const topicIds = (top.data ?? []).map((r) => r.id as string)
  const now = new Date().toISOString()
  const steps: Array<[string, string, string[], boolean]> = [
    ['questions', 'subject_id', subjectIds, false],
    ['easa_subtopics', 'topic_id', topicIds, false],
    ['easa_topics', 'subject_id', subjectIds, true],
    ['easa_subjects', 'id', subjectIds, true],
  ]
  for (const [table, col, values, dependent] of steps) {
    if (dependent && errors.length > 0) continue
    try {
      const { error } = await admin
        .from(table)
        .update({ deleted_at: now })
        .in(col, values.length > 0 ? values : [NIL_UUID])
        .is('deleted_at', null)
      if (error) throw new Error(`${table} soft-delete: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
}

test.describe('Red Team: questions_require_subtopic (LX, LY)', () => {
  test.setTimeout(90_000)

  let admin: Admin
  let adminClient: Client
  let attackerClient: Client
  let orgId: string
  let adminUserId: string
  let attackerId: string
  let bankId: string
  let foreignCourseId: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    attackerId = (await seedRedTeamUsers()).attackerUserId
    const own = await seedRedTeamAdmin()
    orgId = own.orgId
    adminUserId = own.adminUserId
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    const bank = await admin
      .from('question_banks')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .limit(1)
      .single()
    if (bank.error || !bank.data) throw new Error(`question bank: ${bank.error?.message}`)
    bankId = bank.data.id as string

    const enrolled = await admin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', attackerId)
      .is('deleted_at', null)
    if (enrolled.error) throw new Error(`attacker enrolments: ${enrolled.error.message}`)
    const enrolledIds = new Set((enrolled.data ?? []).map((r) => r.course_id as string))
    const courses = await admin.from('courses').select('id')
    if (courses.error) throw new Error(`courses: ${courses.error.message}`)
    const foreign = (courses.data ?? [])
      .map((r) => r.id as string)
      .find((id) => !enrolledIds.has(id))
    if (!foreign) throw new Error('no course outside the attacker enrolment')
    foreignCourseId = foreign
  })

  test.afterEach(async () => {
    await cleanupMarkerSyllabus(admin)
  })

  async function seedSyllabus(courseId: string): Promise<{
    subjectId: string
    topicId: string
    otherTopicId: string
    subtopicId: string
  }> {
    const code = markerCode()
    const s = await admin
      .from('easa_subjects')
      .insert({
        code,
        name: `${code} subject`,
        short: 'RTS',
        sort_order: 9000,
        course_id: courseId,
      })
      .select('id')
      .single()
    if (s.error || !s.data) throw new Error(`seed subject: ${s.error?.message}`)
    const subjectId = s.data.id as string
    const t = await admin
      .from('easa_topics')
      .insert([
        { subject_id: subjectId, code: 'T1', name: 'T1 topic', sort_order: 0 },
        { subject_id: subjectId, code: 'T2', name: 'T2 topic', sort_order: 1 },
      ])
      .select('id, code')
    if (t.error || t.data?.length !== 2) throw new Error(`seed topics: ${t.error?.message}`)
    const topicId = t.data.find((r) => r.code === 'T1')?.id as string
    const otherTopicId = t.data.find((r) => r.code === 'T2')?.id as string
    const st = await admin
      .from('easa_subtopics')
      .insert({ topic_id: topicId, code: 'S1', name: 'S1 subtopic', sort_order: 0 })
      .select('id')
      .single()
    if (st.error || !st.data) throw new Error(`seed subtopic: ${st.error?.message}`)
    return { subjectId, topicId, otherTopicId, subtopicId: st.data.id as string }
  }

  function questionRow(subjectId: string, topicId: string, createdBy: string) {
    const label = `${E2E_REDTEAM_SYLLABUS_CODE_PREFIX}Q ${crypto.randomUUID()}`
    return {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: subjectId,
      topic_id: topicId,
      subtopic_id: null,
      created_by: createdBy,
      question_text: label,
      question_number: label,
      explanation_text: label,
      difficulty: 'easy',
      status: 'active',
      question_type: 'multiple_choice',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      correct_option_id: 'a',
    }
  }

  test('LX: student insert under a non-enrolled topic gets RLS 42501, not subtopic_required', async () => {
    const { subjectId, topicId } = await seedSyllabus(foreignCourseId)

    const visible = await attackerClient.from('easa_subtopics').select('id').eq('topic_id', topicId)
    expect(visible.error).toBeNull()
    expect(visible.data).toEqual([])

    const attack = await attackerClient
      .from('questions')
      .insert(questionRow(subjectId, topicId, attackerId))
    expect(attack.error?.code).toBe('42501')
    expect(attack.error?.message).toMatch(/row-level security/i)
    expect(attack.error?.message).not.toMatch(/subtopic_required/)

    const control = await adminClient
      .from('questions')
      .insert(questionRow(subjectId, topicId, adminUserId))
    expect(control.error?.code).toBe('P0001')
    expect(control.error?.message).toMatch(/subtopic_required/)

    const rows = await admin.from('questions').select('id').eq('subject_id', subjectId)
    expect(rows.error).toBeNull()
    expect(rows.data).toEqual([])
  })

  test('LY: admin cannot move a subtopic to another topic; rename still succeeds', async () => {
    const { otherTopicId, topicId, subtopicId } = await seedSyllabus(foreignCourseId)

    const attack = await adminClient
      .from('easa_subtopics')
      .update({ topic_id: otherTopicId })
      .eq('id', subtopicId)
      .select('id')
    expect(attack.error?.code).toBe('42501')
    expect(attack.error?.message).toMatch(/permission denied/i)

    const control = await adminClient
      .from('easa_subtopics')
      .update({ name: 'S1 renamed' })
      .eq('id', subtopicId)
      .select('id')
    expect(control.error).toBeNull()
    expect(control.data).toEqual([{ id: subtopicId }])

    const after = await admin
      .from('easa_subtopics')
      .select('topic_id, name')
      .eq('id', subtopicId)
      .single()
    expect(after.error).toBeNull()
    expect(after.data).toEqual({ topic_id: topicId, name: 'S1 renamed' })
  })
})
