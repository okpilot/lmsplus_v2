/**
 * Red Team Spec: get_study_questions RPC (Vector EO, feat/study-mode-mc)
 *
 * SECURITY DEFINER RPC (mig 20260626000200) that DELIBERATELY returns the MC
 * answer key (`correct_option_id`) and explanation to an authenticated student
 * for Study Mode — a self-paced practice surface with no session, score, or exam
 * integrity to protect. Unlike get_quiz_questions (mig 126), which strips the key
 * (correct_option_id is REVOKE-gated from `authenticated`, mig 111/094), this RPC
 * is SECURITY DEFINER so it can read the REVOKE-gated column and hand the key over.
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
 *         correct_option_id and the explanation.
 *
 * Hermeticity (code-style.md §7): every question this spec reads is one it inserts
 * itself (marker-tagged via E2E_REDTEAM_EO_MARKER, unique question_number per row),
 * so it never mutates or depends on shared egmont seed data. `questions` is
 * soft-deletable, so afterAll soft-deletes every inserted row (single cleanup step
 * -> no per-step accumulator needed; the §7 accumulator rule is for 2+ steps). The
 * redteam-other-org question_bank is create-or-reused (idempotent infrastructure,
 * like the org/users), not torn down.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  createCrossOrgUser,
  E2E_REDTEAM_EO_MARKER,
  pickSubjectWithQuestions,
  seedRedTeamStudent,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
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
const RPC = 'get_study_questions'
const VALID_OPTION_IDS = ['a', 'b', 'c', 'd'] as const

// The RPC's RETURNS TABLE shape (mig 20260626000200). correct_option_id is the
// deliberately-exposed MC answer key; options are stripped to {id, text}.
type StudyQuestionRow = {
  id: string
  question_text: string
  question_image_url: string | null
  options: { id: string; text: string }[]
  correct_option_id: string | null
  subject_code: string
  topic_name: string
  subtopic_name: string | null
  explanation_text: string
  explanation_image_url: string | null
  question_number: string | null
  difficulty: string
}

// Service-role base shape shared by every throwaway question this spec inserts.
type QuestionSeed = {
  organization_id: string
  bank_id: string
  subject_id: string
  topic_id: string
  created_by: string
  question_text: string
  question_number: string
  explanation_text: string
  difficulty: 'easy' | 'medium' | 'hard'
  status: 'active' | 'draft'
}

test.describe('Red Team: get_study_questions RPC (Vector EO)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>

  // egmont (org A) scaffolding — FKs derived from a real active egmont question so
  // the throwaway inserts satisfy every NOT NULL FK without new bank/taxonomy seeding.
  let orgId: string
  let bankId: string
  let subjectId: string
  let topicId: string
  let createdBy: string

  // redteam-other-org (org B) scaffolding.
  let otherOrgId: string
  let otherOrgUserId: string
  let otherOrgBankId: string

  // Throwaway questions (all tracked for soft-delete cleanup).
  let egMcActiveId: string // egmont, active MC — positive control + sibling-active + foreign target for EO2
  let egMcDeletedId: string // egmont, active MC -> soft-deleted in EO3
  let egShortAnswerId: string // egmont, short_answer (non-MC) for EO4
  let otherOrgMcId: string // org B, active MC — EO2 own-org positive control

  const EG_MC_ACTIVE_KEY = 'b'
  const EG_MC_DELETED_KEY = 'a'
  const OTHER_ORG_MC_KEY = 'c'

  const createdQuestionIds = new Set<string>()

  // Insert a multiple_choice question (service-role bypasses the REVOKE-gated key
  // column + RLS). Shape per questions_question_type_columns_check + the MC
  // correct_option_id biconditional (migs 094/111): options set, key in {a,b,c,d},
  // canonical_answer NULL, accepted_synonyms {}, dialog_template NULL, blanks_config [].
  const insertMcQuestion = async (
    base: QuestionSeed,
    correctOptionId: (typeof VALID_OPTION_IDS)[number],
  ): Promise<string> => {
    const { data, error } = await admin
      .from('questions')
      .insert({
        ...base,
        question_type: 'multiple_choice',
        options: [
          { id: 'a', text: 'Alpha' },
          { id: 'b', text: 'Bravo' },
          { id: 'c', text: 'Charlie' },
          { id: 'd', text: 'Delta' },
        ],
        correct_option_id: correctOptionId,
        canonical_answer: null,
        accepted_synonyms: [],
        dialog_template: null,
        blanks_config: [],
      })
      .select('id')
      .single()
    if (error || !data)
      throw new Error(`insert MC question (${base.question_number}): ${error?.message}`)
    createdQuestionIds.add(data.id)
    return data.id
  }

  // Insert a short_answer (non-MC) question. correct_option_id MUST be NULL for a
  // non-MC row (the MC biconditional, mig 111). options is NOT NULL but unconstrained
  // for short_answer, so [] satisfies the schema (mirrors rpc-report-answer-keys.spec.ts).
  const insertShortAnswerQuestion = async (base: QuestionSeed): Promise<string> => {
    const { data, error } = await admin
      .from('questions')
      .insert({
        ...base,
        question_type: 'short_answer',
        options: [],
        correct_option_id: null,
        canonical_answer: 'cleared to land',
        accepted_synonyms: [],
        dialog_template: null,
        blanks_config: [],
      })
      .select('id')
      .single()
    if (error || !data)
      throw new Error(`insert short_answer question (${base.question_number}): ${error?.message}`)
    createdQuestionIds.add(data.id)
    return data.id
  }

  // Build a base seed with a process-unique question_number (the partial unique
  // index uq is per bank WHERE deleted_at IS NULL — a fixed number would collide
  // with a leftover active row from a crashed prior run).
  const baseSeed = (opts: {
    org: string
    bank: string
    creator: string
    label: string
  }): QuestionSeed => ({
    organization_id: opts.org,
    bank_id: opts.bank,
    subject_id: subjectId,
    topic_id: topicId,
    created_by: opts.creator,
    question_text: `${E2E_REDTEAM_EO_MARKER} ${opts.label} fixture`,
    question_number: `${E2E_REDTEAM_EO_MARKER} ${opts.label} ${Date.now()}`,
    explanation_text: 'Red-team EO fixture explanation.',
    difficulty: 'medium',
    status: 'active',
  })

  // Create-or-reuse the single redteam-other-org question_bank (question_banks has
  // a UNIQUE(organization_id) constraint, mig 062 — at most one bank per org). If a
  // prior run left the row soft-deleted, restore it to avoid a 23505 unique-constraint
  // violation on insert; only insert when no row exists at all.
  const ensureOtherOrgBank = async (org: string, creator: string): Promise<string> => {
    const { data: existing, error: lookupErr } = await admin
      .from('question_banks')
      .select('id, deleted_at')
      .eq('organization_id', org)
      .maybeSingle()
    if (lookupErr) throw new Error(`ensureOtherOrgBank lookup: ${lookupErr.message}`)
    if (existing) {
      if (existing.deleted_at !== null) {
        // Prior run left a soft-deleted bank — restore it rather than inserting and
        // hitting the UNIQUE(organization_id) constraint (23505).
        const { data: restored, error: restoreErr } = await admin
          .from('question_banks')
          .update({ deleted_at: null })
          .eq('id', existing.id)
          .select('id')
          .single()
        if (restoreErr || !restored)
          throw new Error(`ensureOtherOrgBank restore: ${restoreErr?.message}`)
        return restored.id
      }
      return existing.id
    }
    const { data: created, error: insErr } = await admin
      .from('question_banks')
      .insert({ organization_id: org, name: 'Red Team EO Other-Org Bank', created_by: creator })
      .select('id')
      .single()
    if (insErr || !created) throw new Error(`ensureOtherOrgBank insert: ${insErr?.message}`)
    return created.id
  }

  test.beforeAll(async () => {
    admin = getAdminClient()

    // egmont victim student (org A) — the in-org caller for EO3/EO4/EO5.
    const seed = await seedRedTeamStudent()
    orgId = seed.orgId
    studentClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

    // org B student (redteam-other-org) — the cross-org caller for EO2.
    const crossOrg = await createCrossOrgUser()
    otherOrgId = crossOrg.orgId
    otherOrgUserId = crossOrg.userId
    crossOrgClient = await createAuthenticatedClient(crossOrg.email, crossOrg.password)

    // Derive valid egmont FK scaffolding (bank_id, subject_id, topic_id, created_by)
    // from a real active egmont question, mirroring rpc-report-answer-keys.spec.ts.
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    topicId = picked.topicId
    const { data: fkRow, error: fkErr } = await admin
      .from('questions')
      .select('bank_id, created_by')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (fkErr) throw new Error(`beforeAll: FK lookup failed: ${fkErr.message}`)
    if (!fkRow) throw new Error('beforeAll: no active egmont question to derive FKs from')
    bankId = fkRow.bank_id as string
    createdBy = fkRow.created_by as string

    // org B bank — reuse the global egmont subject/topic (easa_* are shared reference
    // data with no organization_id, so an org-B question may reference them).
    otherOrgBankId = await ensureOtherOrgBank(otherOrgId, otherOrgUserId)

    // Seed the throwaway questions.
    egMcActiveId = await insertMcQuestion(
      baseSeed({ org: orgId, bank: bankId, creator: createdBy, label: 'egmont-mc-active' }),
      EG_MC_ACTIVE_KEY,
    )
    egMcDeletedId = await insertMcQuestion(
      baseSeed({ org: orgId, bank: bankId, creator: createdBy, label: 'egmont-mc-todelete' }),
      EG_MC_DELETED_KEY,
    )
    egShortAnswerId = await insertShortAnswerQuestion(
      baseSeed({ org: orgId, bank: bankId, creator: createdBy, label: 'egmont-short-answer' }),
    )
    otherOrgMcId = await insertMcQuestion(
      baseSeed({
        org: otherOrgId,
        bank: otherOrgBankId,
        creator: otherOrgUserId,
        label: 'otherorg-mc-active',
      }),
      OTHER_ORG_MC_KEY,
    )
  })

  test.afterAll(async () => {
    // Single cleanup step: soft-delete every inserted question (questions is
    // soft-deletable). The §7 per-step error accumulator is for 2+ steps; this is one.
    // EO3 already soft-deleted egMcDeletedId — the .is('deleted_at', null) filter just
    // skips it, so the re-run is an idempotent no-op.
    if (createdQuestionIds.size === 0) return
    const { data, error } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', Array.from(createdQuestionIds))
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterAll question cleanup: ${error.message}`)
    if ((data?.length ?? 0) > 0) {
      console.log(`[get-study-questions-eo] soft-deleted ${data?.length} fixture question(s)`)
    }
    createdQuestionIds.clear()
  })

  test('EO5 positive control: an in-org student receives the MC question with its answer key', async () => {
    // The deliberate, in-bounds exposure — proven FIRST so the EO1-EO4 negatives
    // cannot pass vacuously (the RPC genuinely returns the key on the allowed path).
    const { data, error } = await studentClient.rpc(RPC, { p_question_ids: [egMcActiveId] })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as StudyQuestionRow[]

    // Exactly the one requested question, no over-return.
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row?.id).toBe(egMcActiveId)

    // The answer key is present and correct — this is what Study Mode deliberately reveals.
    expect(row?.correct_option_id).toBe(EG_MC_ACTIVE_KEY)
    expect(VALID_OPTION_IDS).toContain(row?.correct_option_id)
    expect(row?.explanation_text).toBe('Red-team EO fixture explanation.')

    // options are stripped to {id, text} — no `correct` boolean leaks via the JSONB.
    expect(Array.isArray(row?.options)).toBe(true)
    expect((row?.options ?? []).length).toBeGreaterThan(0)
    for (const opt of row?.options ?? []) {
      expect('correct' in opt).toBe(false)
    }
  })

  test('EO1: an unauthenticated caller is rejected and receives no answer key', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc(RPC, { p_question_ids: [egMcActiveId] })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data).toBeNull()
  })

  test('EO2: a student in another org cannot read a foreign-org question key, but sees their own', async () => {
    // Non-vacuity (1/2): the foreign (egmont) question genuinely exists and is egmont's.
    const { data: existsRow, error: existsErr } = await admin
      .from('questions')
      .select('id, organization_id, question_type')
      .eq('id', egMcActiveId)
      .single()
    expect(existsErr).toBeNull()
    expect(existsRow?.organization_id).toBe(orgId)
    expect(existsRow?.question_type).toBe('multiple_choice')
    expect(orgId).not.toBe(otherOrgId)

    // The org-B student asks for BOTH the foreign egmont question AND their own org's
    // question in a single call. The org filter (q.organization_id = caller's org)
    // must drop the egmont row and keep only the org-B one.
    const { data, error } = await crossOrgClient.rpc(RPC, {
      p_question_ids: [egMcActiveId, otherOrgMcId],
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as StudyQuestionRow[]
    const ids = rows.map((r) => r.id)

    // The foreign-org question — and its key — is NOT leaked across the org boundary.
    expect(ids).not.toContain(egMcActiveId)

    // Non-vacuity (2/2): the org-B student DOES get their OWN org's MC question, with
    // its key — so the empty cross-org result proves the org filter, not an empty table.
    expect(rows).toHaveLength(1)
    const ownRow = rows.find((r) => r.id === otherOrgMcId)
    expect(ownRow).toBeDefined()
    expect(ownRow?.correct_option_id).toBe(OTHER_ORG_MC_KEY)
  })

  test('EO3: a soft-deleted question is excluded while a sibling active question is returned', async () => {
    // Pre-delete: confirm the soon-to-be-deleted question IS returned while active —
    // so the post-delete exclusion proves the deleted_at filter fired, not that the
    // question never existed.
    const before = await studentClient.rpc(RPC, {
      p_question_ids: [egMcDeletedId, egMcActiveId],
    })
    expect(before.error).toBeNull()
    expect(Array.isArray(before.data)).toBe(true)
    const beforeIds = (before.data as StudyQuestionRow[]).map((r) => r.id)
    expect(beforeIds).toContain(egMcDeletedId)
    expect(beforeIds).toContain(egMcActiveId)

    // Soft-delete the question (service-role). Verify a row actually changed.
    const { data: deleted, error: delErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', egMcDeletedId)
      .is('deleted_at', null)
      .select('id')
    expect(delErr).toBeNull()
    expect(deleted?.length).toBe(1)

    // Post-delete: the soft-deleted question is excluded; the sibling active one remains.
    const after = await studentClient.rpc(RPC, {
      p_question_ids: [egMcDeletedId, egMcActiveId],
    })
    expect(after.error).toBeNull()
    expect(Array.isArray(after.data)).toBe(true)
    const afterIds = (after.data as StudyQuestionRow[]).map((r) => r.id)
    expect(afterIds).not.toContain(egMcDeletedId)
    expect(afterIds).toContain(egMcActiveId)
  })

  test('EO4: a non-MC question is excluded while a sibling MC question is returned', async () => {
    // Non-vacuity: the short_answer fixture genuinely exists and is non-MC.
    const { data: saRow, error: saErr } = await admin
      .from('questions')
      .select('id, question_type')
      .eq('id', egShortAnswerId)
      .single()
    expect(saErr).toBeNull()
    expect(saRow?.question_type).toBe('short_answer')

    // The key-bearing RPC must surface only the MC sibling, never the short_answer row.
    const { data, error } = await studentClient.rpc(RPC, {
      p_question_ids: [egShortAnswerId, egMcActiveId],
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const ids = (data as StudyQuestionRow[]).map((r) => r.id)
    expect(ids).not.toContain(egShortAnswerId)
    expect(ids).toContain(egMcActiveId)
  })
})
