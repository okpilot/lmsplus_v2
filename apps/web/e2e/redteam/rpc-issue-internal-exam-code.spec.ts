/**
 * Red Team Spec: issue_internal_exam_code RPC
 *
 * Vectors BH / BI (HIGH): admin-only RPC that issues a single-use code.
 *  - BH(1): unauthenticated → 'not_authenticated'
 *  - BH(2): authenticated student (non-admin) → 'not_admin'
 *  - BI:    cross-org admin issuing for foreign-org student → 'student_not_found'
 *  - extra: missing exam_config → 'exam_config_required'
 *
 * Status: Expected to PASS — every guard is in the SECURITY DEFINER body of
 * `issue_internal_exam_code`. Failure means the auth/admin/org/exam-config
 * gates are not firing as documented.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  createCrossOrgUser,
  ensureExamConfig,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

test.describe('Red Team: issue_internal_exam_code RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerStudentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClientAuthed: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let crossOrgAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let egmontStudentId: string
  let crossOrgStudentId: string
  let configuredSubjectId: string
  let unconfiguredSubjectId: string

  test.beforeAll(async () => {
    admin = getAdminClient()

    const { victimUserId } = await seedRedTeamUsers()
    egmontStudentId = victimUserId

    const { email: adminEmail, password: adminPassword } = await seedRedTeamAdmin()
    const crossOrg = await seedCrossOrgAdmin()
    // Reuse the cross-org student helper (creates a student in the other org).
    const crossOrgUser = await createCrossOrgUser()
    crossOrgStudentId = crossOrgUser.userId

    attackerStudentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminClientAuthed = await createAuthenticatedClient(adminEmail, adminPassword)
    crossOrgAdminClient = await createAuthenticatedClient(crossOrg.email, crossOrg.password)

    // Resolve subjects/topics for the egmont org. Need at least 2 distinct
    // subjects (one configured, one unconfigured). CI Supabase seeds may carry
    // only one — top up with throwaway rows when needed.
    let { data: subjects } = await admin
      .from('easa_subjects')
      .select('id')
      .order('sort_order', { ascending: true })
      .limit(2)
    if (!subjects || subjects.length < 2) {
      await admin.from('easa_subjects').upsert(
        [
          {
            code: 'RT-FIXTURE-1',
            name: 'Red Team Fixture Subject 1',
            short: 'RTF1',
            sort_order: 9001,
          },
          {
            code: 'RT-FIXTURE-2',
            name: 'Red Team Fixture Subject 2',
            short: 'RTF2',
            sort_order: 9002,
          },
        ],
        { onConflict: 'code', ignoreDuplicates: true },
      )
      const refetched = await admin
        .from('easa_subjects')
        .select('id')
        .order('sort_order', { ascending: true })
        .limit(2)
      subjects = refetched.data
    }
    expect(subjects).not.toBeNull()
    expect(subjects!.length).toBeGreaterThanOrEqual(2)
    configuredSubjectId = subjects![0].id
    unconfiguredSubjectId = subjects![1].id

    const { data: topics } = await admin
      .from('easa_topics')
      .select('id')
      .eq('subject_id', configuredSubjectId)
      .limit(1)
    // Don't fall back to configuredSubjectId — easa_topics.id and easa_subjects.id
    // are distinct relations; ensureExamConfig would FK-fail downstream.
    let topicId = topics?.[0]?.id
    if (!topicId) {
      const { data: insertedTopic, error: topicErr } = await admin
        .from('easa_topics')
        .insert({
          subject_id: configuredSubjectId,
          code: 'RT-T1',
          name: 'Red Team Fixture Topic 1',
        })
        .select('id')
        .single()
      if (topicErr || !insertedTopic) {
        throw new Error(`seed: failed to insert fixture topic: ${topicErr?.message}`)
      }
      topicId = insertedTopic.id
    }

    // Seed an enabled exam_config for the configured subject in the egmont org.
    const { data: orgRow } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', 'egmont-aviation')
      .single()
    const egmontOrgId = orgRow!.id
    await ensureExamConfig(egmontOrgId, configuredSubjectId, topicId)

    // Ensure NO active exam_config exists for the unconfigured subject. Soft-delete
    // any pre-existing row to keep the test deterministic.
    await admin
      .from('exam_configs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', egmontOrgId)
      .eq('subject_id', unconfiguredSubjectId)
      .is('deleted_at', null)
  })

  test('unauthenticated call returns not_authenticated (Vector BH-1)', async () => {
    const { data, error } = await unauthClient.rpc('issue_internal_exam_code', {
      p_subject_id: configuredSubjectId,
      p_student_id: egmontStudentId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data).toBeNull()
  })

  test('authenticated student (non-admin) cannot issue codes (Vector BH-2)', async () => {
    const { data, error } = await attackerStudentClient.rpc('issue_internal_exam_code', {
      p_subject_id: configuredSubjectId,
      p_student_id: egmontStudentId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_admin/i)
    expect(data).toBeNull()
  })

  test('admin cannot issue code for student in different org (Vector BI)', async () => {
    // The egmont admin targets a student in the cross-org tenant. The RPC must
    // reject with 'student_not_found' (existence-hiding).
    const { data, error } = await adminClientAuthed.rpc('issue_internal_exam_code', {
      p_subject_id: configuredSubjectId,
      p_student_id: crossOrgStudentId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/student_not_found/i)
    expect(data).toBeNull()
  })

  test('cross-org admin cannot issue code for egmont student (mirror of BI)', async () => {
    // The cross-org admin targets the egmont student. Same expected outcome.
    const { data, error } = await crossOrgAdminClient.rpc('issue_internal_exam_code', {
      p_subject_id: configuredSubjectId,
      p_student_id: egmontStudentId,
    })

    expect(error).not.toBeNull()
    // Either student_not_found (org mismatch) or subject_not_found (subject not
    // visible to other org). Both are valid existence-hiding outcomes; pin the
    // primary expectation but accept the alternate.
    expect(error?.message ?? '').toMatch(/student_not_found|subject_not_found/i)
    expect(data).toBeNull()
  })

  test('admin issuing for valid student but missing exam_config returns exam_config_required', async () => {
    const { data, error } = await adminClientAuthed.rpc('issue_internal_exam_code', {
      p_subject_id: unconfiguredSubjectId,
      p_student_id: egmontStudentId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/exam_config_required/i)
    expect(data).toBeNull()
  })

  test('admin happy path returns a code with the same expected shape', async () => {
    // Sanity: the RPC actually issues a code on the valid path. This anchors
    // the negative tests above — without it, all four could pass for the wrong
    // reason (RPC always errors).
    const { data, error } = await adminClientAuthed.rpc('issue_internal_exam_code', {
      p_subject_id: configuredSubjectId,
      p_student_id: egmontStudentId,
    })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const row = (data as Array<{ code_id: string; code: string; expires_at: string }> | null)?.[0]
    expect(row).toBeTruthy()
    expect(typeof row?.code).toBe('string')
    expect(row?.code.length).toBe(8)
    expect(typeof row?.code_id).toBe('string')
    expect(typeof row?.expires_at).toBe('string')
  })
})
