/**
 * Red Team Spec: set_user_enrolments privilege escalation + course_enrolments
 * cross-tenant read (Vectors KC, KD, KE, #1635).
 *
 * KC — a non-admin (student or instructor) calls `set_user_enrolments(self, [ATPL_A])`
 *      over PostgREST to self-enrol. Defence: `is_admin()` gate → `not_admin`.
 * KD — an admin of another org enrols an egmont student. Defence: target lookup
 *      scoped to the caller's organization → `user_not_found`.
 * KE — an admin of another org SELECTs an egmont student's `course_enrolments`
 *      rows. Defence: `admin_read_org_enrolments` scoped to the caller's org.
 *
 * Control arms: the in-org admin's identical call succeeds and its read returns
 * the row, so each denial is the guard, not a broken fixture.
 *
 * Hermetic: a dedicated throwaway student; afterEach soft-deletes every active
 * enrolment through the RPC (`deleted_at`, never a hard DELETE).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_KC_INSTRUCTOR_EMAIL,
  E2E_REDTEAM_KC_INSTRUCTOR_PASSWORD,
  E2E_REDTEAM_KC_STUDENT_EMAIL,
  E2E_REDTEAM_KC_STUDENT_PASSWORD,
} from './helpers/seed-markers'
import { seedCrossOrgAdmin, seedRedTeamAdmin } from './helpers/seed-users'

const PPL_A_ID = 'c0a5e000-0000-4000-8000-000000000001'
const ATPL_A_ID = 'c0a5e000-0000-4000-8000-000000000003'

test.describe('Red Team: set_user_enrolments escalation (KC, KD, KE)', () => {
  let studentId = ''
  let instructorId = ''
  let inOrgAdmin: SupabaseClient
  let crossOrgAdmin: SupabaseClient

  async function activeCourseIds(): Promise<string[]> {
    const { data, error } = await getAdminClient()
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', studentId)
      .is('deleted_at', null)
    if (error) throw new Error(`Could not read enrolments: ${error.message}`)
    return (data ?? []).map((r) => r.course_id as string).sort()
  }

  async function clearEnrolments(): Promise<void> {
    const errors: string[] = []
    for (const id of [studentId, instructorId]) {
      try {
        const { error } = await inOrgAdmin.rpc('set_user_enrolments', {
          p_user_id: id,
          p_course_ids: [],
        })
        if (error) throw new Error(`clear enrolments ${id}: ${error.message}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`Cleanup failed: ${errors.join('; ')}`)
  }

  test.beforeAll(async () => {
    const admin = getAdminClient()
    const orgId = await getEgmontOrgId(admin)
    studentId = await upsertUser(
      admin,
      E2E_REDTEAM_KC_STUDENT_EMAIL,
      E2E_REDTEAM_KC_STUDENT_PASSWORD,
      orgId,
    )
    instructorId = await upsertUser(
      admin,
      E2E_REDTEAM_KC_INSTRUCTOR_EMAIL,
      E2E_REDTEAM_KC_INSTRUCTOR_PASSWORD,
      orgId,
      'instructor',
    )
    const inOrg = await seedRedTeamAdmin()
    const crossOrg = await seedCrossOrgAdmin()
    expect(crossOrg.orgId).not.toBe(inOrg.orgId)
    inOrgAdmin = await createAuthenticatedClient(inOrg.email, inOrg.password)
    crossOrgAdmin = await createAuthenticatedClient(crossOrg.email, crossOrg.password)
  })

  test.beforeEach(async () => {
    await clearEnrolments()
  })

  test.afterEach(async () => {
    await clearEnrolments()
    expect(await activeCourseIds()).toEqual([])
    const { data, error } = await getAdminClient()
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', instructorId)
      .is('deleted_at', null)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('KC: a non-admin student cannot self-enrol via set_user_enrolments; the in-org admin can', async () => {
    const student = await createAuthenticatedClient(
      E2E_REDTEAM_KC_STUDENT_EMAIL,
      E2E_REDTEAM_KC_STUDENT_PASSWORD,
    )
    const attack = await student.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ATPL_A_ID],
    })
    expect(attack.error?.message).toBe('not_admin')
    expect(await activeCourseIds()).toEqual([])

    const control = await inOrgAdmin.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ATPL_A_ID],
    })
    expect(control.error).toBeNull()
    expect(await activeCourseIds()).toEqual([ATPL_A_ID])
  })

  test('KC: a non-admin instructor cannot self-enrol via set_user_enrolments', async () => {
    const instructor = await createAuthenticatedClient(
      E2E_REDTEAM_KC_INSTRUCTOR_EMAIL,
      E2E_REDTEAM_KC_INSTRUCTOR_PASSWORD,
    )
    const attack = await instructor.rpc('set_user_enrolments', {
      p_user_id: instructorId,
      p_course_ids: [ATPL_A_ID],
    })
    expect(attack.error?.message).toBe('not_admin')

    const { data, error } = await getAdminClient()
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', instructorId)
      .is('deleted_at', null)
    expect(error).toBeNull()
    expect(data).toEqual([])

    const control = await inOrgAdmin.rpc('set_user_enrolments', {
      p_user_id: instructorId,
      p_course_ids: [ATPL_A_ID],
    })
    expect(control.error).toBeNull()
  })

  test('KD: a cross-org admin cannot enrol another org student; the in-org admin can', async () => {
    const attack = await crossOrgAdmin.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ATPL_A_ID],
    })
    expect(attack.error?.message).toBe('user_not_found')
    expect(await activeCourseIds()).toEqual([])

    const control = await inOrgAdmin.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ATPL_A_ID],
    })
    expect(control.error).toBeNull()
    expect(await activeCourseIds()).toEqual([ATPL_A_ID])
  })

  test('KE: a cross-org admin reads none of another org student enrolments; the in-org admin reads them', async () => {
    const seed = await inOrgAdmin.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [PPL_A_ID],
    })
    expect(seed.error).toBeNull()

    const control = await inOrgAdmin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', studentId)
      .is('deleted_at', null)
    expect(control.error).toBeNull()
    expect((control.data ?? []).map((r) => r.course_id)).toEqual([PPL_A_ID])

    const attack = await crossOrgAdmin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', studentId)
    expect(attack.error).toBeNull()
    expect(attack.data).toEqual([])
  })
})
