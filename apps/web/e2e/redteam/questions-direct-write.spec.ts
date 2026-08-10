/**
 * Red Team Spec: direct PostgREST writes to `questions` (Vector EX).
 *
 * DEFECT this spec guards. `tenant_isolation` on public.questions was created in
 * mig 001 with no FOR clause, which in Postgres means FOR ALL — it governed
 * SELECT, INSERT, UPDATE and DELETE. Permissive policies are OR-ed, so a write
 * succeeded whenever EITHER the is_admin()-gated admin_insert_questions /
 * admin_update_questions policies OR tenant_isolation (same-org, deleted_at IS
 * NULL) was satisfied. Every authenticated in-org user satisfies the latter, so
 * the role gate never bound: any student or instructor could author, edit or
 * hard-DELETE questions via direct PostgREST — including rewriting
 * `correct_option_id`, the stored MC answer key that batch_submit_quiz grades
 * against. The key is SELECT-revoked from `authenticated` (mig
 * 20260619000100:151) but its UPDATE privilege never was, so the attacker did
 * not need to READ the key to make their own answer the correct one.
 *
 * Migration 20260809000100 re-emits tenant_isolation as FOR SELECT with a
 * byte-identical USING predicate, leaving:
 *   SELECT — tenant_isolation (unchanged; no read regression)
 *   INSERT — admin_insert_questions (is_admin() AND caller-org)
 *   UPDATE — admin_update_questions (is_admin() AND caller-org)
 *   DELETE — no permissive policy at all (security.md rule 6: never hard DELETE)
 *
 * Assertion shapes, and why they differ per verb:
 *   - UPDATE / DELETE denial is a USING mismatch, which PostgREST reports as a
 *     SILENT 0-row no-op (error null, data []) — NOT a 42501. Same note as in
 *     rpc-cross-tenant-isolation.spec.ts (Vector DX). A 0-row result alone is
 *     weak evidence, so the PRIMARY proof for each write-denial test is a
 *     before/after read through the SERVICE-ROLE client showing the protected
 *     value (or the row itself) is untouched.
 *   - INSERT denial is a WITH CHECK violation → 42501. That code is ambiguous on
 *     its own (it also covers a missing column grant), so the test additionally
 *     proves via service-role that no marker-tagged row was created.
 *
 * Non-vacuity (code-style.md §7). Without positive controls a broken fixture —
 * an unauthenticated client, an unreachable table, a mis-seeded org — would make
 * every denial above pass trivially. Two allow-cases pin that down: the student
 * CAN still SELECT an in-org question, and a genuine admin CAN still author and
 * edit one (including the answer key).
 *
 * Hermeticity (code-style.md §7). Every row this spec writes or attacks is one
 * its own beforeAll inserted, marker-tagged via E2E_REDTEAM_QW_MARKER with a
 * unique question_number per row. That is load-bearing for the DELETE probe in
 * particular: on a database where the migration is NOT applied the probe is a
 * real hard DELETE, and pointing it at a shared seeded question would
 * permanently shrink the org's question pool for every downstream spec.
 * `questions` is soft-deletable, so afterAll soft-deletes (never hard-deletes)
 * every marked row.
 *
 * Status: Expected to PASS (defenses should hold).
 * A failure means the questions write path is open to non-admins again.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QW_MARKER as MARKER } from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed-users'

// The four canonical MC option ids. correct_option_id is CHECK-constrained to
// ('a','b','c','d') for a multiple_choice row (questions_mc_correct_option_id_check,
// mig 20260619000100), so a forged key must be another VALID id of the same
// question — an arbitrary string would be rejected by the CHECK and the test
// would pass for the wrong reason.
const MC_OPTIONS = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Bravo' },
  { id: 'c', text: 'Charlie' },
  { id: 'd', text: 'Delta' },
]

/**
 * The cleanup prefix pattern for `question_number`, with every SQL LIKE
 * metacharacter escaped.
 *
 * In LIKE, `_` is a SINGLE-CHARACTER WILDCARD and `\` is the default escape, so
 * the raw `[E2E_REDTEAM_QW]%` would also match e.g. `[E2EXREDTEAMXQW] ...` —
 * verified against Postgres, the unescaped pattern matches such a decoy and the
 * escaped one does not. No live collision exists today, but the cleanup issues a
 * blind bulk UPDATE, so the match must be literal. Derived from MARKER rather
 * than hand-written so it cannot drift from seed-markers.ts.
 *
 * Escaping survives PostgREST: `.like()` puts the pattern in the query string
 * (URL-encoded), and the backslashes arrive intact and bind as LIKE escapes —
 * confirmed end-to-end against the local REST endpoint.
 */
