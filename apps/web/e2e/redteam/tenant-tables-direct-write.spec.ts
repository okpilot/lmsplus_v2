/**
 * Red Team Spec: direct PostgREST writes to the tenant tables (Vector FJ).
 *
 * `organizations` and `question_banks` carry no permissive INSERT, UPDATE or
 * DELETE policy and `authenticated` holds no write privilege on them
 * (mig 20260820000100, 20260925000300). Every verb is denied at the privilege
 * layer: 42501 + PERMISSION_DENIED, before RLS or any constraint runs.
 *
 * Arms:
 *   - question_banks — INSERT runs against org B, which the setup keeps
 *     bank-free (UNIQUE (organization_id) is per org), so the write is not
 *     shadowed by 23505. UPDATE/DELETE use org A's own childless bank.
 *   - organizations — UPDATE, soft-delete UPDATE, INSERT, DELETE.
 *
 * Assertion shapes.
 *   - UPDATE/DELETE arms assert 42501 and read the row back through the
 *     SERVICE-ROLE client to prove it is untouched.
 *   - INSERT arms assert 42501 on a FULLY VALID row (created_by is NOT NULL
 *     REFERENCES users(id)) and prove via service-role that no marker-tagged
 *     row was created.
 *
 * Non-vacuity (code-style.md §7). Positive controls: an in-org student can
 * still SELECT its own organizations and question_banks rows, and the
 * service-role client can still write. They are declared FIRST — Playwright
 * runs in-file tests in declaration order (workers: 1, fullyParallel: false),
 * so they observe pristine fixtures.
 *
 * Admin arm. An authenticated ADMIN is denied too: requireAdmin() returns an
 * RLS-bound client and these tables have no is_admin() write policy.
 *
 * Hermeticity (code-style.md §7). Every row attacked is one this spec created,
 * in an org this spec owns. Nothing here touches egmont-aviation or
 * redteam-other-org. Org A's bank is upserted rather than recreated because
 * UNIQUE (organization_id) is non-partial, so a soft-deleted bank still holds
 * the slot.
 *
 * Status: Expected to PASS (defenses should hold).
 * A failure means the tenant tables are writable by non-service-role callers.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_TW_ADMIN_A_EMAIL,
  E2E_REDTEAM_TW_ORG_A_SLUG,
  E2E_REDTEAM_TW_ORG_B_SLUG,
  E2E_REDTEAM_TW_STUDENT_A_EMAIL,
  E2E_REDTEAM_TW_STUDENT_B_EMAIL,
  E2E_REDTEAM_TW_MARKER as MARKER,
  E2E_REDTEAM_TW_PASSWORD as PASSWORD,
} from './helpers/seed-markers'

/**
 * mig 20260925000300 revokes INSERT/UPDATE/DELETE on both tables from
 * authenticated — every write arm below is denied at the privilege layer
 * (42501, "permission denied for table") before RLS is evaluated. An RLS
 * WITH CHECK failure is also 42501: the message tells the two layers apart.
 */
const PERMISSION_DENIED = /permission denied for (table|view)/i

/**
 * Resolve (or atomically create) one of this spec's throwaway orgs. Idempotent
 * upsert on the UNIQUE `slug` column so parallel Playwright workers cannot race
 * a check-then-insert into a duplicate-key crash. `deleted_at: null`
 * un-soft-deletes the row if a prior run ever removed it — slug's UNIQUE is
 * non-partial, so a soft-deleted row still holds the slot.
 */
