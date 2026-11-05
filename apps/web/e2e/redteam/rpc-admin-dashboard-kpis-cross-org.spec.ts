/**
 * Red Team Spec: get_admin_dashboard_kpis + get_admin_weak_topics cross-org isolation (Vector KY)
 *
 * Both SECURITY DEFINER RPCs (migs 20260406000001 / 20260406000002) bypass RLS and scope every
 * aggregate by the caller's `users.organization_id`. A cross-org admin passes is_admin(), so the
 * org predicate is the only tenant boundary.
 *
 * Attack: the cross-org admin calls both RPCs.
 *  - totalStudents equals the service-role count of live students in ITS org, not egmont's.
 *  - every weak-topic topic_id has a student_response on an active, live question of ITS org.
 * An instructor (egmont, non-admin) is `forbidden` on both.
 *
 * CONTROL: the egmont admin's totalStudents equals egmont's count (which differs from the other
 * org's), and the egmont admin receives >= 1 weak-topic row whose topic is absent from the
 * cross-org expected set (the victim's seeded responses guarantee it).
 *
 * No fixture rows are written beyond the shared idempotent seeds; nothing to clean up.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId } from './helpers/seed-core'
import { seedVictimResponses } from './helpers/seed-responses'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>
type Admin = ReturnType<typeof getAdminClient>

const KPIS = 'get_admin_dashboard_kpis'
const WEAK = 'get_admin_weak_topics'
const kpiArgs = { p_range_days: 0 }
const weakArgs = { p_limit: 100 }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

async function liveStudentCount(admin: Admin, orgId: string): Promise<number> {
  const { count, error } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('role', 'student')
    .is('deleted_at', null)
  if (error || count === null) throw new Error(`count students: ${error?.message ?? 'null'}`)
  return count
}

/** Topic ids the RPC may legitimately return for `orgId` (mirrors its WHERE clause). */
async function answeredTopicIds(admin: Admin, orgId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('student_responses')
    .select('questions!inner(topic_id, organization_id, status, deleted_at)')
    .eq('questions.organization_id', orgId)
    .eq('questions.status', 'active')
    .is('questions.deleted_at', null)
  if (error) throw new Error(`answered topics: ${error.message}`)
  const ids = new Set<string>()
  for (const row of data ?? []) {
    const q = (row as { questions: unknown }).questions
    const one = Array.isArray(q) ? q[0] : q
    if (isRecord(one) && typeof one.topic_id === 'string') ids.add(one.topic_id)
  }
  return ids
}

const topicIds = (data: unknown): string[] =>
  ((data ?? []) as Array<Record<string, unknown>>).map((r) => String(r.topic_id))

test.describe('Red Team: admin dashboard RPC cross-org isolation (KY)', () => {
  let admin: Admin
  let egmontOrgId: string
  let otherOrgId: string
  let egmontAdmin: Client
  let crossOrgAdmin: Client
  let instructor: Client

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    await seedVictimResponses()
    await seedRedTeamAdmin()
    const cross = await seedCrossOrgAdmin()
    const inst = await seedRedTeamInstructor()
    egmontOrgId = await getEgmontOrgId(admin)
    otherOrgId = cross.orgId
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossOrgAdmin = await createAuthenticatedClient(cross.email, cross.password)
    instructor = await createAuthenticatedClient(inst.email, inst.password)
  })

  test('KY: KPI totals are scoped to the caller org', async () => {
    const egmontCount = await liveStudentCount(admin, egmontOrgId)
    const otherCount = await liveStudentCount(admin, otherOrgId)
    // Precondition: the two orgs differ, so a leaked count is observable.
    expect(egmontCount).not.toBe(otherCount)

    const own = await egmontAdmin.rpc(KPIS, kpiArgs)
    expect(own.error).toBeNull()
    expect(isRecord(own.data) && own.data.totalStudents).toBe(egmontCount)

    const foreign = await crossOrgAdmin.rpc(KPIS, kpiArgs)
    expect(foreign.error).toBeNull()
    expect(isRecord(foreign.data) && foreign.data.totalStudents).toBe(otherCount)
  })

  test('KY: weak topics carry only topics answered in the caller org', async () => {
    const otherExpected = await answeredTopicIds(admin, otherOrgId)

    const own = await egmontAdmin.rpc(WEAK, weakArgs)
    expect(own.error).toBeNull()
    const ownIds = topicIds(own.data)
    // Control: egmont rows exist and at least one is foreign to the other org.
    expect(ownIds.length).toBeGreaterThanOrEqual(1)
    expect(ownIds.some((id) => !otherExpected.has(id))).toBe(true)

    const foreign = await crossOrgAdmin.rpc(WEAK, weakArgs)
    expect(foreign.error).toBeNull()
    const leaked = topicIds(foreign.data).filter((id) => !otherExpected.has(id))
    expect(leaked).toEqual([])
  })

  test('KY: an instructor is forbidden on both RPCs', async () => {
    for (const [fn, args] of [
      [KPIS, kpiArgs],
      [WEAK, weakArgs],
    ] as const) {
      const { data, error } = await instructor.rpc(fn, args)
      expect(error?.message ?? '', fn).toMatch(/forbidden/i)
      expect(data, fn).toBeNull()
    }
  })
})
