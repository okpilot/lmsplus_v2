// App-layer integration tier — deleteItem against the real soft_delete_syllabus_item RPC
// under the signed-in admin's session (real requireAdmin, real RLS). Covers the app-layer
// error mapping only; RPC semantics are covered in packages/db.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { deleteItem } from './delete-item'

const admin = getAdminClient()
const suffix = fixtureSuffix()
// easa_subjects.code is max 10 chars; fixtureSuffix() is too long.
const tag = Math.random().toString(36).slice(2, 8).toUpperCase()
const adminEmail = `int-di-admin-${suffix}@test.local`
const password = 'test-pass-123'

let orgId: string
let adminId: string
let subjectId: string
let topicId: string
let subtopicId: string

describe('deleteItem (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-di ${suffix}`, slug: `di-${suffix}` })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    const code = `DI${tag}`
    const { data: s, error: sErr } = await admin
      .from('easa_subjects')
      .insert({ code, name: `DI ${code}`, short: code, sort_order: 991 })
      .select('id')
      .single()
    if (sErr || !s) throw new Error(`subject: ${sErr?.message}`)
    subjectId = s.id as string
    const { data: t, error: tErr } = await admin
      .from('easa_topics')
      .insert({ subject_id: subjectId, code: `${code}-T`, name: 'DI topic', sort_order: 1 })
      .select('id')
      .single()
    if (tErr || !t) throw new Error(`topic: ${tErr?.message}`)
    topicId = t.id as string
    const { data: st, error: stErr } = await admin
      .from('easa_subtopics')
      .insert({ topic_id: topicId, code: `${code}-ST`, name: 'DI subtopic', sort_order: 1 })
      .select('id')
      .single()
    if (stErr || !st) throw new Error(`subtopic: ${stErr?.message}`)
    subtopicId = st.id as string
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({ admin, orgId, userIds: [adminId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    const steps: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
      ['subtopics', admin.from('easa_subtopics').delete().eq('id', subtopicId)],
      ['topics', admin.from('easa_topics').delete().eq('id', topicId)],
      ['subjects', admin.from('easa_subjects').delete().eq('id', subjectId)],
    ]
    for (const [label, step] of steps) {
      const { error } = await step
      if (error) errors.push(`${label}: ${error.message}`)
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('refuses to delete a subject that still has a live topic', async () => {
    await signInAs(adminEmail, password)
    await expect(deleteItem({ table: 'easa_subjects', id: subjectId })).resolves.toEqual({
      success: false,
      error: 'Cannot delete: this item is still in use',
    })
  })

  it('reports Item not found for an id that does not exist', async () => {
    await signInAs(adminEmail, password)
    await expect(
      deleteItem({ table: 'easa_subtopics', id: '00000000-0000-4000-8000-000000000000' }),
    ).resolves.toEqual({ success: false, error: 'Item not found' })
  })

  it('soft-deletes an unused subtopic and stamps deleted_at', async () => {
    await signInAs(adminEmail, password)
    await expect(deleteItem({ table: 'easa_subtopics', id: subtopicId })).resolves.toEqual({
      success: true,
    })
    const { data, error } = await admin
      .from('easa_subtopics')
      .select('deleted_at')
      .eq('id', subtopicId)
      .single()
    expect(error).toBeNull()
    expect(data?.deleted_at).toEqual(expect.any(String))
  })

  it('reports Item not found when the item is already deleted', async () => {
    await signInAs(adminEmail, password)
    await expect(deleteItem({ table: 'easa_subtopics', id: subtopicId })).resolves.toEqual({
      success: false,
      error: 'Item not found',
    })
  })
})