async function upsertSpecOrg(
  admin: ReturnType<typeof getAdminClient>,
  slug: string,
  name: string,
): Promise<string> {
  const { data, error } = await admin
    .from('organizations')
    // `settings: {}` keeps the fixture pristine: the organizations UPDATE arm
    // attacks that column, so after any run where the migration was ABSENT the
    // forged payload would otherwise persist into the next run. Non-vacuity does
    // NOT depend on this reset — the arm reads `before` fresh at test time and
    // writes a per-run unique value, so a successful write always changes the
    // comparison. This is hygiene on a spec-owned row, not the guard.
    .upsert({ name, slug, settings: {}, deleted_at: null }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not upsert spec org ${slug}: ${error?.message}`)
  return data.id as string
}

test.describe('Red Team: direct writes to the tenant tables (Vector FJ)', () => {
  // Declaration order is load-bearing — the positive controls must run before
  // any mutating arm. `default` pins in-order execution even under a parallel
  // parent. NOT `serial`: serial skips all later tests after one failure, which
  // hides independent arms behind the first regression.
  test.describe.configure({ mode: 'default' })

  let adminClient: ReturnType<typeof getAdminClient>
  let studentA: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let studentB: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminUserA: Awaited<ReturnType<typeof createAuthenticatedClient>>

  let orgAId = ''
  let orgBId = ''
  let studentAId = ''
  let studentBId = ''

  // Every attacked row is one this spec created (see the hermeticity note).
  let bankAId = ''

  const ORIGINAL_BANK_DESCRIPTION = `${MARKER} bank-a original description`

  test.beforeAll(async () => {
    adminClient = getAdminClient()

    orgAId = await upsertSpecOrg(adminClient, E2E_REDTEAM_TW_ORG_A_SLUG, `${MARKER} Org A`)
    orgBId = await upsertSpecOrg(adminClient, E2E_REDTEAM_TW_ORG_B_SLUG, `${MARKER} Org B`)

    studentAId = await upsertUser(
      adminClient,
      E2E_REDTEAM_TW_STUDENT_A_EMAIL,
      PASSWORD,
      orgAId,
      'student',
    )
    studentBId = await upsertUser(
      adminClient,
      E2E_REDTEAM_TW_STUDENT_B_EMAIL,
      PASSWORD,
      orgBId,
      'student',
    )
    await upsertUser(adminClient, E2E_REDTEAM_TW_ADMIN_A_EMAIL, PASSWORD, orgAId, 'admin')

    // Org B carries no bank of its own. Stray rows are SOFT-deleted, not hard-
    // deleted: question_banks is soft-deletable and has FK children through
    // questions.bank_id, so a hard DELETE would violate security.md rule 6 and
    // risk 23503. UNIQUE (organization_id) is non-partial, so a soft-deleted
    // stray still holds the slot.
    const { data: strayBanks, error: strayError } = await adminClient
      .from('question_banks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', orgBId)
      .is('deleted_at', null)
      .select('id')
    if (strayError) throw new Error(`Could not retire org B banks: ${strayError.message}`)
    if ((strayBanks?.length ?? 0) > 0) {
      console.log(`[FJ setup] retired ${strayBanks?.length} stray bank(s) from org B`)
    }

    // Org A's bank is UPSERTED, not recreated: UNIQUE (organization_id) is
    // non-partial, so a soft-deleted bank would still hold the slot.
    const { data: bank, error: bankError } = await adminClient
      .from('question_banks')
      .upsert(
        {
          organization_id: orgAId,
          name: `${MARKER} Bank A`,
          description: ORIGINAL_BANK_DESCRIPTION,
          created_by: studentAId,
          deleted_at: null,
        },
        { onConflict: 'organization_id' },
      )
      .select('id')
      .single()
    if (bankError || !bank) throw new Error(`Could not upsert bank A: ${bankError?.message}`)
    bankAId = bank.id as string

    studentA = await createAuthenticatedClient(E2E_REDTEAM_TW_STUDENT_A_EMAIL, PASSWORD)
    studentB = await createAuthenticatedClient(E2E_REDTEAM_TW_STUDENT_B_EMAIL, PASSWORD)
    adminUserA = await createAuthenticatedClient(E2E_REDTEAM_TW_ADMIN_A_EMAIL, PASSWORD)
  })

  test.afterAll(async () => {
    // Per-step isolation with an error accumulator (code-style.md §7): a throw
    // in one step must not skip the rest and leak rows into the next spec.
    const errors: string[] = []

    // Bank A is restored, not deleted — UNIQUE (organization_id) is non-partial
    // and the next run upserts the same row.
    try {
      const { data, error } = await adminClient
        .from('question_banks')
        .update({ description: ORIGINAL_BANK_DESCRIPTION, deleted_at: null })
        .eq('organization_id', orgAId)
        .select('id')
      if (error) throw new Error(error.message)
      if ((data?.length ?? 0) > 0) {
        console.log(`[FJ cleanup] restored ${data?.length} bank row(s)`)
      }
    } catch (e) {
      errors.push(`bank restore: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Org A is attacked on two columns (settings, deleted_at) and must be
    // restored to what upsertSpecOrg seeds, exactly as the bank above is. On a
    // GREEN run both writes were denied and this is a no-op; on a run where the
    // migration is absent or regressed they succeeded, and without this step a
    // forged settings payload and a non-null deleted_at would survive into
    // every downstream spec in the same Playwright run. Independent of the
    // steps above, so it takes no errors.length gate.
    try {
      const { data, error } = await adminClient
        .from('organizations')
        .update({ settings: {}, deleted_at: null })
        .eq('id', orgAId)
        .select('id')
      if (error) throw new Error(error.message)
      if ((data?.length ?? 0) > 0) {
        console.log(`[FJ cleanup] restored org A (${data?.length} row)`)
      }
    } catch (e) {
      errors.push(`org restore: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // ------------------------------------------------- positive controls (§7)

  test('a student can still read their own organisation', async () => {
    const { data, error } = await studentA
      .from('organizations')
      .select('id')
      .eq('id', orgAId)
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBe(orgAId)
  })

  test('a student can still read their own question bank', async () => {
    const { data, error } = await studentA.from('question_banks').select('id').eq('id', bankAId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
  })

  test('the service-role client can still write a tenant table', async () => {
    // Without this, every denial arm below would also pass on a database where
    // these tables were unreachable for an unrelated reason. service_role holds
    // BYPASSRLS, so reachability is a property of the connection, not of which
    // table it touches.
    const { data: updated, error: updateError } = await adminClient
      .from('question_banks')
      .update({ description: ORIGINAL_BANK_DESCRIPTION })
      .eq('id', bankAId)
      .select('id')
    expect(updateError).toBeNull()
    expect(updated ?? []).toHaveLength(1)
  })
  // --------------------------------------------------------- question_banks

  test('a student cannot create a question bank in their own organisation', async () => {
    // Runs as student B, whose org the setup keeps bank-free — so on a freshly
    // reset database this INSERT succeeded pre-fix rather than tripping
    // UNIQUE (organization_id). See the beforeAll note for the exception.
    const marker = `${MARKER} forged bank ${Date.now()}`
    const { error } = await studentB.from('question_banks').insert({
      organization_id: orgBId,
      name: marker,
      created_by: studentBId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: created, error: readError } = await adminClient
      .from('question_banks')
      .select('id')
      .eq('name', marker)
    expect(readError).toBeNull()
    expect(created ?? []).toHaveLength(0)
  })

  test('a student cannot edit a question bank in their own organisation', async () => {
    const { error: updateError } = await studentA
      .from('question_banks')
      .update({ description: `${MARKER} forged description` })
      .eq('id', bankAId)
      .select('id')
    expect(updateError?.code).toBe('42501')
    expect(updateError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('question_banks')
      .select('description')
      .eq('id', bankAId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.description).toBe(ORIGINAL_BANK_DESCRIPTION)
  })

  test('a student cannot delete a question bank in their own organisation', async () => {
    const { error: deleteError } = await studentA
      .from('question_banks')
      .delete()
      .eq('id', bankAId)
      .select('id')
    expect(deleteError?.code).toBe('42501')
    expect(deleteError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('question_banks')
      .select('id, deleted_at')
      .eq('id', bankAId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.id).toBe(bankAId)
    expect(after?.deleted_at).toBeNull()
  })

  // ---------------------------------------------------------- organizations

  test('a student cannot modify their own organisation record', async () => {
    const { data: before, error: beforeError } = await adminClient
      .from('organizations')
      .select('settings')
      .eq('id', orgAId)
      .single()
    expect(beforeError).toBeNull()

    // Per-run unique payload so `before` can never coincidentally equal it.
    const { error: updateError } = await studentA
      .from('organizations')
      .update({ settings: { forged: Date.now() } })
      .eq('id', orgAId)
      .select('id')
    expect(updateError?.code).toBe('42501')
    expect(updateError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('organizations')
      .select('settings')
      .eq('id', orgAId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.settings).toEqual(before?.settings)
  })

  test('a student cannot retire their own organisation', async () => {
    // The sharpest pre-fix primitive: organizations' WITH CHECK keyed on `id`
    // alone, with no deleted_at conjunct, so the post-image still satisfied it
    // and this UPDATE succeeded. Tenant-root tampering, not a DoS — one
    // production read gates on this column and it degrades gracefully.
    const { error: updateError } = await studentA
      .from('organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', orgAId)
      .select('id')
    expect(updateError?.code).toBe('42501')
    expect(updateError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('organizations')
      .select('deleted_at')
      .eq('id', orgAId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.deleted_at).toBeNull()
  })

  test('a student cannot create an organisation', async () => {
    // ERROR-CODE FLIP arm (see header): pre-fix this was a PK collision,
    // because organizations' WITH CHECK constrains the primary key itself, so
    // the only row satisfying it is one whose id already exists. Post-fix there
    // is no INSERT privilege at all, so it is refused as 42501 first.
    const { error } = await studentA
      .from('organizations')
      .insert({ id: orgAId, name: `${MARKER} forged org`, slug: `${MARKER}-forged-${Date.now()}` })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(PERMISSION_DENIED)
  })

  test('a student cannot delete their own organisation', async () => {
    // Pre-fix the policy passed and a child FK raised 23503; now the privilege
    // layer denies DELETE before RLS or any FK check is reached.
    const { error: deleteError } = await studentA
      .from('organizations')
      .delete()
      .eq('id', orgAId)
      .select('id')
    expect(deleteError?.code).toBe('42501')
    expect(deleteError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('organizations')
      .select('id')
      .eq('id', orgAId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.id).toBe(orgAId)
  })

  // ------------------------------------------------------------ admin arms

  test('an authenticated admin cannot retire an organisation through the RLS-bound client', async () => {
    // Second admin arm, varying BOTH axes from the one above (different table,
    // different verb) — see the header note on why the pair is representative
    // rather than exhaustive. This is also the sharpest pre-fix primitive: the
    // organizations WITH CHECK keyed on `id` alone, so a soft-delete UPDATE
    // satisfied it. An admin is denied it now for the same reason a student is:
    // there is no permissive UPDATE policy at all.
    const { error: updateError } = await adminUserA
      .from('organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', orgAId)
      .select('id')
    expect(updateError?.code).toBe('42501')
    expect(updateError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('organizations')
      .select('deleted_at')
      .eq('id', orgAId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.deleted_at).toBeNull()
  })
})
