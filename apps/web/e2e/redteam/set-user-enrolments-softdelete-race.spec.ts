/**
 * Red Team Spec: set_user_enrolments soft-deleted admin + concurrent calls (Vectors KF, KG, #1635).
 *
 * KF — a soft-deleted admin keeps a valid JWT and calls `set_user_enrolments` to enrol a
 *      same-org student. Defence: `is_admin()` filters `deleted_at IS NULL` → `not_admin`.
 *      Control arm: the same admin, active, makes the identical call and it succeeds.
 * KG — parallel identical calls race the "insert missing" step. Defence: the
 *      `FOR NO KEY UPDATE` row lock on the target user serialises them → every call
 *      succeeds, one active row, one audit row. Control arm: the first call's effect
 *      (row + audit) does occur.
 *
 * Hermetic: dedicated throwaway admin and student; afterEach restores the admin
 * (`deleted_at = NULL`) and soft-deletes every active enrolment through the RPC.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_KF_ADMIN_EMAIL,
  E2E_REDTEAM_KF_ADMIN_PASSWORD,
  E2E_REDTEAM_KF_STUDENT_EMAIL,
  E2E_REDTEAM_KF_STUDENT_PASSWORD,
} from './helpers/seed-markers'
import { seedRedTeamAdmin } from './helpers/seed-users'

const ATPL_A_ID = 'c0a5e000-0000-4000-8000-000000000003'
const PARALLEL_CALLS = 8

test.describe('Red Team: set_user_enrolments soft-deleted admin + race (KF, KG)', () => {
  let adminId = ''
  let studentId = ''
  let cleanupAdmin: SupabaseClient

  async function activeCourseIds(): Promise<string[]> {
    const { data, error } = await getAdminClient()
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', studentId)
      .is('deleted_at', null)
    if (error) throw new Error(`Could not read enrolments: ${error.message}`)
    return (data ?? []).map((r) => r.course_id as string).sort()
  }

  async function auditCount(): Promise<number> {
    const { count, error } = await getAdminClient()
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('resource_id', studentId)
      .eq('event_type', 'user.enrolments_changed')
    if (error) throw new Error(`Could not count audit rows: ${error.message}`)
    return count ?? 0
  }

  async function setAdminDeleted(deleted: boolean): Promise<void> {
    const { error } = await getAdminClient()
      .from('users')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', adminId)
    if (error) throw new Error(`Could not set admin deleted_at: ${error.message}`)
  }

  test.beforeAll(async () => {
    const admin = getAdminClient()
    const orgId = await getEgmontOrgId(admin)
    adminId = await upsertUser(
      admin,
      E2E_REDTEAM_KF_ADMIN_EMAIL,
      E2E_REDTEAM_KF_ADMIN_PASSWORD,
      orgId,
      'admin',
    )
    studentId = await upsertUser(
      admin,
      E2E_REDTEAM_KF_STUDENT_EMAIL,
      E2E_REDTEAM_KF_STUDENT_PASSWORD,
      orgId,
    )
    const inOrg = await seedRedTeamAdmin()
    expect(inOrg.orgId).toBe(orgId)
    cleanupAdmin = await createAuthenticatedClient(inOrg.email, inOrg.password)
  })

  test.beforeEach(async () => {
    await setAdminDeleted(false)
    const { error } = await cleanupAdmin.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [],
    })
    if (error) throw new Error(`Setup failed: ${error.message}`)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await setAdminDeleted(false)
    } catch (e) {
      errors.push(String(e))
    }
    const { error } = await cleanupAdmin.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [],
    })
    if (error) errors.push(`Enrolment cleanup failed: ${error.message}`)
    expect(errors).toEqual([])
    expect(await activeCourseIds()).toEqual([])
  })

  test('KF: a soft-deleted admin cannot enrol a student; the same admin active can', async () => {
    const kfAdmin = await createAuthenticatedClient(
      E2E_REDTEAM_KF_ADMIN_EMAIL,
      E2E_REDTEAM_KF_ADMIN_PASSWORD,
    )
    await setAdminDeleted(true)
    const before = await auditCount()

    const attack = await kfAdmin.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ATPL_A_ID],
    })
    expect(attack.error?.message).toBe('not_admin')
    expect(await activeCourseIds()).toEqual([])
    expect(await auditCount()).toBe(before)

    await setAdminDeleted(false)
    const control = await kfAdmin.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ATPL_A_ID],
    })
    expect(control.error).toBeNull()
    expect(await activeCourseIds()).toEqual([ATPL_A_ID])
    expect(await auditCount()).toBe(before + 1)
  })

  test('KG: parallel identical calls all succeed with one active row and one audit row', async () => {
    const before = await auditCount()
    const results = await Promise.all(
      Array.from({ length: PARALLEL_CALLS }, () =>
        cleanupAdmin.rpc('set_user_enrolments', {
          p_user_id: studentId,
          p_course_ids: [ATPL_A_ID],
        }),
      ),
    )
    expect(results.map((r) => r.error?.message ?? null)).toEqual(
      Array.from({ length: PARALLEL_CALLS }, () => null),
    )
    expect(await activeCourseIds()).toEqual([ATPL_A_ID])
    expect(await auditCount()).toBe(before + 1)
  })
})
