// App-layer integration tier — checkLiveParent against real Postgres under the signed-in
// admin's session (real requireAdmin, real RLS).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { checkLiveParent } from './check-live-parent'

const admin = getAdminClient()
const suffix = fixtureSuffix()
// easa_subjects.code is max 10 chars; fixtureSuffix() is too long.
const tag = Math.random().toString(36).slice(2, 8).toUpperCase()
const adminEmail = `int-clp-admin-${suffix}@test.local`
const password = 'test-pass-123'

let orgId: string
let adminId: string
let liveSubjectId: string
let deletedSubjectId: string
let liveTopicId: string
let deletedTopicId: string

async function insertSubject(code: string, deletedAt: string | null): Promise<string> {
  const { data, error } = await admin
    .from('easa_subjects')
    .insert({ code, name: `CLP ${code}`, short: code, sort_order: 990, deleted_at: deletedAt })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insertSubject: ${error?.message}`)
  return data.id as string
}

async function insertTopic(
  subjectId: string,
  code: string,
  deletedAt: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from('easa_topics')
    .insert({
      subject_id: subjectId,
      code,
      name: `CLP ${code}`,
      sort_order: 1,
      deleted_at: deletedAt,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insertTopic: ${error?.message}`)
  return data.id as string
}

describe('checkLiveParent (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-clp ${suffix}`, slug: `clp-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: adminEmail,
      password,
      role: 'admin',
    })
    liveSubjectId = await insertSubject(`CL${tag}L`, null)
    deletedSubjectId = await insertSubject(`CL${tag}D`, new Date().toISOString())
    liveTopicId = await insertTopic(liveSubjectId, `CLP-${suffix}-LT`, null)
    deletedTopicId = await insertTopic(liveSubjectId, `CLP-${suffix}-DT`, new Date().toISOString())
  })

  afterAll(async () => {
    const errors: string[] = []
    const topicIds = [liveTopicId, deletedTopicId].filter(Boolean)
    const subjectIds = [liveSubjectId, deletedSubjectId].filter(Boolean)
    const now = new Date().toISOString()
    const steps: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
      [
        'topics',
        admin
          .from('easa_topics')
          .update({ deleted_at: now })
          .in('id', topicIds)
          .is('deleted_at', null),
      ],
      [
        'subjects',
        admin
          .from('easa_subjects')
          .update({ deleted_at: now })
          .in('id', subjectIds)
          .is('deleted_at', null),
      ],
    ]
    try {
      await cleanupTestData({ admin, orgId, userIds: [adminId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    for (const [label, step] of steps) {
      const { error } = await step
      if (error) errors.push(`${label}: ${error.message}`)
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns null when the parent subject is live', async () => {
    await signInAs(adminEmail, password)
    const { supabase } = await requireAdmin()
    await expect(
      checkLiveParent(supabase, { table: 'easa_subjects', id: liveSubjectId, label: 'topic' }),
    ).resolves.toBeNull()
  })

  it('returns Item not found when the parent subject is deleted', async () => {
    await signInAs(adminEmail, password)
    const { supabase } = await requireAdmin()
    await expect(
      checkLiveParent(supabase, { table: 'easa_subjects', id: deletedSubjectId, label: 'topic' }),
    ).resolves.toEqual({ success: false, error: 'Item not found' })
  })

  it('returns null when the parent topic is live', async () => {
    await signInAs(adminEmail, password)
    const { supabase } = await requireAdmin()
    await expect(
      checkLiveParent(supabase, { table: 'easa_topics', id: liveTopicId, label: 'subtopic' }),
    ).resolves.toBeNull()
  })

  it('returns Item not found when the parent topic is deleted', async () => {
    await signInAs(adminEmail, password)
    const { supabase } = await requireAdmin()
    await expect(
      checkLiveParent(supabase, { table: 'easa_topics', id: deletedTopicId, label: 'subtopic' }),
    ).resolves.toEqual({ success: false, error: 'Item not found' })
  })

  it('returns Item not found when the parent does not exist', async () => {
    await signInAs(adminEmail, password)
    const { supabase } = await requireAdmin()
    await expect(
      checkLiveParent(supabase, {
        table: 'easa_subjects',
        id: '00000000-0000-4000-8000-000000000000',
        label: 'topic',
      }),
    ).resolves.toEqual({ success: false, error: 'Item not found' })
  })
})
