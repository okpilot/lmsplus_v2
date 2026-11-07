import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * Triggers on easa_topics / easa_subtopics (live parent) and on all three syllabus tables
 * (deleted rows frozen), exercised with an authenticated admin, not the service role.
 */
type Table = 'easa_subjects' | 'easa_topics' | 'easa_subtopics'
type Tree = { subjectId: string; topicId: string; subtopicId: string }

describe('Triggers: syllabus live parent and deleted-row freeze', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const userIds: string[] = []
  const subjectIds: string[] = []
  let orgId: string
  let adminClient: SupabaseClient
  let n = 0

  async function newTree(): Promise<Tree> {
    n += 1
    const tag = `LP${suffix}${n}`
    const { data: s, error: sErr } = await admin
      .from('easa_subjects')
      .insert({ code: tag, name: `LP subject ${tag}`, short: tag, sort_order: 800 + n })
      .select('id')
      .single()
    if (sErr || !s) throw new Error(`subject: ${sErr?.message}`)
    subjectIds.push(s.id as string)
    const { data: t, error: tErr } = await admin
      .from('easa_topics')
      .insert({ subject_id: s.id, code: `${tag}-T`, name: 'LP topic', sort_order: 1 })
      .select('id')
      .single()
    if (tErr || !t) throw new Error(`topic: ${tErr?.message}`)
    const { data: st, error: stErr } = await admin
      .from('easa_subtopics')
      .insert({ topic_id: t.id, code: `${tag}-ST`, name: 'LP subtopic', sort_order: 1 })
      .select('id')
      .single()
    if (stErr || !st) throw new Error(`subtopic: ${stErr?.message}`)
    return { subjectId: s.id as string, topicId: t.id as string, subtopicId: st.id as string }
  }

  async function stamp(table: Table, id: string) {
    const { error } = await admin
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    expect(error).toBeNull()
  }

  async function row(table: Table, id: string) {
    const { data, error } = await admin.from(table).select('*').eq('id', id).single()
    expect(error).toBeNull()
    return data as Record<string, unknown>
  }

  async function deadTree(): Promise<Tree> {
    const tree = await newTree()
    await stamp('easa_subtopics', tree.subtopicId)
    await stamp('easa_topics', tree.topicId)
    await stamp('easa_subjects', tree.subjectId)
    return tree
  }

  async function seedOne(tree: Tree, withSubtopic: boolean): Promise<string> {
    const { questionIds } = await seedQuestions({
      admin,
      orgId,
      createdBy: userIds[0] as string,
      subjectId: tree.subjectId,
      topicId: tree.topicId,
      subtopicId: withSubtopic ? tree.subtopicId : null,
      count: 1,
    })
    return questionIds[0] as string
  }

  async function newConfig(subjectId: string) {
    return admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 5,
        time_limit_seconds: 600,
        pass_mark: 75,
        parts_config: {},
      })
      .select('id')
      .single()
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `LP Org ${suffix}`, slug: `lp-syllabus-${suffix}` })
    const adminId = await createTestUser({
      admin,
      orgId,
      email: `lp-admin-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminId)
    adminClient = await getAuthenticatedClient({
      email: `lp-admin-${suffix}@test.local`,
      password: 'test-pass-123',
    })
  })

  afterAll(async () => {
    const configs = (await admin.from('exam_configs').select('id').eq('organization_id', orgId))
      .data
    await admin
      .from('exam_config_distributions')
      .delete()
      .in(
        'exam_config_id',
        (configs ?? []).map((r) => r.id as string),
      )
    await admin.from('questions').delete().eq('organization_id', orgId)
    await admin.from('exam_configs').delete().eq('organization_id', orgId)
    await cleanupTestData({ admin, orgId, userIds })
    for (const id of subjectIds) {
      const topics = (await admin.from('easa_topics').select('id').eq('subject_id', id)).data ?? []
      await admin
        .from('easa_subtopics')
        .delete()
        .in(
          'topic_id',
          topics.map((r) => r.id as string),
        )
      await admin.from('easa_topics').delete().eq('subject_id', id)
      await admin.from('easa_subjects').delete().eq('id', id)
    }
  })

  it('rejects a topic insert under a soft-deleted subject', async () => {
    const tree = await newTree()
    await stamp('easa_subtopics', tree.subtopicId)
    await stamp('easa_topics', tree.topicId)
    await stamp('easa_subjects', tree.subjectId)
    const { error } = await adminClient.from('easa_topics').insert({
      subject_id: tree.subjectId,
      code: `${tree.subjectId.slice(0, 6)}-X`,
      name: 'x',
      sort_order: 2,
    })
    expect(error?.message).toContain('parent_not_found')
    const { data } = await admin.from('easa_topics').select('id').eq('subject_id', tree.subjectId)
    expect(data).toHaveLength(1)
  })

  it('rejects re-parenting a live topic under a soft-deleted subject', async () => {
    const live = await newTree()
    const dead = await newTree()
    await stamp('easa_subtopics', dead.subtopicId)
    await stamp('easa_topics', dead.topicId)
    await stamp('easa_subjects', dead.subjectId)
    const { error } = await adminClient
      .from('easa_topics')
      .update({ subject_id: dead.subjectId })
      .eq('id', live.topicId)
    expect(error?.message).toContain('parent_not_found')
    expect((await row('easa_topics', live.topicId)).subject_id).toBe(live.subjectId)
  })

  it('rejects a subtopic insert under a soft-deleted topic', async () => {
    const tree = await newTree()
    await stamp('easa_subtopics', tree.subtopicId)
    await stamp('easa_topics', tree.topicId)
    const { error } = await adminClient.from('easa_subtopics').insert({
      topic_id: tree.topicId,
      code: `${tree.subjectId.slice(0, 6)}-Y`,
      name: 'y',
      sort_order: 2,
    })
    expect(error?.message).toContain('parent_not_found')
    const { data } = await admin.from('easa_subtopics').select('id').eq('topic_id', tree.topicId)
    expect(data).toHaveLength(1)
  })

  it('rejects re-parenting a live subtopic under a soft-deleted topic', async () => {
    const live = await newTree()
    const dead = await newTree()
    await stamp('easa_subtopics', dead.subtopicId)
    await stamp('easa_topics', dead.topicId)
    const { error } = await adminClient
      .from('easa_subtopics')
      .update({ topic_id: dead.topicId })
      .eq('id', live.subtopicId)
    expect(error?.message).toContain('parent_not_found')
    expect((await row('easa_subtopics', live.subtopicId)).topic_id).toBe(live.topicId)
  })

  it('rejects renaming a soft-deleted topic', async () => {
    const tree = await newTree()
    await stamp('easa_subtopics', tree.subtopicId)
    await stamp('easa_topics', tree.topicId)
    const { error } = await adminClient
      .from('easa_topics')
      .update({ name: 'renamed' })
      .eq('id', tree.topicId)
    expect(error?.message).toContain('item_deleted')
    expect((await row('easa_topics', tree.topicId)).name).toBe('LP topic')
  })

  it('rejects renaming a soft-deleted subject and subtopic', async () => {
    const tree = await newTree()
    await stamp('easa_subtopics', tree.subtopicId)
    await stamp('easa_topics', tree.topicId)
    await stamp('easa_subjects', tree.subjectId)
    const subject = await adminClient
      .from('easa_subjects')
      .update({ name: 'renamed' })
      .eq('id', tree.subjectId)
    expect(subject.error?.message).toContain('item_deleted')
    const sub = await adminClient
      .from('easa_subtopics')
      .update({ name: 'renamed' })
      .eq('id', tree.subtopicId)
    expect(sub.error?.message).toContain('item_deleted')
    expect((await row('easa_subjects', tree.subjectId)).name).toBe(`LP subject LP${suffix}${n}`)
    expect((await row('easa_subtopics', tree.subtopicId)).name).toBe('LP subtopic')
  })

  it('lets the service role clear deleted_by on a deleted row', async () => {
    const tree = await newTree()
    await stamp('easa_subtopics', tree.subtopicId)
    await stamp('easa_topics', tree.topicId)
    const { error } = await admin
      .from('easa_topics')
      .update({ deleted_by: null })
      .eq('id', tree.topicId)
    expect(error).toBeNull()
    const after = await row('easa_topics', tree.topicId)
    expect(after.deleted_by).toBeNull()
    expect(after.deleted_at).not.toBeNull()
  })

  it('allows editing a live topic that keeps its parent', async () => {
    const tree = await newTree()
    const { error } = await adminClient
      .from('easa_topics')
      .update({ name: 'edited', sort_order: 5 })
      .eq('id', tree.topicId)
    expect(error).toBeNull()
    const after = await row('easa_topics', tree.topicId)
    expect(after.name).toBe('edited')
    expect(after.sort_order).toBe(5)
  })

  it('rejects a question insert under a soft-deleted subtopic', async () => {
    const tree = await newTree()
    await stamp('easa_subtopics', tree.subtopicId)
    await expect(seedOne(tree, true)).rejects.toThrow('parent_not_found')
    const { data } = await admin.from('questions').select('id').eq('topic_id', tree.topicId)
    expect(data).toHaveLength(0)
  })

  it('rejects re-pointing a live question at a soft-deleted topic', async () => {
    const live = await newTree()
    const dead = await deadTree()
    const qid = await seedOne(live, false)
    const { error } = await admin.from('questions').update({ topic_id: dead.topicId }).eq('id', qid)
    expect(error?.message).toContain('parent_not_found')
    const { data } = await admin.from('questions').select('topic_id').eq('id', qid).single()
    expect(data?.topic_id).toBe(live.topicId)
  })

  it('rejects restoring a soft-deleted question whose subject is soft-deleted', async () => {
    const tree = await newTree()
    const qid = await seedOne(tree, false)
    const when = new Date().toISOString()
    const del = await admin.from('questions').update({ deleted_at: when }).eq('id', qid)
    expect(del.error).toBeNull()
    await stamp('easa_subtopics', tree.subtopicId)
    await stamp('easa_topics', tree.topicId)
    await stamp('easa_subjects', tree.subjectId)
    const { error } = await admin.from('questions').update({ deleted_at: null }).eq('id', qid)
    expect(error?.message).toContain('parent_not_found')
    const { data } = await admin.from('questions').select('deleted_at').eq('id', qid).single()
    expect(data?.deleted_at).not.toBeNull()
  })

  it('rejects restoring a soft-deleted topic whose subject is soft-deleted', async () => {
    const tree = await deadTree()
    const { error } = await admin
      .from('easa_topics')
      .update({ deleted_at: null })
      .eq('id', tree.topicId)
    expect(error?.message).toContain('parent_not_found')
    expect((await row('easa_topics', tree.topicId)).deleted_at).not.toBeNull()
  })

  it('rejects an exam_configs insert for a soft-deleted subject', async () => {
    const dead = await deadTree()
    const { error } = await newConfig(dead.subjectId)
    expect(error?.message).toContain('parent_not_found')
    const { data } = await admin.from('exam_configs').select('id').eq('subject_id', dead.subjectId)
    expect(data).toHaveLength(0)
  })

  it('rejects an exam_config_distributions insert for a soft-deleted topic', async () => {
    const live = await newTree()
    const dead = await deadTree()
    const { data: cfg, error: cfgErr } = await newConfig(live.subjectId)
    expect(cfgErr).toBeNull()
    const { error } = await admin.from('exam_config_distributions').insert({
      exam_config_id: cfg?.id,
      topic_id: dead.topicId,
      question_count: 1,
    })
    expect(error?.message).toContain('parent_not_found')
    const { data } = await admin
      .from('exam_config_distributions')
      .select('id')
      .eq('exam_config_id', cfg?.id)
    expect(data).toHaveLength(0)
  })

  it('rejects editing short on a soft-deleted subject', async () => {
    const dead = await deadTree()
    const { error } = await adminClient
      .from('easa_subjects')
      .update({ short: 'zzz' })
      .eq('id', dead.subjectId)
    expect(error?.message).toContain('item_deleted')
    expect((await row('easa_subjects', dead.subjectId)).short).not.toBe('zzz')
  })

  it('allows a live question edit that leaves the syllabus columns alone', async () => {
    const tree = await newTree()
    const qid = await seedOne(tree, true)
    const { error } = await admin
      .from('questions')
      .update({ question_text: 'edited?' })
      .eq('id', qid)
    expect(error).toBeNull()
    const { data } = await admin.from('questions').select('question_text').eq('id', qid).single()
    expect(data?.question_text).toBe('edited?')
  })
})
