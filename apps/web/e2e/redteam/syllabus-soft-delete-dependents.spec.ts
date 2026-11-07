/**
 * Red Team Spec — syllabus soft delete vs. dependent rows (migs 20261107000100 / 000200).
 *
 *  - LG: a cross-org admin deletes a topic referenced only by another org's live question → in_use.
 *  - LH: an admin moves a question under a deleted subtopic → parent_not_found; a deleted
 *        question under a deleted topic is restored (admin: RLS 0 rows; service role: parent_not_found).
 *  - LI: issue_internal_exam_code on a soft-deleted subject → subject_not_found.
 *  - LJ: concurrent topic delete and question insert → exactly one wins, never both.
 *
 * Every arm carries a control proving the same write succeeds when the parent is live / unused.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SYLLABUS_CODE_PREFIX } from './helpers/seed-markers'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>
type Admin = ReturnType<typeof getAdminClient>

const MARKER_LIKE = `${E2E_REDTEAM_SYLLABUS_CODE_PREFIX}%`
const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const RACE_ROUNDS = 8

function markerCode(): string {
  return `${E2E_REDTEAM_SYLLABUS_CODE_PREFIX}${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

async function markerIds(admin: Admin): Promise<{ subjectIds: string[]; topicIds: string[] }> {
  const { data, error } = await admin.from('easa_subjects').select('id').like('code', MARKER_LIKE)
  if (error) throw new Error(`marker subjects lookup: ${error.message}`)
  const subjectIds = (data ?? []).map((r) => r.id as string)
  if (subjectIds.length === 0) return { subjectIds, topicIds: [] }
  const t = await admin.from('easa_topics').select('id').in('subject_id', subjectIds)
  if (t.error) throw new Error(`marker topics lookup: ${t.error.message}`)
  return { subjectIds, topicIds: (t.data ?? []).map((r) => r.id as string) }
}

async function cleanupMarkerSyllabus(admin: Admin): Promise<void> {
  const errors: string[] = []
  let ids: { subjectIds: string[]; topicIds: string[] } = { subjectIds: [], topicIds: [] }
  try {
    ids = await markerIds(admin)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  const { subjectIds, topicIds } = ids
  if (subjectIds.length === 0) return
  const now = new Date().toISOString()
  const live = (table: string, col: string, values: string[]) =>
    admin
      .from(table)
      .update({ deleted_at: now })
      .in(col, values.length > 0 ? values : [NIL_UUID])
      .is('deleted_at', null)
      .select('id')
  const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
    ['questions', () => live('questions', 'subject_id', subjectIds)],
    ['internal_exam_codes', () => live('internal_exam_codes', 'subject_id', subjectIds)],
    ['exam_configs', () => live('exam_configs', 'subject_id', subjectIds)],
    ['easa_subtopics', () => live('easa_subtopics', 'topic_id', topicIds)],
    ['easa_topics', () => live('easa_topics', 'subject_id', subjectIds)],
    ['easa_subjects', () => live('easa_subjects', 'id', subjectIds)],
  ]
  for (const [label, run] of steps) {
    try {
      const { error } = await run()
      if (error) throw new Error(`${label} soft-delete: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
}

test.describe('Red Team: syllabus soft delete vs dependent rows', () => {
  test.setTimeout(120_000)

  let admin: Admin
  let adminClient: Client
  let crossOrgAdminClient: Client
  let orgId: string
  let adminUserId: string
  let crossOrgId: string
  let studentId: string
  let bankId: string
  let testStart: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    studentId = (await seedRedTeamUsers()).attackerUserId
    const own = await seedRedTeamAdmin()
    orgId = own.orgId
    adminUserId = own.adminUserId
    const cross = await seedCrossOrgAdmin()
    crossOrgId = cross.orgId
    expect(crossOrgId).not.toBe(orgId)
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossOrgAdminClient = await createAuthenticatedClient(cross.email, cross.password)
    const { data: bank, error } = await admin
      .from('question_banks')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .limit(1)
      .single()
    if (error || !bank) throw new Error(`question bank: ${error?.message ?? 'no row'}`)
    bankId = bank.id as string
  })

  test.beforeEach(() => {
    testStart = new Date().toISOString()
  })

  test.afterEach(async () => {
    await cleanupMarkerSyllabus(admin)
  })

  async function seedSubject(): Promise<string> {
    const code = markerCode()
    const { data, error } = await admin
      .from('easa_subjects')
      .insert({ code, name: `${code} subject`, short: 'RTS', sort_order: 9000 })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed subject: ${error?.message ?? 'no row'}`)
    return data.id as string
  }

  async function seedTopic(subjectId: string, code = 'T1'): Promise<string> {
    const { data, error } = await admin
      .from('easa_topics')
      .insert({ subject_id: subjectId, code, name: `${code} topic`, sort_order: 0 })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed topic: ${error?.message ?? 'no row'}`)
    return data.id as string
  }

  async function seedSubtopic(topicId: string, code = 'S1'): Promise<string> {
    const { data, error } = await admin
      .from('easa_subtopics')
      .insert({ topic_id: topicId, code, name: `${code} subtopic`, sort_order: 0 })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed subtopic: ${error?.message ?? 'no row'}`)
    return data.id as string
  }

  function questionRow(subjectId: string, topicId: string) {
    const label = `${E2E_REDTEAM_SYLLABUS_CODE_PREFIX}Q ${crypto.randomUUID()}`
    return {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: subjectId,
      topic_id: topicId,
      created_by: adminUserId,
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

  async function seedQuestion(subjectId: string, topicId: string): Promise<string> {
    const { data, error } = await admin
      .from('questions')
      .insert(questionRow(subjectId, topicId))
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed question: ${error?.message ?? 'no row'}`)
    return data.id as string
  }

  async function softDeleteQuestion(id: string): Promise<void> {
    const { data, error } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
    if (error || data?.length !== 1) throw new Error(`soft-delete question: ${error?.message}`)
  }

  async function readQuestion(
    id: string,
  ): Promise<{ topic_id: string; subtopic_id: string | null; deleted_at: string | null }> {
    const { data, error } = await admin
      .from('questions')
      .select('topic_id, subtopic_id, deleted_at')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`read question: ${error?.message ?? 'no row'}`)
    return data as { topic_id: string; subtopic_id: string | null; deleted_at: string | null }
  }

  async function topicDeletedAt(id: string): Promise<string | null> {
    const { data, error } = await admin
      .from('easa_topics')
      .select('deleted_at')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`read topic: ${error?.message ?? 'no row'}`)
    return data.deleted_at as string | null
  }

  async function deleteAudits(id: string): Promise<Array<{ organization_id: string }>> {
    const { data, error } = await admin
      .from('audit_events')
      .select('organization_id')
      .eq('event_type', 'syllabus.item_deleted')
      .eq('resource_id', id)
      .gte('created_at', testStart)
    if (error) throw new Error(`audit lookup: ${error.message}`)
    return (data ?? []) as Array<{ organization_id: string }>
  }

  async function softDelete(client: Client, p_table: string, p_id: string) {
    return client.rpc('soft_delete_syllabus_item', { p_table, p_id })
  }

  test('LG: a cross-org admin cannot delete a topic another org still uses', async () => {
    const subjectId = await seedSubject()
    const topicId = await seedTopic(subjectId)
    const questionId = await seedQuestion(subjectId, topicId)
    expect((await readQuestion(questionId)).deleted_at).toBeNull()

    const { error } = await softDelete(crossOrgAdminClient, 'easa_topics', topicId)
    expect(error?.message).toMatch(/^in_use: topic T1 /)
    expect(await topicDeletedAt(topicId)).toBeNull()
    expect(await deleteAudits(topicId)).toHaveLength(0)

    // Control: once the other org's question is gone, the same call deletes the topic.
    await softDeleteQuestion(questionId)
    const ok = await softDelete(crossOrgAdminClient, 'easa_topics', topicId)
    expect(ok.error).toBeNull()
    expect(await topicDeletedAt(topicId)).toEqual(expect.any(String))
    expect(await deleteAudits(topicId)).toEqual([{ organization_id: crossOrgId }])
  })

  test('LH: an admin cannot restore or move a question under a deleted syllabus row', async () => {
    const subjectId = await seedSubject()
    const liveTopicId = await seedTopic(subjectId, 'LIVE')
    const deadTopicId = await seedTopic(subjectId, 'DEAD')
    const liveSubId = await seedSubtopic(liveTopicId, 'LS')
    const deadSubId = await seedSubtopic(liveTopicId, 'DS')

    const orphanId = await seedQuestion(subjectId, deadTopicId)
    await softDeleteQuestion(orphanId)
    const s = await softDelete(adminClient, 'easa_topics', deadTopicId)
    expect(s.error).toBeNull()
    const d = await softDelete(adminClient, 'easa_subtopics', deadSubId)
    expect(d.error).toBeNull()
    expect(await topicDeletedAt(deadTopicId)).toEqual(expect.any(String))

    // Restore under a deleted topic: RLS hides a deleted question from the admin (0 rows); the
    // service-role path (import scripts) hits the live-parent trigger.
    const orphanBefore = await readQuestion(orphanId)
    expect(orphanBefore.deleted_at).toEqual(expect.any(String))
    const adminRestore = await adminClient
      .from('questions')
      .update({ deleted_at: null })
      .eq('id', orphanId)
      .select('id')
    expect(adminRestore.error).toBeNull()
    expect(adminRestore.data).toHaveLength(0)
    const restore = await admin.from('questions').update({ deleted_at: null }).eq('id', orphanId)
    expect(restore.error?.message).toMatch(/parent_not_found/)
    expect(await readQuestion(orphanId)).toEqual(orphanBefore)

    // Move a live question under a deleted subtopic.
    const liveQId = await seedQuestion(subjectId, liveTopicId)
    const move = await adminClient
      .from('questions')
      .update({ subtopic_id: deadSubId })
      .eq('id', liveQId)
    expect(move.error?.message).toMatch(/parent_not_found/)
    expect((await readQuestion(liveQId)).subtopic_id).toBeNull()

    // Controls: the same move to a live subtopic, and the same restore on a live topic, succeed.
    const okMove = await adminClient
      .from('questions')
      .update({ subtopic_id: liveSubId })
      .eq('id', liveQId)
      .select('id')
    expect(okMove.error).toBeNull()
    expect(okMove.data).toHaveLength(1)
    expect((await readQuestion(liveQId)).subtopic_id).toBe(liveSubId)

    const liveOrphanId = await seedQuestion(subjectId, liveTopicId)
    await softDeleteQuestion(liveOrphanId)
    const okRestore = await admin
      .from('questions')
      .update({ deleted_at: null })
      .eq('id', liveOrphanId)
      .select('id')
    expect(okRestore.error).toBeNull()
    expect(okRestore.data).toHaveLength(1)
    expect((await readQuestion(liveOrphanId)).deleted_at).toBeNull()
  })

  test('LI: an admin cannot issue an internal exam code for a deleted subject', async () => {
    const deadSubjectId = await seedSubject()
    const liveSubjectId = await seedSubject()
    const del = await softDelete(adminClient, 'easa_subjects', deadSubjectId)
    expect(del.error).toBeNull()

    const dead = await adminClient.rpc('issue_internal_exam_code', {
      p_subject_id: deadSubjectId,
      p_student_id: studentId,
    })
    expect(dead.error?.message).toMatch(/subject_not_found/)

    // Control: the live subject passes the subject check and stops at the next guard.
    const live = await adminClient.rpc('issue_internal_exam_code', {
      p_subject_id: liveSubjectId,
      p_student_id: studentId,
    })
    expect(live.error?.message).toMatch(/exam_config_required/)

    const { count, error } = await admin
      .from('internal_exam_codes')
      .select('id', { count: 'exact', head: true })
      .in('subject_id', [deadSubjectId, liveSubjectId])
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  test('LJ: a topic delete racing a question insert never leaves a live question on a deleted topic', async () => {
    const subjectId = await seedSubject()
    const outcomes = { deleteWon: 0, insertWon: 0 }
    for (let i = 0; i < RACE_ROUNDS; i++) {
      const topicId = await seedTopic(subjectId, `R${i}`)
      const [del, ins] = await Promise.all([
        softDelete(adminClient, 'easa_topics', topicId),
        admin.from('questions').insert(questionRow(subjectId, topicId)).select('id'),
      ])
      const deleted = (await topicDeletedAt(topicId)) !== null
      const { count, error } = await admin
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .is('deleted_at', null)
      expect(error).toBeNull()
      if (deleted) {
        expect(del.error, `round ${i}`).toBeNull()
        expect(ins.error?.message, `round ${i}`).toMatch(/parent_not_found/)
        expect(count, `round ${i}`).toBe(0)
        outcomes.deleteWon++
      } else {
        expect(ins.error, `round ${i}`).toBeNull()
        expect(del.error?.message, `round ${i}`).toMatch(/^in_use: /)
        expect(count, `round ${i}`).toBe(1)
        outcomes.insertWon++
      }
    }
    expect(outcomes.deleteWon + outcomes.insertWon).toBe(RACE_ROUNDS)
  })
})
