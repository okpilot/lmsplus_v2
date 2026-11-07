/**
 * Red Team Spec — syllabus soft delete (migs 20261107000100 / 000200 / 000300).
 *
 *  - LC: non-admin calls soft_delete_syllabus_item → not_admin; non-allowlisted p_table → invalid_table.
 *  - LD: admin bypasses the RPC — hard DELETE, or a direct deleted_at / deleted_by write → 42501.
 *  - LE: admin writes against a soft-deleted row — child under a deleted parent, move under a
 *        deleted parent, rename a deleted row → parent_not_found / item_deleted.
 *  - LF: exam_configs / exam_config_distributions pointing at a deleted subject / topic → parent_not_found.
 *
 * Every arm carries a control proving the same write succeeds against a live row.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { expectLiveStudent } from './helpers/attacker-pin'
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
type Table = 'easa_subjects' | 'easa_topics' | 'easa_subtopics'

const MARKER_LIKE = `${E2E_REDTEAM_SYLLABUS_CODE_PREFIX}%`

function markerCode(): string {
  return `${E2E_REDTEAM_SYLLABUS_CODE_PREFIX}${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

test.describe('Red Team: syllabus soft delete', () => {
  let admin: ReturnType<typeof getAdminClient>
  let adminClient: Client
  let studentClient: Client
  let orgId: string
  let testStart: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    orgId = (await seedRedTeamAdmin()).orgId
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    // not_admin must be role-gated, not tripped by a soft-deleted attacker (#1252).
    await expectLiveStudent(admin, ATTACKER_EMAIL)
  })

  test.beforeEach(() => {
    testStart = new Date().toISOString()
  })

  test.afterEach(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    let subjectIds: string[] = []
    let topicIds: string[] = []
    try {
      const { data, error } = await admin
        .from('easa_subjects')
        .select('id')
        .like('code', MARKER_LIKE)
      if (error) throw new Error(`marker subjects lookup: ${error.message}`)
      subjectIds = (data ?? []).map((r) => r.id as string)
      if (subjectIds.length > 0) {
        const t = await admin.from('easa_topics').select('id').in('subject_id', subjectIds)
        if (t.error) throw new Error(`marker topics lookup: ${t.error.message}`)
        topicIds = (t.data ?? []).map((r) => r.id as string)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
    if (subjectIds.length === 0) return

    const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
      [
        'exam_configs',
        () =>
          admin
            .from('exam_configs')
            .update({ deleted_at: now })
            .in('subject_id', subjectIds)
            .is('deleted_at', null)
            .select('id'),
      ],
      [
        'easa_subtopics',
        () =>
          admin
            .from('easa_subtopics')
            .update({ deleted_at: now })
            .in(
              'topic_id',
              topicIds.length > 0 ? topicIds : ['00000000-0000-0000-0000-000000000000'],
            )
            .is('deleted_at', null)
            .select('id'),
      ],
      [
        'easa_topics',
        () =>
          admin
            .from('easa_topics')
            .update({ deleted_at: now })
            .in('subject_id', subjectIds)
            .is('deleted_at', null)
            .select('id'),
      ],
      [
        'easa_subjects',
        () =>
          admin
            .from('easa_subjects')
            .update({ deleted_at: now })
            .in('id', subjectIds)
            .is('deleted_at', null)
            .select('id'),
      ],
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

  async function readRow(
    table: Table,
    id: string,
  ): Promise<{ name: string; deleted_at: string | null; deleted_by: string | null }> {
    const { data, error } = await admin
      .from(table)
      .select('name, deleted_at, deleted_by')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`read ${table}: ${error?.message ?? 'no row'}`)
    return data as { name: string; deleted_at: string | null; deleted_by: string | null }
  }

  async function deleteAuditCount(id: string): Promise<number> {
    const { data, error } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'syllabus.item_deleted')
      .eq('resource_id', id)
      .gte('created_at', testStart)
    if (error) throw new Error(`audit lookup: ${error.message}`)
    return data?.length ?? 0
  }

  async function softDeleteAsAdmin(table: Table, id: string): Promise<void> {
    const { error } = await adminClient.rpc('soft_delete_syllabus_item', {
      p_table: table,
      p_id: id,
    })
    if (error) throw new Error(`admin soft delete ${table}: ${error.message}`)
  }

  test('LC: a student cannot soft-delete a syllabus item; an admin can', async () => {
    const subjectId = await seedSubject()
    const topicId = await seedTopic(subjectId)
    const before = await readRow('easa_topics', topicId)
    expect(before.deleted_at).toBeNull()

    const { error } = await studentClient.rpc('soft_delete_syllabus_item', {
      p_table: 'easa_topics',
      p_id: topicId,
    })
    expect(error?.message).toMatch(/not_admin/)
    expect(await readRow('easa_topics', topicId)).toEqual(before)
    expect(await deleteAuditCount(topicId)).toBe(0)

    // Control: the same call as admin deletes the row and writes the audit event.
    await softDeleteAsAdmin('easa_topics', topicId)
    const after = await readRow('easa_topics', topicId)
    expect(after.deleted_at).toEqual(expect.any(String))
    expect(await deleteAuditCount(topicId)).toBe(1)
  })

  test('LC: an admin cannot point soft_delete_syllabus_item at a non-syllabus table', async () => {
    const { data: self, error: selfErr } = await admin
      .from('users')
      .select('id, deleted_at')
      .eq('email', ATTACKER_EMAIL)
      .single()
    if (selfErr || !self) throw new Error(`attacker row: ${selfErr?.message ?? 'no row'}`)
    expect(self.deleted_at).toBeNull()

    for (const p_table of ['users', 'questions', 'easa_subjects; --']) {
      const { error } = await adminClient.rpc('soft_delete_syllabus_item', {
        p_table,
        p_id: self.id,
      })
      expect(error?.message).toMatch(/invalid_table/)
    }
    const { data: still } = await admin
      .from('users')
      .select('deleted_at')
      .eq('id', self.id)
      .single()
    expect(still?.deleted_at).toBeNull()
  })

  test('LD: an admin cannot hard-delete a syllabus row', async () => {
    const subjectId = await seedSubject()
    const topicId = await seedTopic(subjectId)
    const subtopicId = await seedSubtopic(topicId)
    const targets: Array<[Table, string]> = [
      ['easa_subtopics', subtopicId],
      ['easa_topics', topicId],
      ['easa_subjects', subjectId],
    ]
    for (const [table, id] of targets) {
      const { error } = await adminClient.from(table).delete().eq('id', id)
      expect(error?.code, table).toBe('42501')
      expect((await readRow(table, id)).deleted_at, table).toBeNull()
    }
  })

  test('LD: an admin cannot write deleted_at / deleted_by directly', async () => {
    const subjectId = await seedSubject()
    const topicId = await seedTopic(subjectId)
    const subtopicId = await seedSubtopic(topicId)
    const { data: me } = await admin.from('users').select('id').eq('email', ADMIN_EMAIL).single()
    const targets: Array<[Table, string]> = [
      ['easa_subtopics', subtopicId],
      ['easa_topics', topicId],
      ['easa_subjects', subjectId],
    ]

    // Stamp a live row (skips the in-use check and the audit row).
    for (const [table, id] of targets) {
      for (const patch of [{ deleted_at: new Date().toISOString() }, { deleted_by: me?.id }]) {
        const { error } = await adminClient.from(table).update(patch).eq('id', id)
        expect(error?.code, `${table} ${Object.keys(patch)[0]}`).toBe('42501')
      }
      const row = await readRow(table, id)
      expect(row.deleted_at, table).toBeNull()
      expect(row.deleted_by, table).toBeNull()
    }

    // Restore a deleted row.
    await softDeleteAsAdmin('easa_subtopics', subtopicId)
    const deleted = await readRow('easa_subtopics', subtopicId)
    expect(deleted.deleted_at).toEqual(expect.any(String))
    const { error: restoreErr } = await adminClient
      .from('easa_subtopics')
      .update({ deleted_at: null })
      .eq('id', subtopicId)
    expect(restoreErr?.code).toBe('42501')
    expect(await readRow('easa_subtopics', subtopicId)).toEqual(deleted)

    // Control: a granted column on a live row is writable.
    const { data: renamed, error: renameErr } = await adminClient
      .from('easa_topics')
      .update({ name: 'renamed live topic' })
      .eq('id', topicId)
      .select('id')
    expect(renameErr).toBeNull()
    expect(renamed).toHaveLength(1)
  })

  test('LE: an admin cannot write against a soft-deleted syllabus row', async () => {
    const liveSubjectId = await seedSubject()
    const deadSubjectId = await seedSubject()
    const liveTopicId = await seedTopic(liveSubjectId, 'LIVE')
    const deadTopicId = await seedTopic(liveSubjectId, 'DEAD')
    await softDeleteAsAdmin('easa_topics', deadTopicId)
    await softDeleteAsAdmin('easa_subjects', deadSubjectId)
    expect((await readRow('easa_subjects', deadSubjectId)).deleted_at).toEqual(expect.any(String))
    expect((await readRow('easa_topics', deadTopicId)).deleted_at).toEqual(expect.any(String))

    // Child under a deleted parent.
    const topicIns = await adminClient
      .from('easa_topics')
      .insert({ subject_id: deadSubjectId, code: 'X1', name: 'orphan', sort_order: 0 })
    expect(topicIns.error?.message).toMatch(/parent_not_found/)
    const subIns = await adminClient
      .from('easa_subtopics')
      .insert({ topic_id: deadTopicId, code: 'X1', name: 'orphan', sort_order: 0 })
    expect(subIns.error?.message).toMatch(/parent_not_found/)

    // Move a live topic under a deleted subject.
    const move = await adminClient
      .from('easa_topics')
      .update({ subject_id: deadSubjectId })
      .eq('id', liveTopicId)
    expect(move.error?.message).toMatch(/parent_not_found/)
    const { data: liveAfter } = await admin
      .from('easa_topics')
      .select('subject_id')
      .eq('id', liveTopicId)
      .single()
    expect(liveAfter?.subject_id).toBe(liveSubjectId)

    // Rename a deleted row.
    const deadBefore = await readRow('easa_topics', deadTopicId)
    const rename = await adminClient
      .from('easa_topics')
      .update({ name: 'resurrected' })
      .eq('id', deadTopicId)
    expect(rename.error?.message).toMatch(/item_deleted/)
    expect(await readRow('easa_topics', deadTopicId)).toEqual(deadBefore)

    const { count } = await admin
      .from('easa_topics')
      .select('id', { count: 'exact', head: true })
      .eq('subject_id', deadSubjectId)
    expect(count).toBe(0)

    // Control: the same child insert under a live parent succeeds.
    const ok = await adminClient
      .from('easa_subtopics')
      .insert({ topic_id: liveTopicId, code: 'X1', name: 'live child', sort_order: 0 })
      .select('id')
    expect(ok.error).toBeNull()
    expect(ok.data).toHaveLength(1)
  })

  test('LF: an exam config cannot reference a soft-deleted subject or topic', async () => {
    const liveSubjectId = await seedSubject()
    const deadSubjectId = await seedSubject()
    const liveTopicId = await seedTopic(liveSubjectId, 'LIVE')
    const deadTopicId = await seedTopic(liveSubjectId, 'DEAD')
    await softDeleteAsAdmin('easa_topics', deadTopicId)
    await softDeleteAsAdmin('easa_subjects', deadSubjectId)

    const configRow = (subject_id: string) => ({
      organization_id: orgId,
      subject_id,
      enabled: false,
      total_questions: 1,
      time_limit_seconds: 600,
      pass_mark: 75,
    })

    const deadCfg = await adminClient.from('exam_configs').insert(configRow(deadSubjectId))
    expect(deadCfg.error?.message).toMatch(/parent_not_found/)
    const { count: deadCfgCount } = await admin
      .from('exam_configs')
      .select('id', { count: 'exact', head: true })
      .eq('subject_id', deadSubjectId)
    expect(deadCfgCount).toBe(0)

    // Control: a config on a live subject is accepted.
    const liveCfg = await adminClient
      .from('exam_configs')
      .insert(configRow(liveSubjectId))
      .select('id')
      .single()
    expect(liveCfg.error).toBeNull()
    const configId = liveCfg.data?.id as string

    const deadDist = await adminClient
      .from('exam_config_distributions')
      .insert({ exam_config_id: configId, topic_id: deadTopicId, question_count: 1 })
    expect(deadDist.error?.message).toMatch(/parent_not_found/)

    // Control: a distribution on a live topic is accepted.
    const liveDist = await adminClient
      .from('exam_config_distributions')
      .insert({ exam_config_id: configId, topic_id: liveTopicId, question_count: 1 })
      .select('topic_id')
    expect(liveDist.error).toBeNull()
    const { data: dists } = await admin
      .from('exam_config_distributions')
      .select('topic_id')
      .eq('exam_config_id', configId)
    expect((dists ?? []).map((d) => d.topic_id)).toEqual([liveTopicId])
  })
})
