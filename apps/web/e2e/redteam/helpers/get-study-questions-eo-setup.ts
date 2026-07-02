/**
 * Shared setup for the get_study_questions (Vector EO) red-team specs.
 *
 * Both get-study-questions-eo.spec.ts (EO1–EO5) and
 * get-study-questions-eo-exam-oracle.spec.ts (EO6–EO7) seed an identical set of
 * throwaway, marker-tagged questions (egmont active/deleted/draft MC, an egmont
 * short_answer, and an org-B active MC) plus the egmont/org-B scaffolding. This
 * module owns that seeding so it is not duplicated. Each spec calls setupEoFixtures
 * in its own beforeAll and cleanupEoFixtures in its own afterAll — every question a
 * spec reads is one its own setup inserted, so the specs stay hermetic and
 * independently runnable (code-style.md §7).
 */

import { getAdminClient } from '../../helpers/supabase'
import { createAuthenticatedClient } from './redteam-client'
import {
  createCrossOrgUser,
  E2E_REDTEAM_EO_MARKER,
  E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
  E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamStudent,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './seed'

export const RPC = 'get_study_questions'
export const VALID_OPTION_IDS = ['a', 'b', 'c', 'd'] as const

export const EG_MC_ACTIVE_KEY = 'b'
export const EG_MC_DELETED_KEY = 'a'
export const EG_MC_DRAFT_KEY = 'd'
export const OTHER_ORG_MC_KEY = 'c'

// The RPC's RETURNS TABLE shape (mig 20260626000200). correct_option_id is the
// deliberately-exposed MC answer key; options are stripped to {id, text}.
export type StudyQuestionRow = {
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

// Service-role base shape shared by every throwaway question the specs insert.
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

export type EoFixtures = {
  admin: ReturnType<typeof getAdminClient>
  studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  orgId: string
  victimUserId: string // egmont student's user id — owner of the EO6 active exam session
  otherOrgId: string
  egMcActiveId: string // egmont, active MC — positive control + sibling-active + foreign target for EO2
  egMcDeletedId: string // egmont, active MC -> soft-deleted in EO3
  egShortAnswerId: string // egmont, short_answer (non-MC) for EO4
  egMcDraftId: string // egmont, draft-status MC — status-filter test
  otherOrgMcId: string // org B, active MC — EO2 own-org positive control
  createdQuestionIds: Set<string>
}

// Seed the egmont/org-B scaffolding and the throwaway questions every EO spec reads.
// Returns the full fixture context; each spec stores it and tears it down via
// cleanupEoFixtures. Each invocation inserts its OWN marker-tagged rows (unique
// question_number per row) so two specs never share or mutate each other's data.
export async function setupEoFixtures(): Promise<EoFixtures> {
  const admin = getAdminClient()
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
    // Active row — reuse as-is.
    if (existing && existing.deleted_at === null) return existing.id
    // Soft-deleted row from a prior crashed run — restore it rather than inserting and
    // hitting the UNIQUE(organization_id) constraint (23505).
    if (existing) {
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
    // No row at all — insert a fresh bank.
    const { data: created, error: insErr } = await admin
      .from('question_banks')
      .insert({ organization_id: org, name: 'Red Team EO Other-Org Bank', created_by: creator })
      .select('id')
      .single()
    if (insErr || !created) throw new Error(`ensureOtherOrgBank insert: ${insErr?.message}`)
    return created.id
  }

  // egmont victim student (org A) — the in-org caller for EO3/EO4/EO5.
  const seed = await seedRedTeamStudent()
  const orgId = seed.orgId
  const victimUserId = seed.victimUserId
  const studentClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

  // org B student (redteam-other-org) — the cross-org caller for EO2.
  const crossOrg = await createCrossOrgUser()
  const otherOrgId = crossOrg.orgId
  const otherOrgUserId = crossOrg.userId
  const crossOrgClient = await createAuthenticatedClient(crossOrg.email, crossOrg.password)

  // Derive valid egmont FK scaffolding (bank_id, subject_id, topic_id, created_by)
  // from a real active egmont question, mirroring rpc-report-answer-keys.spec.ts.
  const picked = await pickSubjectWithQuestions(admin, { orgId })
  const subjectId = picked.subjectId
  const topicId = picked.topicId
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
  if (fkErr) throw new Error(`setupEoFixtures: FK lookup failed: ${fkErr.message}`)
  if (!fkRow) throw new Error('setupEoFixtures: no active egmont question to derive FKs from')
  const bankId = fkRow.bank_id as string
  const createdBy = fkRow.created_by as string

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

  // org B bank — reuse the global egmont subject/topic (easa_* are shared reference
  // data with no organization_id, so an org-B question may reference them).
  const otherOrgBankId = await ensureOtherOrgBank(otherOrgId, otherOrgUserId)

  // Seed the throwaway questions.
  const egMcActiveId = await insertMcQuestion(
    baseSeed({ org: orgId, bank: bankId, creator: createdBy, label: 'egmont-mc-active' }),
    EG_MC_ACTIVE_KEY,
  )
  const egMcDeletedId = await insertMcQuestion(
    baseSeed({ org: orgId, bank: bankId, creator: createdBy, label: 'egmont-mc-todelete' }),
    EG_MC_DELETED_KEY,
  )
  const egShortAnswerId = await insertShortAnswerQuestion(
    baseSeed({ org: orgId, bank: bankId, creator: createdBy, label: 'egmont-short-answer' }),
  )
  const egMcDraftId = await insertMcQuestion(
    {
      ...baseSeed({ org: orgId, bank: bankId, creator: createdBy, label: 'egmont-mc-draft' }),
      status: 'draft',
    },
    EG_MC_DRAFT_KEY,
  )
  const otherOrgMcId = await insertMcQuestion(
    baseSeed({
      org: otherOrgId,
      bank: otherOrgBankId,
      creator: otherOrgUserId,
      label: 'otherorg-mc-active',
    }),
    OTHER_ORG_MC_KEY,
  )

  return {
    admin,
    studentClient,
    crossOrgClient,
    orgId,
    victimUserId,
    otherOrgId,
    egMcActiveId,
    egMcDeletedId,
    egShortAnswerId,
    egMcDraftId,
    otherOrgMcId,
    createdQuestionIds,
  }
}

// Soft-delete every question a spec's setupEoFixtures inserted (questions is
// soft-deletable). Single cleanup step — the §7 per-step accumulator is for 2+ steps.
// A row already soft-deleted (e.g. EO3's egMcDeletedId) is skipped by the
// .is('deleted_at', null) filter, so the re-run is an idempotent no-op.
export async function cleanupEoFixtures(
  admin: ReturnType<typeof getAdminClient>,
  createdQuestionIds: Set<string>,
): Promise<void> {
  if (createdQuestionIds.size === 0) return
  const { data, error } = await admin
    .from('questions')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', Array.from(createdQuestionIds))
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`cleanupEoFixtures: ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(`[get-study-questions-eo] soft-deleted ${data?.length} fixture question(s)`)
  }
  createdQuestionIds.clear()
}

// Create (or realign) the dedicated throwaway EO-SD student, ensuring it is NOT
// soft-deleted from a prior aborted run, and return its user id. Pages through
// listUsers (a single page caps at perPage, so a reused student on a later page must
// not be missed — that would wrongly fall through to createUser and fail on the
// duplicate email). The reuse path also resets the auth password + confirmation so
// signInWithPassword succeeds even if the password constant or auth record drifted.
export async function ensureEoSoftDelStudent(
  admin: ReturnType<typeof getAdminClient>,
  orgId: string,
): Promise<string> {
  let existingId: string | undefined
  for (let page = 1; ; page++) {
    // Belt-and-suspenders ceiling: if the SDK ever ignores `page` and returns a full
    // page every call, fail loudly instead of hanging until the beforeAll timeout.
    if (page > 50)
      throw new Error('EO-SD beforeAll: listUsers exceeded 50 pages — possible API bug')
    const { data: authList, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (listError) throw new Error(`EO-SD beforeAll: listUsers failed: ${listError.message}`)
    const match = authList.users.find((u) => u.email === E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL)
    if (match) {
      existingId = match.id
      break
    }
    if (authList.users.length < 200) break
  }

  if (existingId) {
    const { data: userRow, error: userRowErr } = await admin
      .from('users')
      .select('id, organization_id, role, deleted_at')
      .eq('id', existingId)
      .maybeSingle()
    if (userRowErr) throw new Error(`EO-SD beforeAll: users lookup: ${userRowErr.message}`)
    if (!userRow) {
      const { error: insErr } = await admin.from('users').insert({
        id: existingId,
        organization_id: orgId,
        email: E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
        full_name: 'Red Team Soft-Delete Study Student',
        role: 'student',
      })
      if (insErr) throw new Error(`EO-SD beforeAll: insert user: ${insErr.message}`)
    } else if (
      userRow.organization_id !== orgId ||
      userRow.role !== 'student' ||
      userRow.deleted_at !== null
    ) {
      const { data: realigned, error: updErr } = await admin
        .from('users')
        .update({ organization_id: orgId, role: 'student', deleted_at: null })
        .eq('id', existingId)
        .select('id')
      if (updErr) throw new Error(`EO-SD beforeAll: realign user: ${updErr.message}`)
      if (!realigned?.length) throw new Error('EO-SD beforeAll: realign affected 0 rows')
    }
    // Mirror the create branch's auth setup on reuse so signInWithPassword works even
    // if the password constant changed or the auth record drifted since a prior run.
    const { error: authErr } = await admin.auth.admin.updateUserById(existingId, {
      password: E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
      email_confirm: true,
    })
    if (authErr) throw new Error(`EO-SD beforeAll: auth realign: ${authErr.message}`)
    return existingId
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
    password: E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
    email_confirm: true,
  })
  if (createErr || !created.user)
    throw new Error(`EO-SD beforeAll: createUser: ${createErr?.message}`)
  const { error: insErr } = await admin.from('users').insert({
    id: created.user.id,
    organization_id: orgId,
    email: E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
    full_name: 'Red Team Soft-Delete Study Student',
    role: 'student',
  })
  if (insErr) throw new Error(`EO-SD beforeAll: insert user: ${insErr.message}`)
  return created.user.id
}
