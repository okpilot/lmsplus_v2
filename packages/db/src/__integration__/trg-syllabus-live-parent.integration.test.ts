import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
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
})
