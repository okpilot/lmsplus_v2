import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

/**
 * soft_delete_syllabus_item(p_table, p_id): admin-only SECURITY DEFINER soft delete of
 * easa_subjects / easa_topics / easa_subtopics, refused while the item is in use.
 */
type Table = 'easa_subjects' | 'easa_topics' | 'easa_subtopics'
type Tree = { subjectId: string; topicId: string; subtopicId: string }

describe('RPC: soft_delete_syllabus_item', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const userIds: string[] = []
  const subjectIds: string[] = []
  let orgId: string
  let adminId: string
  let studentId: string
  let adminClient: SupabaseClient
  let studentClient: SupabaseClient
  let deletedAdminClient: SupabaseClient
  let n = 0

  async function newTree(): Promise<Tree> {
    n += 1
    const tag = `SD${suffix}${n}`
    const { data: s, error: sErr } = await admin
      .from('easa_subjects')
      .insert({ code: tag, name: `SD subject ${tag}`, short: tag, sort_order: 900 + n })
      .select('id')
      .single()
    if (sErr || !s) throw new Error(`subject: ${sErr?.message}`)
    subjectIds.push(s.id as string)
    const { data: t, error: tErr } = await admin
      .from('easa_topics')
      .insert({ subject_id: s.id, code: `${tag}-T`, name: 'SD topic', sort_order: 1 })
      .select('id')
      .single()
    if (tErr || !t) throw new Error(`topic: ${tErr?.message}`)
    const { data: st, error: stErr } = await admin
      .from('easa_subtopics')
      .insert({ topic_id: t.id, code: `${tag}-ST`, name: 'SD subtopic', sort_order: 1 })
      .select('id')
      .single()
    if (stErr || !st) throw new Error(`subtopic: ${stErr?.message}`)
    return { subjectId: s.id as string, topicId: t.id as string, subtopicId: st.id as string }
  }

  /** Soft-delete (service role) the children so a parent has no live child. */
  async function stamp(table: Table, id: string) {
    const { error } = await admin
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    expect(error).toBeNull()
  }

  async function row(table: Table, id: string) {
    const { data, error } = await admin
      .from(table)
      .select('deleted_at, deleted_by, code, name')
      .eq('id', id)
      .single()
    expect(error).toBeNull()
    return data as {
      deleted_at: string | null
      deleted_by: string | null
      code: string
      name: string
    }
  }

  const del = (c: SupabaseClient, table: string, id: string) =>
    c.rpc('soft_delete_syllabus_item', { p_table: table, p_id: id })

  async function expectInUse(table: Table, id: string) {
    const { error } = await del(adminClient, table, id)
    expect(error?.message).toContain('in_use')
    expect((await row(table, id)).deleted_at).toBeNull()
  }

  async function newConfig(subjectId: string, parts: unknown = {}) {
    const { data, error } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 5,
        time_limit_seconds: 600,
        pass_mark: 75,
        parts_config: parts,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`config: ${error?.message}`)
    return data.id as string
  }

  async function newQuestion(tree: Tree, withSubtopic: boolean) {
    await seedQuestions({
      admin,
      orgId,
      createdBy: adminId,
      subjectId: tree.subjectId,
      topicId: tree.topicId,
      subtopicId: withSubtopic ? tree.subtopicId : null,
      count: 1,
    })
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `SD Org ${suffix}`, slug: `sd-syllabus-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `sd-admin-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `sd-student-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    const goneId = await createTestUser({
      admin,
      orgId,
      email: `sd-gone-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(goneId)
    adminClient = await getAuthenticatedClient({
      email: `sd-admin-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    studentClient = await getAuthenticatedClient({
      email: `sd-student-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    deletedAdminClient = await getAuthenticatedClient({
      email: `sd-gone-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    await admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', goneId)
  })

  afterAll(async () => {
    // Test teardown only: hard-delete fixtures (service role) in FK order.
    await admin
      .from('exam_config_distributions')
      .delete()
      .in(
        'exam_config_id',
        (
          (await admin.from('exam_configs').select('id').eq('organization_id', orgId)).data ?? []
        ).map((r) => r.id as string),
      )
    await admin.from('internal_exam_codes').delete().eq('organization_id', orgId)
    await admin.from('quiz_sessions').delete().eq('organization_id', orgId)
    await admin.from('exam_configs').delete().eq('organization_id', orgId)
    await admin.from('questions').delete().eq('organization_id', orgId)
    await admin.from('question_banks').delete().eq('organization_id', orgId)
    await cleanupTestData({ admin, orgId, userIds })
    const now = new Date().toISOString()
    const errors: string[] = []
    for (const id of subjectIds) {
      const { data: topics, error: lookupErr } = await admin
        .from('easa_topics')
        .select('id')
        .eq('subject_id', id)
      if (lookupErr) errors.push(`topic lookup: ${lookupErr.message}`)
      const { error: stErr } = await admin
        .from('easa_subtopics')
        .update({ deleted_at: now })
        .in(
          'topic_id',
          (topics ?? []).map((r) => r.id as string),
        )
        .is('deleted_at', null)
      if (stErr) errors.push(`subtopics: ${stErr.message}`)
      if (errors.length === 0) {
        const { error: tErr } = await admin
          .from('easa_topics')
          .update({ deleted_at: now })
          .eq('subject_id', id)
          .is('deleted_at', null)
        if (tErr) errors.push(`topics: ${tErr.message}`)
      }
      if (errors.length === 0) {
        const { error: sErr } = await admin
          .from('easa_subjects')
          .update({ deleted_at: now })
          .eq('id', id)
          .is('deleted_at', null)
        if (sErr) errors.push(`subjects: ${sErr.message}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  describe('success', () => {
    it.each([
      ['easa_subtopics', 'subtopicId'],
      ['easa_topics', 'topicId'],
      ['easa_subjects', 'subjectId'],
    ] as const)(
      'soft-deletes an unused %s, stamps deleted_at/deleted_by and writes one audit row',
      async (table, key) => {
        const tree = await newTree()
        // make the parents deletable: remove live children first
        if (table === 'easa_topics') await stamp('easa_subtopics', tree.subtopicId)
        if (table === 'easa_subjects') {
          await stamp('easa_subtopics', tree.subtopicId)
          await stamp('easa_topics', tree.topicId)
        }
        const id = tree[key]
        const before = await row(table, id)

        const { error } = await del(adminClient, table, id)
        expect(error).toBeNull()

        const after = await row(table, id)
        expect(after.deleted_at).not.toBeNull()
        expect(after.deleted_by).toBe(adminId)

        const { data: audit, error: aErr } = await admin
          .from('audit_events')
          .select(
            'event_type, resource_type, resource_id, actor_id, actor_role, organization_id, metadata',
          )
          .eq('resource_id', id)
        expect(aErr).toBeNull()
        expect(audit).toHaveLength(1)
        expect(audit?.[0]).toMatchObject({
          event_type: 'syllabus.item_deleted',
          resource_type: table,
          actor_id: adminId,
          actor_role: 'admin',
          organization_id: orgId,
          metadata: { code: before.code, name: before.name },
        })
      },
    )

    it('deleting a subtopic leaves its topic live', async () => {
      const tree = await newTree()
      expect((await del(adminClient, 'easa_subtopics', tree.subtopicId)).error).toBeNull()
      expect((await row('easa_topics', tree.topicId)).deleted_at).toBeNull()
    })
  })

  describe('in_use blockers (row left unchanged)', () => {
    it('refuses a subject with a live topic', async () => {
      const tree = await newTree()
      await expectInUse('easa_subjects', tree.subjectId)
    })

    it('refuses a topic with a live subtopic', async () => {
      const tree = await newTree()
      await expectInUse('easa_topics', tree.topicId)
    })

    it('refuses a subtopic with a live question', async () => {
      const tree = await newTree()
      await newQuestion(tree, true)
      await expectInUse('easa_subtopics', tree.subtopicId)
    })

    it('refuses a topic with a live question', async () => {
      const tree = await newTree()
      await stamp('easa_subtopics', tree.subtopicId)
      await newQuestion(tree, false)
      await expectInUse('easa_topics', tree.topicId)
    })

    it('refuses a subject with a live exam_config', async () => {
      const tree = await newTree()
      await stamp('easa_subtopics', tree.subtopicId)
      await stamp('easa_topics', tree.topicId)
      await newConfig(tree.subjectId)
      await expectInUse('easa_subjects', tree.subjectId)
    })

    it('refuses a topic referenced by a live exam_config distribution', async () => {
      const tree = await newTree()
      await stamp('easa_subtopics', tree.subtopicId)
      const configId = await newConfig(tree.subjectId)
      const { error } = await admin
        .from('exam_config_distributions')
        .insert({ exam_config_id: configId, topic_id: tree.topicId, question_count: 1 })
      expect(error).toBeNull()
      await expectInUse('easa_topics', tree.topicId)
    })

    it('refuses a topic named by a live exam_config parts_config topic_code', async () => {
      const tree = await newTree()
      await stamp('easa_subtopics', tree.subtopicId)
      const code = (await row('easa_topics', tree.topicId)).code
      await newConfig(tree.subjectId, { part1: { topic_code: code, count: 1 } })
      await expectInUse('easa_topics', tree.topicId)
    })

    it('refuses topic P1_ACRONYMS when a live config lacks part1.topic_code (defaults apply to any subject)', async () => {
      const tree = await newTree()
      await stamp('easa_subtopics', tree.subtopicId)
      const { error: codeErr } = await admin
        .from('easa_topics')
        .update({ code: 'P1_ACRONYMS' })
        .eq('id', tree.topicId)
      expect(codeErr).toBeNull()
      await newConfig(tree.subjectId, {})
      await expectInUse('easa_topics', tree.topicId)
    })

    it('refuses a topic with an open quiz session', async () => {
      const tree = await newTree()
      await stamp('easa_subtopics', tree.subtopicId)
      const { error } = await admin.from('quiz_sessions').insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        config: {},
        total_questions: 1,
        subject_id: tree.subjectId,
        topic_id: tree.topicId,
      })
      expect(error).toBeNull()
      await expectInUse('easa_topics', tree.topicId)
      await admin.from('quiz_sessions').delete().eq('topic_id', tree.topicId)
    })

    it('refuses a topic with a saved (resumable, deleted_at set) quiz session', async () => {
      const tree = await newTree()
      await stamp('easa_subtopics', tree.subtopicId)
      const now = new Date().toISOString()
      const { error } = await admin.from('quiz_sessions').insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        config: {},
        total_questions: 1,
        subject_id: tree.subjectId,
        topic_id: tree.topicId,
        deleted_at: now,
        saved_at: now,
      })
      expect(error).toBeNull()
      await expectInUse('easa_topics', tree.topicId)
    })

    it('refuses a subject with an active internal exam code', async () => {
      const tree = await newTree()
      await stamp('easa_subtopics', tree.subtopicId)
      await stamp('easa_topics', tree.topicId)
      const { error } = await admin.from('internal_exam_codes').insert({
        code: `SD${suffix}${n}`.slice(0, 12),
        subject_id: tree.subjectId,
        student_id: studentId,
        issued_by: adminId,
        organization_id: orgId,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      expect(error).toBeNull()
      await expectInUse('easa_subjects', tree.subjectId)
    })
  })

  describe('rejections', () => {
    it('raises not_found for a missing id', async () => {
      const { error } = await del(
        adminClient,
        'easa_topics',
        '00000000-0000-4000-a000-0000000000ff',
      )
      expect(error?.message).toContain('not_found')
    })

    it('raises not_found for an already-deleted item and writes no second audit row', async () => {
      const tree = await newTree()
      expect((await del(adminClient, 'easa_subtopics', tree.subtopicId)).error).toBeNull()
      const { error } = await del(adminClient, 'easa_subtopics', tree.subtopicId)
      expect(error?.message).toContain('not_found')
      const { data } = await admin
        .from('audit_events')
        .select('id')
        .eq('resource_id', tree.subtopicId)
      expect(data).toHaveLength(1)
    })

    it('raises invalid_table for a table outside the syllabus', async () => {
      const tree = await newTree()
      const { error } = await del(adminClient, 'questions', tree.subtopicId)
      expect(error?.message).toContain('invalid_table')
    })

    it('denies a student (not_admin) and leaves the row unchanged', async () => {
      const tree = await newTree()
      const { error } = await del(studentClient, 'easa_subtopics', tree.subtopicId)
      expect(error?.message).toContain('not_admin')
      expect((await row('easa_subtopics', tree.subtopicId)).deleted_at).toBeNull()
    })

    it('denies a soft-deleted admin (admin_not_found)', async () => {
      const tree = await newTree()
      const { error } = await del(deletedAdminClient, 'easa_subtopics', tree.subtopicId)
      expect(error?.message).toContain('admin_not_found')
      expect((await row('easa_subtopics', tree.subtopicId)).deleted_at).toBeNull()
    })

    it('denies anon at the privilege layer (42501)', async () => {
      const tree = await newTree()
      const { error } = await del(getAnonClient(), 'easa_subtopics', tree.subtopicId)
      expect(error?.code).toBe('42501')
      expect((await row('easa_subtopics', tree.subtopicId)).deleted_at).toBeNull()
    })
  })
})
