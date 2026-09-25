/**
 * Red Team Spec: direct PostgREST writes to the tenant tables (Vector FJ).
 *
 * DEFECT this spec guards. `tenant_isolation` on `organizations`,
 * `question_banks`, `courses` and `lessons` was created in mig 001 with no FOR
 * clause, which in Postgres means FOR ALL — it governed SELECT, INSERT, UPDATE
 * and DELETE. Unlike `questions` (Vector EX), these four carry NO OTHER POLICY
 * AT ALL, so the unqualified policy was not merely overriding a role gate — it
 * WAS the entire access control, and write access was scoped only by org
 * membership. Every authenticated in-org user satisfied it.
 *
 * Measured on production 2026-08-20 before the fix: `authenticated` holds
 * INSERT, UPDATE and DELETE on all four tables (information_schema.role_table_
 * grants), and pg_policies returned exactly one FOR ALL policy per table. RLS
 * was the only thing standing between an in-org student and these rows.
 *
 * Migration 20260820000100 re-emits all four as FOR SELECT with byte-identical
 * USING predicates, leaving per table:
 *   SELECT — tenant_isolation (unchanged; no read regression)
 *   INSERT — no permissive policy
 *   UPDATE — no permissive policy
 *   DELETE — no permissive policy (security.md rule 6: never hard DELETE)
 *
 * Which arms exist, and why the matrix is not verb × table. Several cells are
 * rejected by a CONSTRAINT before the policy is ever the deciding factor, so an
 * arm written there proves less than it appears to:
 *   - courses / lessons — all three verbs genuinely flip: the write SUCCEEDS
 *     pre-fix and is denied post-fix. These are the load-bearing arms and the
 *     ones the mutation check is anchored on.
 *   - question_banks — same, but only because this spec owns its orgs. UNIQUE
 *     (organization_id) (mig 20260327000062:11) is PER ORG: the INSERT arm runs
 *     against org B, which the setup keeps bank-free, so WITH CHECK passes
 *     pre-fix with no 23505 behind it. That holds on a freshly reset database;
 *     the beforeAll note states the one case where it does not, and the
 *     mutation check is anchored elsewhere so it does not matter. The
 *     UPDATE/DELETE arms use org A's own childless bank, so DELETE is not
 *     shadowed by questions.bank_id.
 *   - organizations UPDATE — genuinely flips.
 *   - organizations INSERT / DELETE — ERROR-CODE FLIPS ONLY pre-mig-20260820000100:
 *     the RLS policy PASSED and a constraint rejected (a PK collision for
 *     INSERT; 23503 for DELETE, from 11 NOT NULL child FKs). mig
 *     20260925000300 (below) moots the distinction: every verb on all four
 *     tables is now denied at the PRIVILEGE layer before RLS or any
 *     constraint runs, so INSERT/UPDATE/DELETE all assert 42501 the same way.
 *
 * That WITH CHECK is evaluated before the unique index — the premise behind
 * calling those cells constraint-shadowed — was measured, not reasoned: in a
 * rolled-back transaction on 2026-08-20, a question_banks INSERT into an org
 * that ALREADY held a bank raised 23505 under the old policy and 42501 under
 * the new one. That scenario is deliberately NOT the one this spec ships: its
 * INSERT arm runs against bank-free org B, where the same INSERT SUCCEEDED
 * pre-fix, which is what makes that arm a true flip rather than a shape change
 * — on a freshly reset database. See the beforeAll note for the one case that
 * degrades it to a shape flip. The mutation check does NOT reset: it reverts
 * the four policies in the live local DB, so it is anchored on the
 * courses/lessons arms, whose tables carry no UNIQUE constraint and so cannot
 * degrade. attack-surface.md records the ordering trap if you do reset.
 *
 * Assertion shapes (updated for mig 20260925000300 — see PERMISSION_DENIED
 * above; this supersedes the RLS-era "error === null AND 0 rows" shape a
 * prior revision of this header described).
 *   - Every UPDATE/DELETE arm asserts 42501 + PERMISSION_DENIED — the
 *     privilege layer rejects before RLS is reached. A before/after read
 *     through the SERVICE-ROLE client, showing the attacked column or row
 *     untouched, remains the PRIMARY proof: an error code alone is weaker
 *     evidence than an unchanged row, since a wrong code could still coincide
 *     with a mutation on a misconfigured client.
 *   - INSERT denial is also 42501 + PERMISSION_DENIED, asserted on a FULLY
 *     VALID row (created_by is NOT NULL REFERENCES users(id) on all three
 *     writable tables, so a thin fixture fails 23502/23503 and the arm would
 *     pass for the wrong reason). Each INSERT arm also proves via service-role
 *     that no marker-tagged row was created.
 *
 * Non-vacuity (code-style.md §7). Positive controls cover ALL FOUR tables —
 * an in-org student can still SELECT its own organizations, question_banks,
 * courses and lessons rows through the RLS-bound client — plus a service-role
 * write control. Read regression is the only real risk of this migration, so
 * the read controls are the ones that would catch it.
 *
 * They are declared FIRST, and that ordering is load-bearing. Playwright runs
 * in-file tests in declaration order (workers: 1, fullyParallel: false), so
 * running them before any denial arm guarantees they observe pristine fixtures.
 * Declared last, the question_banks read control would sit downstream of the
 * question_banks DELETE arm — which, on a database where the migration is
 * ABSENT, really does delete that bank — so it would go red for a FIXTURE
 * reason during the very mutation check whose job is to prove the denial arms
 * fail for the RIGHT reason. Ordering them first keeps the mutation-check
 * result clean: every red is a denial arm, every green is a control.
 *
 * Admin arms. An authenticated ADMIN is denied too. requireAdmin() returns an
 * RLS-bound client and these four have no is_admin() write policy to fall back
 * on — the disanalogy with `questions`. That consequence is deliberate, so it
 * is pinned as a tested contract rather than left as prose.
 *
 * Two arms, deliberately REPRESENTATIVE rather than exhaustive, and the reason
 * is structural: after the migration NONE of the four tables has a permissive
 * write policy of any kind, so admin denial is one absence, not twelve
 * independent behaviours. The 13 student arms above are what establish that the
 * gate closes per table and per verb; these two establish only the orthogonal
 * fact that ROLE does not change the answer. They therefore vary both axes —
 * different table AND different verb (courses/INSERT, organizations/UPDATE) —
 * rather than restating one cell four times. Do not read the pair as coverage
 * of 4 tables × 3 verbs for admins; it is not, and does not need to be.
 *
 * Hermeticity (code-style.md §7). Every row attacked is one this spec created,
 * in an org this spec owns. Nothing here touches egmont-aviation or
 * redteam-other-org. That is load-bearing for the mutation check: with the
 * migration absent the UPDATE and DELETE probes really do mutate, and a shared
 * target would corrupt state every downstream spec depends on. Org A's bank is
 * upserted rather than recreated because UNIQUE (organization_id) is
 * non-partial, so a soft-deleted bank still holds the slot.
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
 * mig 20260925000300 revokes INSERT/UPDATE/DELETE on all four tables from
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
  // Declaration order is load-bearing here — the positive controls must run
  // before any mutating arm (see the header). Today that is guaranteed by
  // playwright.config.ts (`workers: 1`, `fullyParallel: false`), which is
  // PROJECT-WIDE config a future change could flip. `default` pins in-order
  // execution locally even under a parallel parent, which is the whole of what
  // this suite needs.
  //
  // NOT `serial`, deliberately: serial ALSO installs a skip cascade — "if one
  // of the tests fails, all subsequent tests are skipped" (playwright
  // types/test.d.ts:3638). That would destroy the mutation check this spec is
  // built around. Reverting the four policies is supposed to yield 15 red and
  // 5 green; under serial it yields 5 passed, 1 failed and 14 SKIPPED, so the
  // engineered clean split becomes unobservable. It would also hide 14 arms
  // behind the first regression in ordinary CI — exactly when a red-team spec
  // is doing its job. internal-exam-lifecycle.spec.ts:32 uses serial because
  // its arms genuinely share exam-code state; these arms are independent and
  // must report independently.
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
  let courseUpdateTargetId = ''
  let courseDeleteTargetId = ''
  let lessonUpdateTargetId = ''
  let lessonDeleteTargetId = ''

  const ORIGINAL_BANK_DESCRIPTION = `${MARKER} bank-a original description`
  const ORIGINAL_COURSE_TITLE = `${MARKER} course update target`
  const ORIGINAL_LESSON_TITLE = `${MARKER} lesson update target`

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
    // risk 23503. Consequence to know before running a MUTATION CHECK:
    // UNIQUE (organization_id) is non-partial, so a soft-deleted stray still
    // holds the slot and the org-B INSERT arm would surface 23505 rather than a
    // successful write on a pre-fix database. Anchor the mutation check on the
    // courses/lessons arms, whose tables carry no such constraint.
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

    const { data: courses, error: coursesError } = await adminClient
      .from('courses')
      .insert([
        {
          organization_id: orgAId,
          title: ORIGINAL_COURSE_TITLE,
          subject: `${MARKER} subject`,
          created_by: studentAId,
        },
        {
          organization_id: orgAId,
          title: `${MARKER} course delete target`,
          subject: `${MARKER} subject`,
          created_by: studentAId,
        },
      ])
      .select('id')
    if (coursesError || courses?.length !== 2) {
      throw new Error(`Could not seed courses: ${coursesError?.message}`)
    }
    courseUpdateTargetId = courses[0].id as string
    courseDeleteTargetId = courses[1].id as string

    // course_id stays NULL on both lessons so courseDeleteTargetId is genuinely
    // CHILDLESS. lessons.course_id is NO ACTION, so a lesson pointing at it
    // would raise 23503 on the mutation run and the DELETE arm would go red for
    // a fixture reason while passing invisibly in the normal run.
    const { data: lessons, error: lessonsError } = await adminClient
      .from('lessons')
      .insert([
        {
          organization_id: orgAId,
          course_id: null,
          title: ORIGINAL_LESSON_TITLE,
          subject: `${MARKER} subject`,
          created_by: studentAId,
        },
        {
          organization_id: orgAId,
          course_id: null,
          title: `${MARKER} lesson delete target`,
          subject: `${MARKER} subject`,
          created_by: studentAId,
        },
      ])
      .select('id')
    if (lessonsError || lessons?.length !== 2) {
      throw new Error(`Could not seed lessons: ${lessonsError?.message}`)
    }
    lessonUpdateTargetId = lessons[0].id as string
    lessonDeleteTargetId = lessons[1].id as string

    studentA = await createAuthenticatedClient(E2E_REDTEAM_TW_STUDENT_A_EMAIL, PASSWORD)
    studentB = await createAuthenticatedClient(E2E_REDTEAM_TW_STUDENT_B_EMAIL, PASSWORD)
    adminUserA = await createAuthenticatedClient(E2E_REDTEAM_TW_ADMIN_A_EMAIL, PASSWORD)
  })

  test.afterAll(async () => {
    // Per-step isolation with an error accumulator (code-style.md §7): a throw
    // in one step must not skip the rest and leak rows into the next spec.
    const errors: string[] = []

    for (const table of ['lessons', 'courses'] as const) {
      try {
        const { data, error } = await adminClient
          .from(table)
          .update({ deleted_at: new Date().toISOString() })
          .eq('organization_id', orgAId)
          .is('deleted_at', null)
          .like('title', `${MARKER}%`)
          .select('id')
        if (error) throw new Error(error.message)
        if ((data?.length ?? 0) > 0) {
          console.log(`[FJ cleanup] retired ${data?.length} ${table} row(s)`)
        }
      } catch (e) {
        errors.push(`${table} cleanup: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

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

  test('a student can still read courses in their own organisation', async () => {
    const { data, error } = await studentA
      .from('courses')
      .select('id')
      .eq('organization_id', orgAId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  test('a student can still read lessons in their own organisation', async () => {
    const { data, error } = await studentA
      .from('lessons')
      .select('id')
      .eq('organization_id', orgAId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  test('the service-role client can still write a tenant table', async () => {
    // Without this, every denial arm below would also pass on a database where
    // these tables were unreachable for an unrelated reason. One table is enough
    // for that purpose: service_role holds BYPASSRLS, so reachability is a
    // property of the connection, not of which table it touches. The four READ
    // controls above are the ones that cover all four tables, because a read
    // regression IS per-table (each has its own USING predicate).
    const marker = `${MARKER} service-role control ${Date.now()}`
    const { data: course, error: insertError } = await adminClient
      .from('courses')
      .insert({
        organization_id: orgAId,
        title: marker,
        subject: `${MARKER} subject`,
        created_by: studentAId,
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()
    expect(course?.id).toBeTruthy()

    const { data: updated, error: updateError } = await adminClient
      .from('courses')
      .update({ description: `${MARKER} updated` })
      .eq('id', course?.id ?? '')
      .select('id')
    expect(updateError).toBeNull()
    expect(updated ?? []).toHaveLength(1)
  })
  // ---------------------------------------------------------------- courses

  test('a student cannot create a course in their own organisation', async () => {
    const marker = `${MARKER} forged course ${Date.now()}`
    const { error } = await studentA.from('courses').insert({
      organization_id: orgAId,
      title: marker,
      subject: `${MARKER} subject`,
      created_by: studentAId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: created, error: readError } = await adminClient
      .from('courses')
      .select('id')
      .eq('title', marker)
    expect(readError).toBeNull()
    expect(created ?? []).toHaveLength(0)
  })

  test('a student cannot rename a course in their own organisation', async () => {
    const { error: updateError } = await studentA
      .from('courses')
      .update({ title: `${MARKER} forged title` })
      .eq('id', courseUpdateTargetId)
      .select('id')
    expect(updateError?.code).toBe('42501')
    expect(updateError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('courses')
      .select('title')
      .eq('id', courseUpdateTargetId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.title).toBe(ORIGINAL_COURSE_TITLE)
  })

  test('a student cannot delete a course in their own organisation', async () => {
    const { error: deleteError } = await studentA
      .from('courses')
      .delete()
      .eq('id', courseDeleteTargetId)
      .select('id')
    expect(deleteError?.code).toBe('42501')
    expect(deleteError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('courses')
      .select('id, deleted_at')
      .eq('id', courseDeleteTargetId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.id).toBe(courseDeleteTargetId)
    expect(after?.deleted_at).toBeNull()
  })

  // ---------------------------------------------------------------- lessons

  test('a student cannot create a lesson in their own organisation', async () => {
    const marker = `${MARKER} forged lesson ${Date.now()}`
    const { error } = await studentA.from('lessons').insert({
      organization_id: orgAId,
      course_id: null,
      title: marker,
      subject: `${MARKER} subject`,
      created_by: studentAId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: created, error: readError } = await adminClient
      .from('lessons')
      .select('id')
      .eq('title', marker)
    expect(readError).toBeNull()
    expect(created ?? []).toHaveLength(0)
  })

  test('a student cannot rename a lesson in their own organisation', async () => {
    const { error: updateError } = await studentA
      .from('lessons')
      .update({ title: `${MARKER} forged lesson title` })
      .eq('id', lessonUpdateTargetId)
      .select('id')
    expect(updateError?.code).toBe('42501')
    expect(updateError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('lessons')
      .select('title')
      .eq('id', lessonUpdateTargetId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.title).toBe(ORIGINAL_LESSON_TITLE)
  })

  test('a student cannot delete a lesson in their own organisation', async () => {
    const { error: deleteError } = await studentA
      .from('lessons')
      .delete()
      .eq('id', lessonDeleteTargetId)
      .select('id')
    expect(deleteError?.code).toBe('42501')
    expect(deleteError?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: after, error: afterError } = await adminClient
      .from('lessons')
      .select('id, deleted_at')
      .eq('id', lessonDeleteTargetId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.id).toBe(lessonDeleteTargetId)
    expect(after?.deleted_at).toBeNull()
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

  test('an authenticated admin cannot create a course through the RLS-bound client', async () => {
    // Deliberate consequence, pinned as a contract: unlike `questions`, these
    // tables have no is_admin() write policy, and requireAdmin() hands out an
    // RLS-bound client. Admin authoring of these tables must go service-role.
    const marker = `${MARKER} admin forged course ${Date.now()}`
    const { error } = await adminUserA.from('courses').insert({
      organization_id: orgAId,
      title: marker,
      subject: `${MARKER} subject`,
      created_by: studentAId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(PERMISSION_DENIED)

    const { data: created, error: readError } = await adminClient
      .from('courses')
      .select('id')
      .eq('title', marker)
    expect(readError).toBeNull()
    expect(created ?? []).toHaveLength(0)
  })

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
