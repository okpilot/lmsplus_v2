import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

type Tree = { subjectId: string; topicId: string; subtopicId: string | null }

describe('Trigger: questions require a subtopic when the topic has live subtopics', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const userIds: string[] = []
  const subjectIds: string[] = []
  let orgId: string
  let n = 0

  async function newTree(withSubtopic: boolean): Promise<Tree> {
    n += 1
    const tag = `RS${suffix}${n}`
    const { data: s, error: sErr } = await admin
      .from('easa_subjects')
      .insert({ code: tag, name: `RS subject ${tag}`, short: tag, sort_order: 900 + n })
      .select('id')
      .single()
    if (sErr || !s) throw new Error(`subject: ${sErr?.message}`)
    subjectIds.push(s.id as string)
    const { data: t, error: tErr } = await admin
      .from('easa_topics')
      .insert({ subject_id: s.id, code: `${tag}-T`, name: 'RS topic', sort_order: 1 })
      .select('id')
      .single()
    if (tErr || !t) throw new Error(`topic: ${tErr?.message}`)
    let subtopicId: string | null = null
    if (withSubtopic) {
      const { data: st, error: stErr } = await admin
        .from('easa_subtopics')
        .insert({ topic_id: t.id, code: `${tag}-ST`, name: 'RS subtopic', sort_order: 1 })
        .select('id')
        .single()
      if (stErr || !st) throw new Error(`subtopic: ${stErr?.message}`)
      subtopicId = st.id as string
    }
    return { subjectId: s.id as string, topicId: t.id as string, subtopicId }
  }

  async function seedOne(tree: Tree, subtopicId: string | null): Promise<string> {
    const { questionIds } = await seedQuestions({
      admin,
      orgId,
      createdBy: userIds[0] as string,
      subjectId: tree.subjectId,
      topicId: tree.topicId,
      subtopicId,
      count: 1,
    })
    return questionIds[0] as string
  }

  async function trySeed(tree: Tree, subtopicId: string | null) {
    try {
      await seedOne(tree, subtopicId)
      return null
    } catch (e) {
      return (e as Error).message
    }
  }

  // Gap case (option A): a NULL-subtopic question exists before the first subtopic does.
  async function gapQuestion(): Promise<{ tree: Tree; questionId: string; subtopicId: string }> {
    const tree = await newTree(false)
    const questionId = await seedOne(tree, null)
    const { data: st, error } = await admin
      .from('easa_subtopics')
      .insert({ topic_id: tree.topicId, code: `GAP${suffix}${n}`, name: 'gap', sort_order: 1 })
      .select('id')
      .single()
    if (error || !st) throw new Error(`gap subtopic: ${error?.message}`)
    return { tree, questionId, subtopicId: st.id as string }
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `RS Org ${suffix}`, slug: `rs-subtopic-${suffix}` })
    userIds.push(
      await createTestUser({
        admin,
        orgId,
        email: `rs-admin-${suffix}@test.local`,
        password: 'test-pass-123',
        role: 'admin',
      }),
    )
  })

  afterAll(async () => {
    await admin.from('questions').delete().eq('organization_id', orgId)
    await cleanupTestData({ admin, orgId, userIds })
    const now = new Date().toISOString()
    for (const id of subjectIds) {
      const { data: topics } = await admin.from('easa_topics').select('id').eq('subject_id', id)
      const topicIds = (topics ?? []).map((r) => r.id as string)
      await admin
        .from('easa_subtopics')
        .update({ deleted_at: now })
        .in('topic_id', topicIds)
        .is('deleted_at', null)
      await admin
        .from('easa_topics')
        .update({ deleted_at: now })
        .eq('subject_id', id)
        .is('deleted_at', null)
      await admin
        .from('easa_subjects')
        .update({ deleted_at: now })
        .eq('id', id)
        .is('deleted_at', null)
    }
  })

  it('rejects inserting a live question with no subtopic when the topic has a live subtopic', async () => {
    const tree = await newTree(true)
    expect(await trySeed(tree, null)).toContain('subtopic_required')
  })

  it('accepts inserting a question with a subtopic when the topic has subtopics', async () => {
    const tree = await newTree(true)
    expect(await trySeed(tree, tree.subtopicId)).toBeNull()
  })

  it('rejects an update that clears subtopic_id on a topic with subtopics', async () => {
    const tree = await newTree(true)
    const id = await seedOne(tree, tree.subtopicId)
    const { error } = await admin.from('questions').update({ subtopic_id: null }).eq('id', id)
    expect(error?.message).toContain('subtopic_required')
  })

  it('rejects an update that moves a NULL-subtopic question into a topic with subtopics', async () => {
    const plain = await newTree(false)
    const withSub = await newTree(true)
    const id = await seedOne(plain, null)
    const { error } = await admin
      .from('questions')
      .update({ subject_id: withSub.subjectId, topic_id: withSub.topicId })
      .eq('id', id)
    expect(error?.message).toContain('subtopic_required')
  })

  it('rejects restoring a soft-deleted NULL-subtopic question when its topic has subtopics', async () => {
    const { questionId } = await gapQuestion()
    const { error: delErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', questionId)
    expect(delErr).toBeNull()
    const { error } = await admin
      .from('questions')
      .update({ deleted_at: null })
      .eq('id', questionId)
    expect(error?.message).toContain('subtopic_required')
  })

  it('raises SQLSTATE P0001 for the violation', async () => {
    const tree = await newTree(true)
    const { data: bank } = await admin
      .from('question_banks')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    const bankId =
      bank?.id ??
      (await seedOne(tree, tree.subtopicId).then(async () => {
        const { data } = await admin
          .from('question_banks')
          .select('id')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .single()
        return data?.id as string
      }))
    const { error } = await admin.from('questions').insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: tree.subjectId,
      topic_id: tree.topicId,
      subtopic_id: null,
      question_text: 'code?',
      options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id })),
      correct_option_id: 'b',
      explanation_text: 'e',
      difficulty: 'medium',
      status: 'active',
      created_by: userIds[0],
    })
    expect(error?.code).toBe('P0001')
    expect(error?.message).toContain('subtopic_required')
  })

  it('allows a NULL subtopic in a topic with no subtopics', async () => {
    const tree = await newTree(false)
    expect(await trySeed(tree, null)).toBeNull()
  })

  it('allows a NULL subtopic in a topic whose only subtopics are soft-deleted', async () => {
    const tree = await newTree(true)
    await admin
      .from('easa_subtopics')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', tree.subtopicId as string)
    expect(await trySeed(tree, null)).toBeNull()
  })

  it('allows soft-deleting a violating row', async () => {
    const { questionId } = await gapQuestion()
    const { error } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', questionId)
    expect(error).toBeNull()
  })

  it('allows an update not touching topic, subtopic or deleted_at on a violating row', async () => {
    const { questionId } = await gapQuestion()
    const { error } = await admin.from('questions').update({ status: 'draft' }).eq('id', questionId)
    expect(error).toBeNull()
  })

  it('rejects inserting a subtopic that belongs to another topic', async () => {
    const a = await newTree(true)
    const b = await newTree(true)
    expect(await trySeed(a, b.subtopicId)).toContain('subtopic_topic_mismatch')
  })

  it('rejects re-pointing topic_id while keeping the old subtopic', async () => {
    const a = await newTree(true)
    const b = await newTree(true)
    const id = await seedOne(a, a.subtopicId)
    const { error } = await admin
      .from('questions')
      .update({ subject_id: b.subjectId, topic_id: b.topicId })
      .eq('id', id)
    expect(error?.message).toContain('subtopic_topic_mismatch')
  })

  it('exempts a soft-deleted row with a mismatched subtopic', async () => {
    const a = await newTree(true)
    const b = await newTree(true)
    const id = await seedOne(a, a.subtopicId)
    const { error } = await admin
      .from('questions')
      .update({
        subject_id: b.subjectId,
        topic_id: b.topicId,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id)
    expect(error).toBeNull()
  })

  it('denies an authenticated admin changing easa_subtopics.topic_id', async () => {
    const a = await newTree(true)
    const b = await newTree(true)
    const client = await getAuthenticatedClient({
      email: `rs-admin-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const { error } = await client
      .from('easa_subtopics')
      .update({ topic_id: b.topicId })
      .eq('id', a.subtopicId as string)
    expect(error?.code).toBe('42501')
    const { data } = await admin
      .from('easa_subtopics')
      .select('topic_id')
      .eq('id', a.subtopicId as string)
      .single()
    expect(data?.topic_id).toBe(a.topicId)
  })

  it('accepts a subtopic that belongs to the question topic', async () => {
    const a = await newTree(true)
    expect(await trySeed(a, a.subtopicId)).toBeNull()
  })
})
