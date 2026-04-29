/**
 * Red Team Spec: internal_exam_codes Table — RLS Read/Write Isolation
 *
 * Vectors BE / BF / BG (HIGH): direct table access on internal_exam_codes.
 *  - BE: unauthenticated SELECT must return 0 rows (or error).
 *  - BF: authenticated student INSERT/UPDATE/DELETE must be blocked at the
 *        RLS layer (no INSERT/DELETE policy; UPDATE policy gates on is_admin()).
 *  - BG: student-B SELECT of student-A's code row must return 0 rows.
 *
 * Status: Expected to PASS — table has RLS enabled, no INSERT/DELETE policy,
 * UPDATE policy requires is_admin(). If any assertion fails it is an RLS gap.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

test.describe('Red Team: internal_exam_codes table RLS', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let admin: ReturnType<typeof getAdminClient>
  let victimCodeId: string
  let victimCodeText: string
  let attackerCodeId: string

  test.beforeAll(async () => {
    const { attackerUserId, victimUserId, orgId } = await seedRedTeamUsers()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    admin = getAdminClient()

    // Resolve a real subject from egmont-aviation
    const { data: subjects } = await admin.from('easa_subjects').select('id').limit(1)
    if (!subjects || subjects.length === 0) {
      throw new Error('seed: no easa_subjects rows available for red-team setup')
    }
    const subjectId = subjects[0]!.id

    // Seed two active codes (one per student) directly via service-role.
    // Direct INSERT bypasses RLS — that's fine; we're constructing fixture data,
    // not exercising the issue RPC here.
    victimCodeText = `RT${Date.now().toString(36).toUpperCase().slice(-6)}V`
    const { data: vRow, error: vErr } = await admin
      .from('internal_exam_codes')
      .insert({
        code: victimCodeText,
        subject_id: subjectId,
        student_id: victimUserId,
        issued_by: victimUserId, // not exercised by RLS, just FK satisfaction
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        organization_id: orgId,
      })
      .select('id')
      .single()
    if (vErr || !vRow) throw new Error(`Could not seed victim code: ${vErr?.message}`)
    victimCodeId = vRow.id

    const attackerCodeText = `RT${Date.now().toString(36).toUpperCase().slice(-6)}A`
    const { data: aRow, error: aErr } = await admin
      .from('internal_exam_codes')
      .insert({
        code: attackerCodeText,
        subject_id: subjectId,
        student_id: attackerUserId,
        issued_by: attackerUserId,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        organization_id: orgId,
      })
      .select('id')
      .single()
    if (aErr || !aRow) throw new Error(`Could not seed attacker code: ${aErr?.message}`)
    attackerCodeId = aRow.id
  })

  test('unauthenticated client sees 0 rows from internal_exam_codes (Vector BE)', async () => {
    const { data, error } = await unauthClient
      .from('internal_exam_codes')
      .select('id, code, student_id')
      .limit(50)

    // RLS returns empty for anon — not an error
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('student-B cannot SELECT student-A code via direct table read (Vector BG)', async () => {
    // Attacker probes by victim code id — the only allowed SELECT path is
    // student_read_active_codes (student_id = auth.uid()) or admin policy. The
    // attacker is neither; result must be 0 rows.
    const { data, error } = await attackerClient
      .from('internal_exam_codes')
      .select('id, code, student_id')
      .eq('id', victimCodeId)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('student sees only their own active code via direct SELECT', async () => {
    // Sanity: the policy correctly admits the student's own row.
    const { data, error } = await attackerClient
      .from('internal_exam_codes')
      .select('id, student_id')
      .eq('id', attackerCodeId)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(1)
  })

  test('student cannot INSERT directly into internal_exam_codes (Vector BF)', async () => {
    // Table has no INSERT policy and no INSERT GRANT to authenticated.
    // The attempt must fail with an RLS / permission error — never silently succeed.
    const { data: meRes } = await attackerClient.auth.getUser()
    const myId = meRes?.user?.id ?? ''
    const { data: subjects } = await admin.from('easa_subjects').select('id').limit(1)
    if (!subjects || subjects.length === 0) {
      throw new Error('seed: no easa_subjects rows available for INSERT vector')
    }
    const subjectId = subjects[0]!.id
    const { data: org } = await admin
      .from('users')
      .select('organization_id')
      .eq('id', myId)
      .single()
    const orgId = org?.organization_id

    const forgedCode = `FORGED${Date.now().toString(36).toUpperCase().slice(-4)}`
    const { error } = await attackerClient.from('internal_exam_codes').insert({
      code: forgedCode,
      subject_id: subjectId,
      student_id: myId,
      issued_by: myId,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      organization_id: orgId,
    })

    // Must error (no INSERT GRANT). PostgREST returns code 42501 (permission denied)
    // or RLS-violation error. Either way, error must not be null.
    expect(error).not.toBeNull()

    // Belt-and-braces: verify no row with this code exists in the DB.
    const { data: probe } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('code', forgedCode)
    expect(probe?.length ?? 0).toBe(0)
  })

  test('student cannot UPDATE another student code via direct write (Vector BF)', async () => {
    // UPDATE policy requires is_admin(); student attempts must be silently
    // filtered (0 rows affected) per RLS USING clause behaviour — verify the
    // row is unchanged in the DB.
    const { data: before } = await admin
      .from('internal_exam_codes')
      .select('voided_at, void_reason')
      .eq('id', victimCodeId)
      .single()

    await attackerClient
      .from('internal_exam_codes')
      .update({ voided_at: new Date().toISOString(), void_reason: 'red team forge' })
      .eq('id', victimCodeId)

    const { data: after } = await admin
      .from('internal_exam_codes')
      .select('voided_at, void_reason')
      .eq('id', victimCodeId)
      .single()

    expect(after?.voided_at ?? null).toEqual(before?.voided_at ?? null)
    expect(after?.void_reason ?? null).toEqual(before?.void_reason ?? null)
  })

  test('student cannot UPDATE their own code (admin-only UPDATE policy) (Vector BF)', async () => {
    // Even on rows the student can SELECT (their own active code), the UPDATE
    // policy gates on is_admin(). A student updating their own row must result
    // in zero affected rows — no privilege escalation via own-row mutation.
    const { data: before } = await admin
      .from('internal_exam_codes')
      .select('void_reason')
      .eq('id', attackerCodeId)
      .single()

    await attackerClient
      .from('internal_exam_codes')
      .update({ void_reason: 'self-void attempt' })
      .eq('id', attackerCodeId)

    const { data: after } = await admin
      .from('internal_exam_codes')
      .select('void_reason')
      .eq('id', attackerCodeId)
      .single()

    expect(after?.void_reason ?? null).toEqual(before?.void_reason ?? null)
  })

  test('student cannot DELETE rows from internal_exam_codes (Vector BF)', async () => {
    // No DELETE policy and no DELETE GRANT — attempts must error or be no-ops.
    await victimClient.from('internal_exam_codes').delete().eq('id', victimCodeId)

    // Verify row still exists.
    const { data: after } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('id', victimCodeId)
      .maybeSingle()
    expect(after?.id).toBe(victimCodeId)
  })
})
