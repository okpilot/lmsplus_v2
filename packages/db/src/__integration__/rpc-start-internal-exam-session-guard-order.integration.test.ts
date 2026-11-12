import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * start_internal_exam_session: the active-user gate runs before any
 * internal_exam_codes read, so a soft-deleted caller learns nothing about a code.
 */
describe('RPC: start_internal_exam_session guard order (#1024)', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const PASSWORD = 'test-pass-123'
  const INACTIVE = /user not found or inactive/

  let orgId: string
  let adminUserId: string
  let deletedId: string
  let otherId: string
  let deletedClient: SupabaseClient
  let activeClient: SupabaseClient
  let subjectId: string
  const userIds: string[] = []
  const codeIds: string[] = []

  async function seedCode(studentId: string, tag: string, voided = false): Promise<string> {
    const { data, error } = await admin
      .from('internal_exam_codes')
      .insert({
        code: `GO${suffix}${tag}`,
        subject_id: subjectId,
        student_id: studentId,
        issued_by: adminUserId,
        organization_id: orgId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        ...(voided ? { voided_at: new Date().toISOString(), voided_by: adminUserId } : {}),
      })
      .select('id, code')
      .single()
    if (error || !data) throw new Error(`seedCode: ${error?.message}`)
    codeIds.push(data.id as string)
    return data.code as string
  }

  beforeAll(async () => {
    const { data: sub, error: subErr } = await admin
      .from('easa_subjects')
      .select('id')
      .eq('code', 'RT')
      .single()
    if (subErr || !sub) throw new Error('RT subject not found')
    subjectId = sub.id as string

    orgId = await createTestOrg({
      admin,
      name: `Test Org GuardOrder ${suffix}`,
      slug: `test-guard-order-${suffix}`,
    })
    const mk = async (role: 'admin' | 'student', tag: string) => {
      const id = await createTestUser({
        admin,
        orgId,
        email: `${tag}-guard-order-${suffix}@test.local`,
        password: PASSWORD,
        role,
      })
      userIds.push(id)
      return id
    }
    adminUserId = await mk('admin', 'admin')
    deletedId = await mk('student', 'deleted')
    await mk('student', 'active')
    otherId = await mk('student', 'other')

    // Sign in before the soft delete: the JWT stays valid afterwards.
    deletedClient = await getAuthenticatedClient({
      email: `deleted-guard-order-${suffix}@test.local`,
      password: PASSWORD,
    })
    activeClient = await getAuthenticatedClient({
      email: `active-guard-order-${suffix}@test.local`,
      password: PASSWORD,
    })
  })

  afterAll(async () => {
    const errors: string[] = []
    if (codeIds.length > 0) {
      const { error } = await admin.from('internal_exam_codes').delete().in('id', codeIds)
      if (error) errors.push(`code delete: ${error.message}`)
    }
    if (errors.length === 0) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(`cleanup: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('control: an active student with a non-existent code gets code_not_found', async () => {
    const { error } = await activeClient.rpc('start_internal_exam_session', {
      p_code: `NOPE${suffix}`,
    })
    expect(error?.message ?? '').toMatch(/code_not_found/)
  })

  describe('soft-deleted caller', () => {
    let otherCode: string
    let voidedCode: string

    beforeAll(async () => {
      otherCode = await seedCode(otherId, 'oth')
      voidedCode = await seedCode(deletedId, 'void', true)
      const { error } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deletedId)
      expect(error).toBeNull()
      const { data } = await admin.from('users').select('deleted_at').eq('id', deletedId).single()
      expect(data?.deleted_at).not.toBeNull()
    })

    it('gets "user not found or inactive" for a non-existent code', async () => {
      const { error } = await deletedClient.rpc('start_internal_exam_session', {
        p_code: `MISSING${suffix}`,
      })
      expect(error?.message ?? '').toMatch(INACTIVE)
    })

    it('gets "user not found or inactive" for another student\'s live code', async () => {
      const { error } = await deletedClient.rpc('start_internal_exam_session', {
        p_code: otherCode,
      })
      expect(error?.message ?? '').toMatch(INACTIVE)
    })

    it('gets "user not found or inactive" for its own voided code', async () => {
      const { error } = await deletedClient.rpc('start_internal_exam_session', {
        p_code: voidedCode,
      })
      expect(error?.message ?? '').toMatch(INACTIVE)
    })

    it('leaves the code rows unconsumed after the refused calls', async () => {
      const { data, error } = await admin
        .from('internal_exam_codes')
        .select('consumed_at, consumed_session_id')
        .in('id', codeIds)
      expect(error).toBeNull()
      expect(data?.length).toBe(codeIds.length)
      for (const row of data ?? []) {
        expect(row.consumed_at).toBeNull()
        expect(row.consumed_session_id).toBeNull()
      }
    })
  })
})
