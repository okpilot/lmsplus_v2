import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData, clearActiveSessions } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcResult } from './guards'
import { orderingItem } from './ordering-item-id'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

type DiscoveryResult = { session_id: string | null; questions: Array<{ id: string }> }

// #1548 — start_discovery is SECURITY DEFINER and returns the answer key, so the draw join
// must keep non-multiple-choice, draft and soft-deleted questions of the caller's own org out.
// Pins the UNION of the pool's 'multiple_choice' argument and the join's predicates; either
// layer alone also excludes these rows.
describe('RPC: start_discovery draw filters (#1548)', () => {
  const admin = getAdminClient()
  const suffix = `${fixtureSuffix()}-sdf`
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let validIds: string[]
  let excluded: { nonMc: string; draft: string; softDeleted: string }
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org SDF ${suffix}`,
      slug: `test-sdf-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-sdf-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-sdf-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-sdf-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SDF${suffix}`,
      subjectName: `SDF Subject ${suffix}`,
      topicCode: `SDF${suffix}-01`,
      topicName: `SDF Topic ${suffix}`,
    })

    const seed = async (count: number) =>
      await seedQuestions({
        admin,
        orgId,
        createdBy: adminUserId,
        subjectId: refs.subjectId,
        topicId: refs.topicId,
        count,
      })
    const valid = await seed(3)
    validIds = valid.questionIds
    const draft = await seed(1)
    const { error: draftErr } = await admin
      .from('questions')
      .update({ status: 'draft' })
      .eq('id', draft.questionIds[0] as string)
    if (draftErr) throw new Error(`draft fixture: ${draftErr.message}`)
    const softDeleted = await seed(1)
    const { error: sdErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softDeleted.questionIds[0] as string)
    if (sdErr) throw new Error(`soft-deleted fixture: ${sdErr.message}`)
    const { data: orderingRow, error: ordErr } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: valid.bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
        question_type: 'ordering',
        question_text: 'Order these?',
        ordering_items: [orderingItem('Alpha'), orderingItem('Bravo')],
        explanation_text: 'ordering fixture',
      })
      .select('id')
      .single()
    if (ordErr) throw new Error(`ordering fixture: ${ordErr.message}`)
    excluded = {
      nonMc: requireRpcResult<{ id: string }>(orderingRow, 'ordering fixture').id,
      draft: draft.questionIds[0] as string,
      softDeleted: softDeleted.questionIds[0] as string,
    }
  })

  afterAll(async () => {
    await clearActiveSessions({ admin, orgId })
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('never draws a non-multiple-choice, draft or soft-deleted question of the own org', async () => {
    const { data: rows, error: rowsErr } = await admin
      .from('questions')
      .select('id, question_type, status, deleted_at, organization_id')
      .in('id', Object.values(excluded))
    expect(rowsErr).toBeNull()
    expect(rows).toHaveLength(3)
    const byId = new Map((rows ?? []).map((r) => [r.id, r]))
    expect(byId.get(excluded.nonMc)?.question_type).toBe('ordering')
    expect(byId.get(excluded.nonMc)?.status).toBe('active')
    expect(byId.get(excluded.nonMc)?.deleted_at).toBeNull()
    expect(byId.get(excluded.draft)?.status).toBe('draft')
    expect(byId.get(excluded.softDeleted)?.deleted_at).not.toBeNull()
    for (const r of rows ?? []) expect(r.organization_id).toBe(orgId)

    const { data, error } = await studentClient.rpc('start_discovery', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: [],
      p_calc_mode: 'all',
      p_has_image: 'all',
    })
    expect(error).toBeNull()
    const result = requireRpcResult<DiscoveryResult>(data, 'start_discovery')
    const drawn = result.questions.map((q) => q.id)
    expect(drawn.sort()).toEqual([...validIds].sort())
    const { data: sessions, error: sessErr } = await admin
      .from('quiz_sessions')
      .select('config')
      .eq('id', result.session_id)
    expect(sessErr).toBeNull()
    const configIds = sessions?.[0]?.config.question_ids
    expect(Array.isArray(configIds)).toBe(true)
    for (const id of Object.values(excluded)) {
      expect(drawn).not.toContain(id)
      expect(configIds).not.toContain(id)
    }
  })
})
