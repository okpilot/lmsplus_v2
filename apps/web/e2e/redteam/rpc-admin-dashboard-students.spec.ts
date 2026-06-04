/**
 * Red Team Spec: get_admin_dashboard_students RPC (#685, #481)
 *
 * SECURITY DEFINER RPC backing the admin student roster (join + filter + sort +
 * paginate + count). Auth is verified at the DB level (#682); this spec pins the
 * regression coverage.
 *  - BY1 (privilege escalation): unauthenticated → 'not authenticated';
 *    student → 'forbidden'; instructor → 'forbidden' (the load-bearing case —
 *    instructors are authenticated + org-scoped, gated only by is_admin()).
 *  - BZ1 (cross-org isolation): a cross-org admin sees only their own org's
 *    students — never the egmont victim.
 *  - positive: the egmont admin sees their own org's roster (incl. the victim).
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

type RosterRow = { id: string; full_name: string; total_count: number }

const RPC = 'get_admin_dashboard_students'
const args = { p_limit: 100, p_offset: 0 }

test.describe('Red Team: get_admin_dashboard_students RPC', () => {
  let victimUserId: string
  let adminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let instructorClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let crossOrgAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>

  test.beforeAll(async () => {
    getAdminClient() // ensure service-role env is present early
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId

    const admin = await seedRedTeamAdmin()
    const instructor = await seedRedTeamInstructor()
    const crossOrgAdmin = await seedCrossOrgAdmin()
    // Ensure the cross-org has at least one student, so the BZ1 isolation
    // assertion is non-vacuous (a cross-org admin with an empty roster would
    // pass `not.toContain` trivially).
    await createCrossOrgUser()

    adminClient = await createAuthenticatedClient(admin.email, admin.password)
    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    instructorClient = await createAuthenticatedClient(instructor.email, instructor.password)
    crossOrgAdminClient = await createAuthenticatedClient(
      crossOrgAdmin.email,
      crossOrgAdmin.password,
    )
  })

  test('BY1: an unauthenticated caller is rejected', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc(RPC, args)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data).toBeNull()
  })

  test('BY1: a student caller is forbidden', async () => {
    const { data, error } = await studentClient.rpc(RPC, args)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/forbidden/i)
    expect(data).toBeNull()
  })

  test('BY1: an instructor caller is forbidden (only is_admin() gates the RPC)', async () => {
    const { data, error } = await instructorClient.rpc(RPC, args)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/forbidden/i)
    expect(data).toBeNull()
  })

  test('BZ1: a cross-org admin never sees the egmont org students', async () => {
    const { data, error } = await crossOrgAdminClient.rpc(RPC, args)
    expect(error).toBeNull()
    const rows = (data ?? []) as RosterRow[]
    // Non-vacuous: the cross-org admin sees their own org's students...
    expect(rows.length).toBeGreaterThan(0)
    // ...but never an egmont student (org is derived from auth.uid()).
    expect(rows.map((r) => r.id)).not.toContain(victimUserId)
  })

  test('positive: the egmont admin sees their own org roster including the victim', async () => {
    const { data, error } = await adminClient.rpc(RPC, args)
    expect(error).toBeNull()
    const rows = (data ?? []) as RosterRow[]
    expect(rows.map((r) => r.id)).toContain(victimUserId)
  })
})
