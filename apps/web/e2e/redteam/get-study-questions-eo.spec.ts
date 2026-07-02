/**
 * Red Team Spec: get_study_questions RPC (Vector EO, feat/study-mode-mc) — EO1–EO5.
 *
 * EO6 (mid-exam oracle) + EO7 (draft-status) live in the sibling spec
 * get-study-questions-eo-exam-oracle.spec.ts. Both specs share the throwaway-question
 * seeding via helpers/get-study-questions-eo-setup.ts so neither duplicates it.
 *
 * SECURITY DEFINER RPC (mig 20260626000200) that DELIBERATELY returns the MC
 * answer key (`correct_option_id`) and explanation to an authenticated student
 * for Study Mode — a self-paced practice surface that shows the answer (no score,
 * no session of its own). Exam integrity IS protected here, but by the
 * active-exam-session guard (EO6, sibling spec), not by the absence of a session:
 * exams grade from the same org MC pool. Unlike get_quiz_questions (mig 126), which
 * strips the key (correct_option_id is REVOKE-gated from `authenticated`, mig 111/094),
 * this RPC is SECURITY DEFINER so it can read the REVOKE-gated column and hand the key over.
 *
 * Because the key IS exposed, the guard BOUNDARY around that exposure is the whole
 * security property. This spec proves the key is revealed ONLY inside the intended
 * boundary:
 *   - EO1 unauthenticated caller -> 'Not authenticated' (auth.uid() IS NULL guard),
 *         no rows / no key.
 *   - EO2 cross-org isolation: a student in org B passing an org-A question id gets
 *         nothing for it (the WHERE q.organization_id = v_org_id filter, where
 *         v_org_id is the caller's own org). NON-VACUOUS: the org-A question is
 *         confirmed to exist via service-role, AND the org-B student DOES receive
 *         their OWN org's MC question (with its key) in the same call — so the
 *         empty cross-org result proves the org filter, not an empty table.
 *   - EO3 soft-deleted question excluded: a soft-deleted MC question is omitted
 *         while a sibling active MC question in the same org IS returned. Unlike
 *         the report RPCs' §15 carve-out (write-once session config), Study Mode
 *         reads ARBITRARY caller-supplied ids, so the deleted_at filter is REQUIRED
 *         and load-bearing here.
 *   - EO4 non-MC excluded: a short_answer question is omitted (question_type =
 *         'multiple_choice' filter) while a sibling MC question IS returned — the
 *         key-bearing RPC must never surface a non-MC row.
 *   - EO5 positive control (the deliberate, in-bounds exposure): an authenticated
 *         in-org student DOES receive the MC question WITH a populated
 *         correct_option_id and the explanation, asserting the COMPLETE RETURNS TABLE
 *         shape (id, question_text, question_image_url, options, correct_option_id,
 *         subject_code, topic_name, subtopic_name, explanation_text,
 *         explanation_image_url, question_number, difficulty).
 *
 * Hermeticity (code-style.md §7): every question this spec reads is one its own
 * setupEoFixtures inserted (marker-tagged via E2E_REDTEAM_EO_MARKER, unique
 * question_number per row), so it never mutates or depends on shared egmont seed
 * data. `questions` is soft-deletable, so afterAll soft-deletes every inserted row.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  cleanupEoFixtures,
  EG_MC_ACTIVE_KEY,
  type EoFixtures,
  OTHER_ORG_MC_KEY,
  RPC,
  type StudyQuestionRow,
  setupEoFixtures,
  VALID_OPTION_IDS,
} from './helpers/get-study-questions-eo-setup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
  E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
// Fail fast: a missing Supabase URL must surface as a deterministic setup error at
// load — not an opaque RPC failure when the client silently uses an undefined URL.
if (!SUPABASE_URL) {
  throw new Error(
    'get-study-questions-eo.spec: NEXT_PUBLIC_SUPABASE_URL is required (set it in apps/web/.env.local)',
  )
}
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// Fail fast (matches rpc-report-answer-keys.spec.ts): a missing anon key must
// surface as a deterministic setup error at load — not a misleading auth failure
// inside EO1, where a '' fallback would build a client that then fails opaquely.
if (!ANON_KEY) {
  throw new Error(
    'get-study-questions-eo.spec: NEXT_PUBLIC_SUPABASE_ANON_KEY is required (set it in apps/web/.env.local)',
  )
}

test.describe('Red Team: get_study_questions RPC (Vector EO)', () => {
  let fx: EoFixtures

  test.beforeAll(async () => {
    fx = await setupEoFixtures()
  })

  test.afterAll(async () => {
    await cleanupEoFixtures(fx.admin, fx.createdQuestionIds)
  })

  test('EO5 positive control: an in-org student receives the MC question with its answer key', async () => {
    // The deliberate, in-bounds exposure — proven FIRST so the EO1-EO4 negatives
    // cannot pass vacuously (the RPC genuinely returns the key on the allowed path).
    const { data, error } = await fx.studentClient.rpc(RPC, { p_question_ids: [fx.egMcActiveId] })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as StudyQuestionRow[]

    // Exactly the one requested question, no over-return.
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row?.id).toBe(fx.egMcActiveId)

    // The answer key is present and correct — this is what Study Mode deliberately reveals.
    expect(row?.correct_option_id).toBe(EG_MC_ACTIVE_KEY)
    expect(VALID_OPTION_IDS).toContain(row?.correct_option_id)
    expect(row?.explanation_text).toBe('Red-team EO fixture explanation.')

    // options are stripped to {id, text} — no `correct` boolean leaks via the JSONB.
    expect(Array.isArray(row?.options)).toBe(true)
    expect((row?.options ?? []).length).toBeGreaterThan(0)
    for (const opt of row?.options ?? []) {
      expect('correct' in opt).toBe(false)
      expect(Object.keys(opt).sort()).toEqual(['id', 'text'])
    }

    // Pin the EXACT top-level payload (RPC OUTPUT CONTRACTS rule): the RETURNS TABLE
    // (mig 135 get_study_questions) declares exactly these 12 keys, so a future extra
    // sensitive column (or a rename/drop) fails this assertion rather than leaking silently.
    expect(Object.keys(row ?? {}).sort()).toEqual([
      'correct_option_id',
      'difficulty',
      'explanation_image_url',
      'explanation_text',
      'id',
      'options',
      'question_image_url',
      'question_number',
      'question_text',
      'subject_code',
      'subtopic_name',
      'topic_name',
    ])

    // Full RETURNS TABLE shape (mig 20260626000200) — every field present and typed
    // correctly, so a rename/drop/shape regression fails here rather than in the UI.
    expect(typeof row?.id).toBe('string')
    expect(typeof row?.question_text).toBe('string')
    // question_image_url: nullable (no image on the fixture)
    expect(row?.question_image_url === null || typeof row?.question_image_url === 'string').toBe(
      true,
    )
    expect(typeof row?.subject_code).toBe('string')
    expect(typeof row?.topic_name).toBe('string')
    // subtopic_name: nullable (LEFT JOIN; fixture has no subtopic)
    expect(row?.subtopic_name === null || typeof row?.subtopic_name === 'string').toBe(true)
    // explanation_image_url: nullable (no image on the fixture)
    expect(
      row?.explanation_image_url === null || typeof row?.explanation_image_url === 'string',
    ).toBe(true)
    // question_number: nullable; the fixture seeds one
    expect(row?.question_number === null || typeof row?.question_number === 'string').toBe(true)
    expect(typeof row?.difficulty).toBe('string')
  })

  test('EO1: an unauthenticated caller is rejected and receives no answer key', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc(RPC, { p_question_ids: [fx.egMcActiveId] })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data).toBeNull()
  })

  test('EO2: a student in another org cannot read a foreign-org question key, but sees their own', async () => {
    // Non-vacuity (1/2): the foreign (egmont) question genuinely exists and is egmont's.
    const { data: existsRow, error: existsErr } = await fx.admin
      .from('questions')
      .select('id, organization_id, question_type')
      .eq('id', fx.egMcActiveId)
      .single()
    expect(existsErr).toBeNull()
    expect(existsRow?.organization_id).toBe(fx.orgId)
    expect(existsRow?.question_type).toBe('multiple_choice')
    expect(fx.orgId).not.toBe(fx.otherOrgId)

    // The org-B student asks for BOTH the foreign egmont question AND their own org's
    // question in a single call. The org filter (q.organization_id = caller's org)
    // must drop the egmont row and keep only the org-B one.
    const { data, error } = await fx.crossOrgClient.rpc(RPC, {
      p_question_ids: [fx.egMcActiveId, fx.otherOrgMcId],
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as StudyQuestionRow[]
    const ids = rows.map((r) => r.id)

    // The foreign-org question — and its key — is NOT leaked across the org boundary.
    expect(ids).not.toContain(fx.egMcActiveId)

    // Non-vacuity (2/2): the org-B student DOES get their OWN org's MC question, with
    // its key — so the empty cross-org result proves the org filter, not an empty table.
    expect(rows).toHaveLength(1)
    const ownRow = rows.find((r) => r.id === fx.otherOrgMcId)
    expect(ownRow).toBeDefined()
    expect(ownRow?.correct_option_id).toBe(OTHER_ORG_MC_KEY)
  })

  test('EO3: a soft-deleted question is excluded while a sibling active question is returned', async () => {
    // Pre-delete: confirm the soon-to-be-deleted question IS returned while active —
    // so the post-delete exclusion proves the deleted_at filter fired, not that the
    // question never existed.
    const before = await fx.studentClient.rpc(RPC, {
      p_question_ids: [fx.egMcDeletedId, fx.egMcActiveId],
    })
    expect(before.error).toBeNull()
    expect(Array.isArray(before.data)).toBe(true)
    const beforeIds = (before.data as StudyQuestionRow[]).map((r) => r.id)
    expect(beforeIds).toContain(fx.egMcDeletedId)
    expect(beforeIds).toContain(fx.egMcActiveId)

    // Soft-delete the question (service-role). Verify a row actually changed.
    const { data: deleted, error: delErr } = await fx.admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', fx.egMcDeletedId)
      .is('deleted_at', null)
      .select('id')
    expect(delErr).toBeNull()
    expect(deleted?.length).toBe(1)

    // Post-delete: the soft-deleted question is excluded; the sibling active one remains.
    const after = await fx.studentClient.rpc(RPC, {
      p_question_ids: [fx.egMcDeletedId, fx.egMcActiveId],
    })
    expect(after.error).toBeNull()
    expect(Array.isArray(after.data)).toBe(true)
    const afterIds = (after.data as StudyQuestionRow[]).map((r) => r.id)
    expect(afterIds).not.toContain(fx.egMcDeletedId)
    expect(afterIds).toContain(fx.egMcActiveId)
  })

  test('EO4: a non-MC question is excluded while a sibling MC question is returned', async () => {
    // Non-vacuity: the short_answer fixture genuinely exists and is non-MC.
    const { data: saRow, error: saErr } = await fx.admin
      .from('questions')
      .select('id, question_type')
      .eq('id', fx.egShortAnswerId)
      .single()
    expect(saErr).toBeNull()
    expect(saRow?.question_type).toBe('short_answer')

    // The key-bearing RPC must surface only the MC sibling, never the short_answer row.
    const { data, error } = await fx.studentClient.rpc(RPC, {
      p_question_ids: [fx.egShortAnswerId, fx.egMcActiveId],
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const ids = (data as StudyQuestionRow[]).map((r) => r.id)
    expect(ids).not.toContain(fx.egShortAnswerId)
    expect(ids).toContain(fx.egMcActiveId)
  })

  // --- EO-SD: soft-deleted caller (active-user gate) ---

  test.describe('EO-SD: a soft-deleted caller is rejected by the active-user gate', () => {
    // A dedicated throwaway student can read a Study Mode MC answer key while active.
    // After soft-delete (users.deleted_at set), get_study_questions' active-user gate
    // (which fires right after auth.uid(), BEFORE p_question_ids is validated) must
    // reject with 'user_not_found_or_inactive' — proving a deactivated account holding
    // a still-valid JWT cannot keep reading the deliberately-exposed MC key. Mirrors
    // EN4 (rpc-report-answer-keys.spec.ts) for the get_study_questions surface.
    let softDelStudentId = ''
    let softDelStudentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>

    test.beforeAll(async () => {
      // Create (or realign) the dedicated throwaway student, ensuring it is NOT
      // soft-deleted from a prior aborted run. perPage well above any test-env user
      // count so a reused student on a later page is never missed (which would wrongly
      // fall through to createUser and fail on the duplicate email).
      const { data: authList, error: listError } = await fx.admin.auth.admin.listUsers({
        perPage: 1000,
      })
      if (listError) throw new Error(`EO-SD beforeAll: listUsers failed: ${listError.message}`)
      const existing = authList.users.find((u) => u.email === E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL)

      if (existing) {
        softDelStudentId = existing.id
        const { data: userRow, error: userRowErr } = await fx.admin
          .from('users')
          .select('id, organization_id, role, deleted_at')
          .eq('id', existing.id)
          .maybeSingle()
        if (userRowErr) throw new Error(`EO-SD beforeAll: users lookup: ${userRowErr.message}`)
        if (!userRow) {
          const { error: insErr } = await fx.admin.from('users').insert({
            id: existing.id,
            organization_id: fx.orgId,
            email: E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
            full_name: 'Red Team Soft-Delete Study Student',
            role: 'student',
          })
          if (insErr) throw new Error(`EO-SD beforeAll: insert user: ${insErr.message}`)
        } else if (
          userRow.organization_id !== fx.orgId ||
          userRow.role !== 'student' ||
          userRow.deleted_at !== null
        ) {
          const { data: realigned, error: updErr } = await fx.admin
            .from('users')
            .update({ organization_id: fx.orgId, role: 'student', deleted_at: null })
            .eq('id', existing.id)
            .select('id')
          if (updErr) throw new Error(`EO-SD beforeAll: realign user: ${updErr.message}`)
          if (!realigned?.length) throw new Error('EO-SD beforeAll: realign affected 0 rows')
        }
      } else {
        const { data: created, error: createErr } = await fx.admin.auth.admin.createUser({
          email: E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
          password: E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
          email_confirm: true,
        })
        if (createErr || !created.user)
          throw new Error(`EO-SD beforeAll: createUser: ${createErr?.message}`)
        softDelStudentId = created.user.id
        const { error: insErr } = await fx.admin.from('users').insert({
          id: softDelStudentId,
          organization_id: fx.orgId,
          email: E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
          full_name: 'Red Team Soft-Delete Study Student',
          role: 'student',
        })
        if (insErr) throw new Error(`EO-SD beforeAll: insert user: ${insErr.message}`)
      }

      // Authenticate BEFORE soft-delete — holds a still-valid JWT for the post-delete call.
      softDelStudentClient = await createAuthenticatedClient(
        E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
        E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
      )
    })

    test.afterAll(async () => {
      // Soft-delete the throwaway users row (security rule 6) so it neither pollutes
      // active-student queries nor blocks on FKs; the next run's beforeAll realigns it
      // (deleted_at=null) for reuse. A failed soft-delete would leave the student ACTIVE
      // and leak into downstream specs sharing this Supabase project, so THROW on a real
      // error (code-style.md §7). Zero rows is non-fatal: the row may already be
      // soft-deleted from a prior run.
      if (!softDelStudentId) return
      const { data, error } = await fx.admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', softDelStudentId)
        .is('deleted_at', null)
        .select('id')
      if (error) {
        throw new Error(
          `[get-study-questions-eo] EO-SD afterAll soft-delete failed: ${error.message}`,
        )
      }
      if ((data?.length ?? 0) > 0) {
        console.log(`[get-study-questions-eo] EO-SD soft-deleted ${data?.length} student(s)`)
      }
    })

    test('the caller can read a study key until soft-deleted, then is rejected', async () => {
      // Non-vacuous setup: as the still-active throwaway student, prove the MC key IS
      // readable BEFORE soft-deletion — so the post-delete rejection proves the
      // active-user gate fired, not that the JWT was already invalid.
      const before = await softDelStudentClient.rpc(RPC, {
        p_question_ids: [fx.egMcActiveId],
      })
      expect(before.error).toBeNull()
      expect(Array.isArray(before.data)).toBe(true)
      const beforeRows = before.data as StudyQuestionRow[]
      expect(beforeRows).toHaveLength(1)
      expect(beforeRows[0]?.correct_option_id).toBe(EG_MC_ACTIVE_KEY)

      // Soft-delete + post-delete call in a try/finally so the user is always restored
      // to a clean state (noUnsafeFinally: the assertions live OUTSIDE the finally).
      let restoreError: string | null = null
      let result: { data: unknown; error: { message: string } | null } | null = null
      try {
        const { data: deleted, error: delErr } = await fx.admin
          .from('users')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', softDelStudentId)
          .is('deleted_at', null)
          .select('id')
        expect(delErr).toBeNull()
        // Non-vacuity: confirm the soft-delete actually changed a row.
        expect(deleted?.length).toBe(1)

        const r = await softDelStudentClient.rpc(RPC, { p_question_ids: [fx.egMcActiveId] })
        result = { data: r.data, error: r.error }
      } finally {
        const { data: restored, error: restoreErr } = await fx.admin
          .from('users')
          .update({ deleted_at: null })
          .eq('id', softDelStudentId)
          .select('id')
        if (restoreErr) restoreError = restoreErr.message
        else if ((restored?.length ?? 0) === 0) restoreError = 'restore matched no rows'
      }

      // Reachability guard: result is set only if the soft-delete + post-delete RPC
      // call both ran, so the security proof below can never pass vacuously.
      expect(result).not.toBeNull()

      // Security proof first: the active-user gate rejects and no key is leaked.
      expect(result?.error).not.toBeNull()
      expect(result?.error?.message ?? '').toMatch(/user_not_found_or_inactive/i)
      expect(result?.data).toBeNull()

      // Infra check last so a restore failure never masks the security proof.
      expect(restoreError).toBeNull()
    })
  })
})
