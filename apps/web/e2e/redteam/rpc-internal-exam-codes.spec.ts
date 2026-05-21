/**
 * Red Team Spec: internal_exam_codes Table — RLS Read/Write Isolation
 *
 * Vectors BE / BF / BG (HIGH): direct table access on internal_exam_codes.
 *  - BE: unauthenticated SELECT must return 0 rows (or error).
 *  - BF: authenticated student INSERT/UPDATE/DELETE must be blocked. After
 *        migration 20260521000004 the student SELECT and admin UPDATE policies
 *        were dropped and UPDATE was revoked from `authenticated`, so direct
 *        writes fail at the privilege layer in addition to RLS.
 *  - BG: any direct SELECT (own row or cross-student) returns 0 rows — the
 *        only read path is `list_my_active_internal_exam_codes()` RPC, whose
 *        return signature omits the plaintext `code` column.
 *
 * Status: Expected to PASS — table has RLS enabled, no INSERT/DELETE/UPDATE
 * policy for the authenticated role, and the student SELECT policy was
 * dropped in favour of the RPC. If any assertion fails it is an RLS gap.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
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

    // Resolve a real subject from egmont-aviation (with active questions, so the
    // FK target is a real, exam-eligible subject — not a taxonomy-only stub).
    const { subjectId } = await pickSubjectWithQuestions(admin, { orgId })

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

  test('student direct SELECT on own active code now returns 0 rows (RPC is the only read path) (Vector BG)', async () => {
    // Migration 20260521000004 dropped the `student_read_active_codes` SELECT
    // policy. With no SELECT policy admitting the authenticated role, every
    // direct PostgREST read returns 0 rows — including the student's own
    // active code. Reads must go through `list_my_active_internal_exam_codes`.
    const { data, error } = await attackerClient
      .from('internal_exam_codes')
      .select('id, student_id')
      .eq('id', attackerCodeId)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('list_my_active_internal_exam_codes RPC returns active codes without the code column', async () => {
    // The RPC is the only sanctioned read path. It must (a) return at least
    // one row for the calling student's own active code, and (b) omit the
    // plaintext `code` column from every returned row so PostgREST cannot
    // leak it via direct table access either.
    const { data, error } = await attackerClient.rpc('list_my_active_internal_exam_codes')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = (data ?? []) as Array<Record<string, unknown>>
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('code')
    }
  })

  test('student cannot INSERT directly into internal_exam_codes (Vector BF)', async () => {
    // Table has no INSERT policy and no INSERT GRANT to authenticated.
    // The attempt must fail with an RLS / permission error — never silently succeed.
    const { data: meRes } = await attackerClient.auth.getUser()
    const myId = meRes?.user?.id
    if (!myId) throw new Error('seed: attackerClient has no authenticated user')
    const { data: org } = await admin
      .from('users')
      .select('organization_id')
      .eq('id', myId)
      .single()
    const orgId = org?.organization_id
    if (!orgId) throw new Error('seed: attacker user has no organization_id')
    const { subjectId } = await pickSubjectWithQuestions(admin, { orgId })

    const forgedCode = `FORGED${Date.now().toString(36).toUpperCase().slice(-4)}`
    const { error } = await attackerClient.from('internal_exam_codes').insert({
      code: forgedCode,
      subject_id: subjectId,
      student_id: myId,
      issued_by: myId,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      organization_id: orgId,
    })

    // Must error with a permission/RLS class — not a NOT NULL or FK error
    // that would mean the test is "passing" for the wrong reason.
    expect(error).not.toBeNull()
    expect(
      error?.code === '42501' ||
        /permission denied|row-level security|rls/i.test(error?.message ?? ''),
    ).toBe(true)

    // Belt-and-braces: verify no row with this code exists in the DB.
    const { data: probe } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('code', forgedCode)
    expect(probe?.length ?? 0).toBe(0)
  })

  test('student cannot UPDATE another student code via direct write (Vector BF)', async () => {
    // Migration 20260521000004 dropped the `admin_update_org_codes` policy and
    // executed `REVOKE UPDATE ON internal_exam_codes FROM authenticated`. The
    // attempt now fails at the GRANT layer (privilege denied) — and even if a
    // future regression restored the GRANT, no UPDATE policy exists to admit
    // the row. Verify the row is unchanged in the DB regardless of which
    // layer rejected the write.
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

  test('student cannot UPDATE their own code (no UPDATE policy, GRANT revoked) (Vector BF)', async () => {
    // After migration 20260521000004 there is no UPDATE policy on
    // `internal_exam_codes` for the authenticated role AND
    // `REVOKE UPDATE ... FROM authenticated` was executed. A student updating
    // their own row must result in zero affected rows — defense in depth via
    // (1) no policy admitting the write and (2) no GRANT permitting the verb.
    // The student also cannot SELECT the row directly any more, but the
    // service-role probe below still verifies no mutation occurred.
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