const MARKER_LIKE_PREFIX = `${MARKER.replace(/[\\%_]/g, '\\$&')}%`

/**
 * Narrow an untyped `options` JSONB value to the list of option ids it declares.
 * Runtime guard rather than a cast (code-style.md §5): `options` is Json, and a
 * shape regression would otherwise surface as an opaque TypeError instead of a
 * clean assertion failure.
 */
function extractOptionIds(options: unknown): string[] {
  if (!Array.isArray(options)) return []
  const ids: string[] = []
  for (const entry of options) {
    if (typeof entry !== 'object' || entry === null || !('id' in entry)) continue
    const id = (entry as { id: unknown }).id
    if (typeof id === 'string') ids.push(id)
  }
  return ids
}

test.describe('Red Team: direct writes to questions (Vector EX)', () => {
  let adminClient: ReturnType<typeof getAdminClient>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let instructorClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminUserClient: Awaited<ReturnType<typeof createAuthenticatedClient>>

  let orgId = ''
  let bankId = ''
  let subjectId = ''
  let topicId = ''
  let authorId = ''

  // Every attacked row is the spec's own (see the hermeticity note in the header).
  let studentUpdateTargetId = ''
  let studentStatusTargetId = ''
  let studentDeleteTargetId = ''
  let instructorUpdateTargetId = ''
  let instructorDeleteTargetId = ''

  /**
   * Build a schema-compliant multiple_choice row. The column set satisfies every
   * NOT NULL plus questions_question_type_columns_check. That constraint has been
   * DROPped and re-ADDed twice since it was introduced in mig 20260610000100 —
   * by mig 20260630000100 (ordering) and, latest, by mig
   * 20260702000100:229-237 (diagram_label), which is the definition in force.
   * Its multiple_choice branch requires ALL of:
   *   canonical_answer IS NULL, accepted_synonyms = '{}'::TEXT[],
   *   dialog_template IS NULL, jsonb_array_length(blanks_config) = 0,
   *   ordering_items = '[]'::jsonb, diagram_config IS NULL.
   * The first four are set explicitly below. The last two are omitted because the
   * column defaults already satisfy them: ordering_items is
   * `JSONB NOT NULL DEFAULT '[]'::jsonb` (mig 20260630000100:21) and
   * diagram_config is `JSONB NULL DEFAULT NULL` (mig 20260702000100:39).
   */
  function buildMcQuestion(label: string, correctOptionId: string) {
    return {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: subjectId,
      topic_id: topicId,
      created_by: authorId,
      question_text: `${MARKER} ${label} fixture`,
      // question_number is UNIQUE per (bank_id, question_number) WHERE
      // deleted_at IS NULL (mig 20260311000003) — the label + timestamp keeps a
      // leftover active row from a crashed prior run from causing a 23505.
      question_number: `${MARKER} ${label} ${Date.now()}`,
      explanation_text: 'Red-team EX fixture explanation.',
      difficulty: 'medium',
      status: 'active',
      question_type: 'multiple_choice',
      options: MC_OPTIONS,
      correct_option_id: correctOptionId,
      canonical_answer: null,
      accepted_synonyms: [],
      dialog_template: null,
      blanks_config: [],
    }
  }

  async function seedFixtureQuestion(label: string): Promise<string> {
    const { data, error } = await adminClient
      .from('questions')
      .insert(buildMcQuestion(label, 'a'))
      .select('id')
      .single()
    if (error || !data) throw new Error(`seedFixtureQuestion(${label}): ${error?.message}`)
    return data.id
  }

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    const adminSeed = await seedRedTeamAdmin()
    authorId = adminSeed.adminUserId
    const instructorSeed = await seedRedTeamInstructor()

    adminClient = getAdminClient()
    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    instructorClient = await createAuthenticatedClient(
      instructorSeed.email,
      instructorSeed.password,
    )
    adminUserClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)

    // Derive valid FK scaffolding from a real active egmont question, mirroring
    // helpers/get-study-questions-eo-setup.ts.
    const picked = await pickSubjectWithQuestions(adminClient, { orgId })
    subjectId = picked.subjectId
    topicId = picked.topicId

    const { data: fkRow, error: fkError } = await adminClient
      .from('questions')
      .select('bank_id')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (fkError) throw new Error(`Vector EX beforeAll: bank lookup failed: ${fkError.message}`)
    if (!fkRow) throw new Error('Vector EX beforeAll: no active egmont question to derive FKs from')
    bankId = fkRow.bank_id

    studentUpdateTargetId = await seedFixtureQuestion('student-update-target')
    studentStatusTargetId = await seedFixtureQuestion('student-status-target')
    studentDeleteTargetId = await seedFixtureQuestion('student-delete-target')
    instructorUpdateTargetId = await seedFixtureQuestion('instructor-update-target')
    instructorDeleteTargetId = await seedFixtureQuestion('instructor-delete-target')
  })

  test.afterAll(async () => {
    // Soft-delete, never hard-delete (security.md rule 6). Zero-row no-op chain
    // per code-style.md §5: log only when rows actually changed.
    const { data, error } = await adminClient
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .like('question_number', MARKER_LIKE_PREFIX)
      .is('deleted_at', null)
      .select('id')
    if (error) {
      // Fail loudly rather than logging and passing (code-style.md §7
      // hermeticity). A silent cleanup failure leaves this spec's marker-tagged
      // rows ACTIVE in the shared org question pool, where they leak into every
      // downstream spec as a deterministic flake that looks like flakiness.
      console.error(`[questions-direct-write cleanup] soft-delete error: ${error.message}`)
      throw new Error('[questions-direct-write cleanup] failed to soft-delete marker-tagged rows')
    }
    if ((data?.length ?? 0) > 0) {
      console.log(`[questions-direct-write cleanup] soft-deleted ${data?.length} question(s)`)
    }
  })

  test('a student cannot rewrite the answer key of a question in their own organisation', async () => {
    const { data: before, error: beforeError } = await adminClient
      .from('questions')
      .select('correct_option_id, options')
      .eq('id', studentUpdateTargetId)
      .single()
    expect(beforeError).toBeNull()
    expect(before).not.toBeNull()
    // Runtime guard (code-style.md §5): an MC row always carries a non-null key
    // (questions_mc_correct_option_id_check). A non-string here would make the
    // "unchanged" assertion below vacuous (toBe(undefined)); fail loudly instead.
    expect(typeof before?.correct_option_id).toBe('string')
    const originalKey = before?.correct_option_id
    if (typeof originalKey !== 'string') {
      throw new Error('Vector EX: MC fixture has no answer key to protect')
    }

    // Forge a DIFFERENT but still valid option id of the SAME question, so a
    // successful write would be accepted by the CHECK constraint and really would
    // change which answer grades as correct.
    const optionIds = extractOptionIds(before?.options)
    expect(optionIds.length).toBeGreaterThan(1)
    const forgedKey = optionIds.find((id) => id !== originalKey)
    if (typeof forgedKey !== 'string') {
      throw new Error(`Vector EX: fixture has no alternate option id (key=${originalKey})`)
    }

    const { data: updated, error: updateError } = await studentClient
      .from('questions')
      .update({ correct_option_id: forgedKey })
      .eq('id', studentUpdateTargetId)
      .is('deleted_at', null)
      .select('id')
    expect(updateError).toBeNull()
    expect(updated ?? []).toHaveLength(0)

    // Primary proof: the stored key is byte-for-byte what it was.
    const { data: after, error: afterError } = await adminClient
      .from('questions')
      .select('correct_option_id')
      .eq('id', studentUpdateTargetId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.correct_option_id).toBe(originalKey)
  })

  test('a student cannot take a question out of circulation', async () => {
    // Rewriting the answer key requires the attacker to be mid-assessment and to
    // care which option grades as correct. Flipping a question to 'draft' only
    // requires wanting it gone, so it is the MORE reachable arm of the same hole:
    // question-pool denial of service rather than a targeted key forge. Both went
    // through tenant_isolation's WITH CHECK for the same reason before mig
    // 20260809000100 — the post-update row is still same-org with deleted_at IS
    // NULL, so the predicate re-passes and the is_admin() gate never bound.
    const { data: before, error: beforeError } = await adminClient
      .from('questions')
      .select('status')
      .eq('id', studentStatusTargetId)
      .single()
    expect(beforeError).toBeNull()
    expect(before).not.toBeNull()
    // Runtime guard (code-style.md §5): status is NOT NULL, so a non-string here
    // means a shape regression. Without this the "unchanged" assertion below could
    // degrade to toBe(undefined) and pass vacuously.
    expect(typeof before?.status).toBe('string')
    const originalStatus = before?.status
    if (typeof originalStatus !== 'string') {
      throw new Error('Vector EX: fixture has no status to protect')
    }
    // The fixture is seeded 'active'. Pinning that makes the forged value below a
    // real state change rather than a no-op write of the value already stored.
    expect(originalStatus).toBe('active')

    // 'draft' is the only other value questions_status_check admits, and it takes
    // the row out of the served pool — so a successful write would be accepted by
    // the CHECK and would really remove the question, not fail for the wrong reason.
    const { data: updated, error: updateError } = await studentClient
      .from('questions')
      .update({ status: 'draft' })
      .eq('id', studentStatusTargetId)
      .is('deleted_at', null)
      .select('id')
    expect(updateError).toBeNull()
    expect(updated ?? []).toHaveLength(0)

    // Primary proof: the question is still in circulation.
    const { data: after, error: afterError } = await adminClient
      .from('questions')
      .select('status')
      .eq('id', studentStatusTargetId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.status).toBe(originalStatus)
  })

  test('a student cannot delete a question in their own organisation', async () => {
    // The target is the spec's OWN row: on a database missing the migration this
    // probe is a real hard DELETE, and a shared seeded question would be lost.
    const { data: before, error: beforeError } = await adminClient
      .from('questions')
      .select('id')
      .eq('id', studentDeleteTargetId)
      .is('deleted_at', null)
      .maybeSingle()
    expect(beforeError).toBeNull()
    expect(before).not.toBeNull()

    const { data: deleted, error: deleteError } = await studentClient
      .from('questions')
      .delete()
      .eq('id', studentDeleteTargetId)
      .select('id')
    // Two rejection shapes are both correct here, so accept either. With the
    // table-level DELETE privilege present (Supabase bootstrap default; no
    // migration revokes it) an RLS USING mismatch is a SILENT 0-row no-op —
    // error null, data []. Were that privilege ever revoked, the same call would
    // instead be refused at the privilege layer with 42501. Unlike the UPDATE
    // case above, `questions` has no CI-green positive control proving the DELETE
    // grant, so pinning one shape would risk failing for the wrong reason. The
    // service-role before/after read below is the real proof and holds either way.
    // Branch rather than collapse into one boolean: a combined expression fails as
    // "expected false to be true", which hides WHICH shape went wrong — rows actually
    // deleted, or an unexpected error code. On a red-team failure that distinction is
    // the first thing you need.
    if (deleteError === null) {
      expect(deleted ?? []).toHaveLength(0)
    } else {
      expect(deleteError.code).toBe('42501')
    }

    // Primary proof: the row survives, and survives un-soft-deleted.
    const { data: after, error: afterError } = await adminClient
      .from('questions')
      .select('id, deleted_at')
      .eq('id', studentDeleteTargetId)
      .maybeSingle()
    expect(afterError).toBeNull()
    expect(after?.id).toBe(studentDeleteTargetId)
    expect(after?.deleted_at).toBeNull()
  })

  test('a student cannot author a new question', async () => {
    const forged = buildMcQuestion('student-insert-attempt', 'a')

    const { data: inserted, error: insertError } = await studentClient
      .from('questions')
      .insert(forged)
      .select('id')
    // An INSERT is denied by WITH CHECK, which PostgREST surfaces as 42501 —
    // unlike the UPDATE/DELETE USING mismatches above, which are silent no-ops.
    expect(insertError).not.toBeNull()
    expect(insertError?.code).toBe('42501')
    expect(inserted ?? []).toHaveLength(0)

    // 42501 alone is ambiguous (it also covers a missing column grant), so prove
    // the outcome that actually matters: no row was created.
    const { data: after, error: afterError } = await adminClient
      .from('questions')
      .select('id')
      .eq('question_number', forged.question_number)
    expect(afterError).toBeNull()
    expect(after ?? []).toHaveLength(0)
  })

  test('an instructor cannot rewrite the answer key of a question in their own organisation', async () => {
    // Instructors are the role this tightening actually strips of write access:
    // before the migration they satisfied tenant_isolation exactly as students did.
    const { data: before, error: beforeError } = await adminClient
      .from('questions')
      .select('correct_option_id, options')
      .eq('id', instructorUpdateTargetId)
      .single()
    expect(beforeError).toBeNull()
    expect(before).not.toBeNull()
    expect(typeof before?.correct_option_id).toBe('string')
    const originalKey = before?.correct_option_id
    if (typeof originalKey !== 'string') {
      throw new Error('Vector EX: MC fixture has no answer key to protect')
    }

    const optionIds = extractOptionIds(before?.options)
    expect(optionIds.length).toBeGreaterThan(1)
    const forgedKey = optionIds.find((id) => id !== originalKey)
    if (typeof forgedKey !== 'string') {
      throw new Error(`Vector EX: fixture has no alternate option id (key=${originalKey})`)
    }

    const { data: updated, error: updateError } = await instructorClient
      .from('questions')
      .update({ correct_option_id: forgedKey })
      .eq('id', instructorUpdateTargetId)
      .is('deleted_at', null)
      .select('id')
    expect(updateError).toBeNull()
    expect(updated ?? []).toHaveLength(0)

    const { data: after, error: afterError } = await adminClient
      .from('questions')
      .select('correct_option_id')
      .eq('id', instructorUpdateTargetId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.correct_option_id).toBe(originalKey)
  })

  test('an instructor cannot delete a question in their own organisation', async () => {
    // RLS is evaluated PER COMMAND, so the instructor UPDATE denial above says
    // nothing about DELETE: they are separate policy sets, and DELETE is denied by
    // the absence of any permissive policy rather than by a failed is_admin() gate.
    // The target is the spec's OWN row (see the hermeticity note in the header): on
    // a database missing the migration this probe is a real hard DELETE.
    const { data: before, error: beforeError } = await adminClient
      .from('questions')
      .select('id')
      .eq('id', instructorDeleteTargetId)
      .is('deleted_at', null)
      .maybeSingle()
    expect(beforeError).toBeNull()
    expect(before).not.toBeNull()

    const { data: deleted, error: deleteError } = await instructorClient
      .from('questions')
      .delete()
      .eq('id', instructorDeleteTargetId)
      .select('id')
    // Same dual-shape acceptance as the student DELETE probe: with the table-level
    // DELETE privilege present an RLS USING mismatch is a SILENT 0-row no-op, and
    // were that privilege ever revoked the same call would be refused with 42501.
    // Branching keeps a failure legible — rows actually deleted, or an unexpected
    // error code — instead of collapsing to "expected false to be true".
    if (deleteError === null) {
      expect(deleted ?? []).toHaveLength(0)
    } else {
      expect(deleteError.code).toBe('42501')
    }

    // Primary proof: the row survives, and survives un-soft-deleted.
    const { data: after, error: afterError } = await adminClient
      .from('questions')
      .select('id, deleted_at')
      .eq('id', instructorDeleteTargetId)
      .maybeSingle()
    expect(afterError).toBeNull()
    expect(after?.id).toBe(instructorDeleteTargetId)
    expect(after?.deleted_at).toBeNull()
  })

  test('an instructor cannot author a new question', async () => {
    // Per-command evaluation again: no instructor-specific policy exists, but a
    // denied UPDATE does not itself demonstrate that INSERT is gated too.
    const forged = buildMcQuestion('instructor-insert-attempt', 'a')

    const { data: inserted, error: insertError } = await instructorClient
      .from('questions')
      .insert(forged)
      .select('id')
    // An INSERT is denied by WITH CHECK, which PostgREST surfaces as 42501 —
    // unlike the UPDATE/DELETE USING mismatches above, which are silent no-ops.
    expect(insertError).not.toBeNull()
    expect(insertError?.code).toBe('42501')
    expect(inserted ?? []).toHaveLength(0)

    // 42501 alone is ambiguous (it also covers a missing column grant), so prove
    // the outcome that actually matters: no row was created.
    const { data: after, error: afterError } = await adminClient
      .from('questions')
      .select('id')
      .eq('question_number', forged.question_number)
    expect(afterError).toBeNull()
    expect(after ?? []).toHaveLength(0)
  })

  test('a student can still read a question in their own organisation', async () => {
    // Non-vacuity control (code-style.md §7): proves the student client is
    // genuinely authenticated and `questions` is reachable, so the four student
    // denials above are the write policies binding — not a broken fixture.
    const { data, error } = await studentClient
      .from('questions')
      .select('id, question_number')
      .eq('id', studentUpdateTargetId)
      .is('deleted_at', null)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
    expect(data?.[0]?.id).toBe(studentUpdateTargetId)
  })

  test('an admin can still author a question and change its answer key', async () => {
    // Non-vacuity control (code-style.md §7): the tightening must not have broken
    // legitimate admin authoring, which runs user-scoped (no service role) via
    // insert-question.ts / upsert-question.ts.
    const authored = buildMcQuestion('admin-authoring-control', 'a')

    const { data: inserted, error: insertError } = await adminUserClient
      .from('questions')
      .insert(authored)
      .select('id')
      .single()
    expect(insertError).toBeNull()
    expect(inserted).not.toBeNull()
    const authoredId = inserted?.id
    if (typeof authoredId !== 'string') {
      throw new Error('Vector EX: admin INSERT returned no id')
    }

    const editedText = `${MARKER} admin-authoring-control edited`
    const { data: updated, error: updateError } = await adminUserClient
      .from('questions')
      .update({ correct_option_id: 'c', question_text: editedText })
      .eq('id', authoredId)
      .is('deleted_at', null)
      .select('id')
    expect(updateError).toBeNull()
    expect(updated ?? []).toHaveLength(1)

    // Read back through service-role: correct_option_id is SELECT-revoked from
    // `authenticated` (mig 20260619000100:151), so even the admin's own client
    // cannot confirm the key it just wrote.
    const { data: after, error: afterError } = await adminClient
      .from('questions')
      .select('correct_option_id, question_text')
      .eq('id', authoredId)
      .single()
    expect(afterError).toBeNull()
    expect(after?.correct_option_id).toBe('c')
    expect(after?.question_text).toBe(editedText)
  })
})
