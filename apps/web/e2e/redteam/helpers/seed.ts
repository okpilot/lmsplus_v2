import { getAdminClient } from '../../helpers/supabase'

export const ATTACKER_EMAIL = 'redteam-attacker@lmsplus.local'
export const VICTIM_EMAIL = 'redteam-victim@lmsplus.local'
export const ATTACKER_PASSWORD = 'redteam-attacker-2026!'
export const VICTIM_PASSWORD = 'redteam-victim-2026!'

export const ADMIN_EMAIL = 'redteam-admin@lmsplus.local'
export const ADMIN_PASSWORD = 'redteam-admin-2026!'
export const CROSS_ORG_ADMIN_EMAIL = 'redteam-crossorg-admin@lmsplus.local'
export const CROSS_ORG_ADMIN_PASSWORD = 'redteam-crossorg-admin-2026!'

// E2E hermiticity markers — exported per code-style.md §7 so cleanup queries
// in any spec or maintenance script can target the rows these tests create.
export const E2E_REDTEAM_CODE_PREFIX = 'RT'
export const E2E_XSS_MARKER = '[E2E_XSS]'

const OTHER_ORG_SLUG = 'redteam-other-org'

/** Resolve the egmont-aviation org id, throwing loudly if absent. */
async function getEgmontOrgId(admin: ReturnType<typeof getAdminClient>): Promise<string> {
  const { data: org, error } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (error || !org) throw new Error(`Could not find egmont-aviation org: ${error?.message}`)
  return org.id
}

export async function seedRedTeamUsers(): Promise<{
  attackerUserId: string
  victimUserId: string
  orgId: string
  otherOrgId: string
}> {
  const admin = getAdminClient()

  const orgId = await getEgmontOrgId(admin)

  // Create redteam-other-org (idempotent)
  const { data: existingOtherOrg } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', OTHER_ORG_SLUG)
    .maybeSingle()

  let otherOrgId: string
  if (existingOtherOrg) {
    otherOrgId = existingOtherOrg.id
  } else {
    const { data: newOrg, error: newOrgError } = await admin
      .from('organizations')
      .insert({ name: 'Red Team Other Org', slug: OTHER_ORG_SLUG })
      .select('id')
      .single()
    if (newOrgError || !newOrg)
      throw new Error(`Could not create redteam-other-org: ${newOrgError?.message}`)
    otherOrgId = newOrg.id
  }

  // Create attacker user (idempotent)
  const attackerUserId = await upsertUser(admin, ATTACKER_EMAIL, ATTACKER_PASSWORD, orgId)

  // Create victim user (idempotent)
  const victimUserId = await upsertUser(admin, VICTIM_EMAIL, VICTIM_PASSWORD, orgId)

  return { attackerUserId, victimUserId, orgId, otherOrgId }
}

export async function createCrossOrgUser(): Promise<{
  userId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()

  const { data: otherOrg, error: otherOrgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', OTHER_ORG_SLUG)
    .maybeSingle()
  if (otherOrgError) throw new Error(`Could not query redteam-other-org: ${otherOrgError.message}`)

  let orgId: string
  if (otherOrg) {
    orgId = otherOrg.id
  } else {
    const { data: newOrg, error: newOrgError } = await admin
      .from('organizations')
      .insert({ name: 'Red Team Other Org', slug: OTHER_ORG_SLUG })
      .select('id')
      .single()
    if (newOrgError || !newOrg)
      throw new Error(`Could not create redteam-other-org: ${newOrgError?.message}`)
    orgId = newOrg.id
  }

  const email = 'redteam-crossorg@lmsplus.local'
  const password = 'redteam-crossorg-2026!'
  const userId = await upsertUser(admin, email, password, orgId)

  return { userId, orgId, email, password }
}

/**
 * Ensure an admin user exists in the egmont-aviation org.
 * Used by internal-exam red-team specs that need to call admin-only RPCs.
 */
export async function seedRedTeamAdmin(): Promise<{
  adminUserId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()
  const orgId = await getEgmontOrgId(admin)

  const adminUserId = await upsertUser(admin, ADMIN_EMAIL, ADMIN_PASSWORD, orgId, 'admin')
  return { adminUserId, orgId, email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
}

/**
 * Ensure an admin user exists in the OTHER (cross-org) org.
 * Used to test cross-org admin paths (e.g. void_internal_exam_code with foreign org code).
 */
export async function seedCrossOrgAdmin(): Promise<{
  adminUserId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()
  const { data: existingOtherOrg } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', OTHER_ORG_SLUG)
    .maybeSingle()

  let orgId: string
  if (existingOtherOrg) {
    orgId = existingOtherOrg.id
  } else {
    const { data: newOrg, error: newOrgError } = await admin
      .from('organizations')
      .insert({ name: 'Red Team Other Org', slug: OTHER_ORG_SLUG })
      .select('id')
      .single()
    if (newOrgError || !newOrg)
      throw new Error(`Could not create redteam-other-org: ${newOrgError?.message}`)
    orgId = newOrg.id
  }

  const adminUserId = await upsertUser(
    admin,
    CROSS_ORG_ADMIN_EMAIL,
    CROSS_ORG_ADMIN_PASSWORD,
    orgId,
    'admin',
  )
  return { adminUserId, orgId, email: CROSS_ORG_ADMIN_EMAIL, password: CROSS_ORG_ADMIN_PASSWORD }
}

/**
 * Pick the first subject (by `code` ASC) in `orgId` whose active, non-deleted
 * question count meets `minActiveQuestions`, then the first topic within that
 * subject (by `sort_order` ASC, then `id` ASC) whose active, non-deleted
 * question count meets `topicMinQuestions`.
 *
 * Deterministic replacement for the `.limit(1)` "first subject + first topic"
 * pattern used across red-team specs. PostgREST `.limit(1)` without ORDER BY
 * returns rows in physical order — after seed 080 added a taxonomy-only
 * subject with zero questions, that pattern intermittently picked an empty
 * subject and crashed `start_quiz_session` (issue #622).
 *
 * Throws with a descriptive message if no subject or no topic meets the
 * threshold, so test failures are loud rather than silent.
 */
export async function pickSubjectWithQuestions(
  admin: ReturnType<typeof getAdminClient>,
  opts: { orgId: string; minActiveQuestions?: number; topicMinQuestions?: number },
): Promise<{ subjectId: string; subjectCode: string; topicId: string }> {
  const { orgId } = opts
  const minActiveQuestions = opts.minActiveQuestions ?? 1
  const topicMinQuestions = opts.topicMinQuestions ?? 1

  // easa_subjects is shared reference data (no organization_id, no deleted_at).
  // Org scoping lives on `questions` and is enforced by countActiveQuestions below.
  const { data: subjects, error: subjectsError } = await admin
    .from('easa_subjects')
    .select('id, code')
    .order('code', { ascending: true })
  if (subjectsError) throw new Error(`pickSubjectWithQuestions subjects: ${subjectsError.message}`)
  if (!subjects || subjects.length === 0)
    throw new Error(`pickSubjectWithQuestions: no easa_subjects found (orgId=${orgId})`)

  for (const subject of subjects) {
    const subjectQCount = await countActiveQuestions(admin, { orgId, subjectId: subject.id })
    if (subjectQCount < minActiveQuestions) continue

    const topicId = await findTopicWithQuestions(admin, {
      orgId,
      subjectId: subject.id,
      subjectCode: subject.code,
      topicMinQuestions,
    })
    if (topicId) return { subjectId: subject.id, subjectCode: subject.code, topicId }
  }

  throw new Error(
    `pickSubjectWithQuestions: no subject in org ${orgId} has ` +
      `>=${minActiveQuestions} active question(s) with a topic having ` +
      `>=${topicMinQuestions} active question(s)`,
  )
}

async function findTopicWithQuestions(
  admin: ReturnType<typeof getAdminClient>,
  opts: { orgId: string; subjectId: string; subjectCode: string; topicMinQuestions: number },
): Promise<string | null> {
  const { orgId, subjectId, subjectCode, topicMinQuestions } = opts

  // easa_topics is shared reference data (no organization_id, no deleted_at).
  // Org scoping is enforced by the countActiveQuestions call below.
  const { data: topics, error: topicsError } = await admin
    .from('easa_topics')
    .select('id, sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (topicsError)
    throw new Error(`pickSubjectWithQuestions topics for ${subjectCode}: ${topicsError.message}`)
  if (!topics || topics.length === 0) return null

  for (const topic of topics) {
    const count = await countActiveQuestions(admin, { orgId, subjectId, topicId: topic.id })
    if (count >= topicMinQuestions) return topic.id
  }
  return null
}

async function countActiveQuestions(
  admin: ReturnType<typeof getAdminClient>,
  opts: { orgId: string; subjectId: string; topicId?: string },
): Promise<number> {
  let q = admin
    .from('questions')
    .select('id', { head: true, count: 'exact' })
    .eq('organization_id', opts.orgId)
    .eq('subject_id', opts.subjectId)
    .eq('status', 'active')
    .is('deleted_at', null)
  if (opts.topicId) q = q.eq('topic_id', opts.topicId)
  const { count, error } = await q
  if (error)
    throw new Error(
      `pickSubjectWithQuestions count subject=${opts.subjectId} topic=${opts.topicId ?? 'none'}: ${error.message}`,
    )
  return count ?? 0
}

/**
 * Ensure an enabled exam_config (with at least one distribution row) exists for
 * (orgId, subjectId). Idempotent. Returns the exam_config id.
 *
 * Used by internal-exam red-team specs that exercise issue/start RPCs which
 * require an exam_config row to be present.
 */
export async function ensureExamConfig(
  orgId: string,
  subjectId: string,
  topicId: string,
): Promise<string> {
  const admin = getAdminClient()

  const { data: existing, error: existingError } = await admin
    .from('exam_configs')
    .select('id, enabled')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (existingError) throw new Error(`ensureExamConfig select: ${existingError.message}`)

  let configId: string
  if (existing) {
    configId = existing.id
    if (!existing.enabled) {
      const { error: enableError } = await admin
        .from('exam_configs')
        .update({ enabled: true })
        .eq('id', configId)
      if (enableError) throw new Error(`ensureExamConfig enable: ${enableError.message}`)
    }
  } else {
    const { data: created, error: createError } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (createError || !created) throw new Error(`ensureExamConfig insert: ${createError?.message}`)
    configId = created.id
  }

  // Ensure at least one distribution row.
  const { data: dist } = await admin
    .from('exam_config_distributions')
    .select('id')
    .eq('exam_config_id', configId)
    .order('id', { ascending: true })
    .limit(1)
  if (!dist || dist.length === 0) {
    const { error: distError } = await admin.from('exam_config_distributions').insert({
      exam_config_id: configId,
      topic_id: topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (distError) throw new Error(`ensureExamConfig distribution: ${distError.message}`)
  }

  return configId
}

// Module-private instructor creds — not exported; callers receive them via the
// return value of seedRedTeamInstructor() (Req 5.1).
const INSTRUCTOR_EMAIL = 'redteam-instructor@lmsplus.local'
const INSTRUCTOR_PASSWORD = 'redteam-instructor-2026!'

/**
 * Ensure an instructor user exists in the egmont-aviation org (zero responses).
 * Mirrors seedRedTeamAdmin exactly, using the instructor role.
 * Returns the credentials so a spec can sign in without importing module-private consts.
 */
export async function seedRedTeamInstructor(): Promise<{
  instructorUserId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()
  const orgId = await getEgmontOrgId(admin)

  const instructorUserId = await upsertUser(
    admin,
    INSTRUCTOR_EMAIL,
    INSTRUCTOR_PASSWORD,
    orgId,
    'instructor',
  )
  return { instructorUserId, orgId, email: INSTRUCTOR_EMAIL, password: INSTRUCTOR_PASSWORD }
}

/**
 * Expose the egmont victim student credentials for sign-in.
 * Idempotent: upsertUser is a no-op if the user already exists.
 * Returns the credentials so a spec can authenticate as the victim
 * without importing VICTIM_EMAIL/VICTIM_PASSWORD directly.
 */
export async function seedRedTeamStudent(): Promise<{
  victimUserId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()
  const orgId = await getEgmontOrgId(admin)

  const victimUserId = await upsertUser(admin, VICTIM_EMAIL, VICTIM_PASSWORD, orgId)
  return { victimUserId, orgId, email: VICTIM_EMAIL, password: VICTIM_PASSWORD }
}

// Sentinel value stamped on every response row this seeder inserts.
// Allows the idempotency guard to count only rows created by this helper.
const SENTINEL_RESPONSE_TIME_MS = 987654

export type VictimResponseFixture = {
  victimUserId: string
  correctCount: number
  subjectIds: string[]
  questionIds: string[]
  expected: { current: 3; best: 5 }
}

/**
 * Inserts a deterministic, idempotent set of 8 student_responses for the egmont victim.
 *
 * Design notes:
 *
 * (i) Append-only table: student_responses is immutable (docs/security.md §6 — never
 *   UPDATE or DELETE). Rows are inserted once and left permanently, mirroring the
 *   persistent seed users. No afterEach/afterAll cleanup is needed or correct.
 *
 * (ii) is_correct is what the RPC trusts: get_student_mastery_stats reads sr.is_correct
 *   directly. selected_option_id: 'a' is cosmetic — do not "fix" it to the question's
 *   real correct option.
 *
 * (iii) Duplicate-tolerance: a partial prior run (1–7 sentinel rows) cannot be undone
 *   (append-only), so a re-run inserts a fresh 8. Duplicates are harmless because every
 *   consuming RPC collapses them: streak uses SELECT DISTINCT dates, mastery uses
 *   COUNT(DISTINCT question_id), last-practiced is MAX(created_at) GROUP BY subject_id.
 *   The UNIQUE(session_id, question_id) constraint stays inert because session_id IS NULL
 *   (Postgres treats NULLs as distinct).
 *
 * (iv) The 3-day gap between runs (offsets -3/-4/-5 are absent) must stay >=2 days to
 *   keep the current run (today/-1/-2 → length 3) and the best run (-6..-10 → length 5)
 *   disjoint under the function's run_end >= today-1 anchor.
 */
export async function seedVictimResponses(): Promise<VictimResponseFixture> {
  const { victimUserId, orgId } = await seedRedTeamStudent()
  const admin = getAdminClient()

  // Idempotency guard: if a complete prior seed already exists, skip the insert
  // and re-derive the fixture from those rows. Use >= 8 (not === 8): a partial
  // prior run leaves 1-7 rows, but once a full run lands the count is 8+, and a
  // strict === 8 would let any over-count (e.g. partial-then-full = 9-15) fall
  // through and insert AGAIN, accumulating unboundedly. Duplicates are otherwise
  // harmless (see the duplicate-tolerance note above), so >= 8 short-circuits
  // correctly on any complete-or-over-complete prior seed.
  const { count, error: countError } = await admin
    .from('student_responses')
    .select('id', { head: true, count: 'exact' })
    .eq('student_id', victimUserId)
    .eq('response_time_ms', SENTINEL_RESPONSE_TIME_MS)
  if (countError) throw new Error(`seedVictimResponses count: ${countError.message}`)

  if ((count ?? 0) >= 8) {
    // Re-derive fixture from the existing sentinel rows.
    const { data: existingRows, error: rowsError } = await admin
      .from('student_responses')
      .select('question_id')
      .eq('student_id', victimUserId)
      .eq('response_time_ms', SENTINEL_RESPONSE_TIME_MS)
    if (rowsError) throw new Error(`seedVictimResponses re-derive rows: ${rowsError.message}`)

    const questionIds = (existingRows ?? []).map((r) => r.question_id as string)
    const uniqueQuestionIds = [...new Set(questionIds)]

    const { data: questionRows, error: qError } = await admin
      .from('questions')
      .select('id, subject_id')
      .in('id', uniqueQuestionIds)
    if (qError) throw new Error(`seedVictimResponses re-derive questions: ${qError.message}`)

    const subjectIds = [...new Set((questionRows ?? []).map((q) => q.subject_id as string))]

    return {
      victimUserId,
      // Distinct questions the mastery RPC will count as correct (COUNT(DISTINCT
      // question_id)) — not the raw row count, which round-robin may repeat.
      correctCount: uniqueQuestionIds.length,
      subjectIds,
      questionIds,
      expected: { current: 3, best: 5 },
    }
  }

  // Select up to 8 active, non-deleted egmont questions (deterministic order).
  const { data: questions, error: questionsError } = await admin
    .from('questions')
    .select('id, subject_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(8)
  if (questionsError) throw new Error(`seedVictimResponses questions: ${questionsError.message}`)
  if (!questions || questions.length === 0) {
    throw new Error('seedVictimResponses: need >=1 active egmont question, found 0')
  }

  // Build 8 timestamps from a single snapshot — noon UTC, one per offset day.
  // Using a single `now` prevents a UTC-midnight rollover mid-seed from splitting a run.
  const now = new Date()
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)
  const offsets = [0, 1, 2, 6, 7, 8, 9, 10] // current run: today/-1/-2; best run: -6..-10

  // Build 8 rows — one per date — assigning questions round-robin over the available set.
  const rows = offsets.map((offset, i) => {
    const question = questions[i % questions.length]
    return {
      organization_id: orgId,
      student_id: victimUserId,
      question_id: question.id,
      selected_option_id: 'a',
      is_correct: true,
      response_time_ms: SENTINEL_RESPONSE_TIME_MS,
      session_id: null,
      created_at: new Date(base - offset * 86_400_000).toISOString(),
    }
  })

  const { error: insertError } = await admin.from('student_responses').insert(rows)
  if (insertError) throw new Error(`seedVictimResponses insert: ${insertError.message}`)

  const questionIds = rows.map((r) => r.question_id)
  const subjectIds = [...new Set(questions.map((q) => q.subject_id as string))]

  return {
    victimUserId,
    // Distinct questions the mastery RPC will count as correct (COUNT(DISTINCT
    // question_id)) — not the raw row count, which round-robin may repeat.
    correctCount: new Set(questionIds).size,
    subjectIds,
    questionIds,
    expected: { current: 3, best: 5 },
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function upsertUser(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  password: string,
  orgId: string,
  role: 'student' | 'admin' | 'instructor' = 'student',
): Promise<string> {
  // Check if auth user already exists
  const { data: list, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`Could not list users: ${listError.message}`)

  const existing = list.users.find((u) => u.email === email)
  if (existing) {
    // Ensure public.users row exists (may have been cleaned up) AND has the
    // expected role + org. Re-running the helper across spec files must be
    // idempotent; a user that drifted (org changed, role demoted) gets fixed.
    const { data: userRow } = await admin
      .from('users')
      .select('id, organization_id, role')
      .eq('id', existing.id)
      .maybeSingle()
    if (!userRow) {
      const { error: insertError } = await admin.from('users').insert({
        id: existing.id,
        organization_id: orgId,
        email,
        full_name: `Red Team ${email.split('@')[0]}`,
        role,
      })
      if (insertError)
        throw new Error(`Could not insert user row for ${email}: ${insertError.message}`)
    } else if (userRow.organization_id !== orgId || userRow.role !== role) {
      const { error: updateError } = await admin
        .from('users')
        .update({ organization_id: orgId, role })
        .eq('id', existing.id)
      if (updateError)
        throw new Error(`Could not realign user row for ${email}: ${updateError.message}`)
    }
    return existing.id
  }

  // Create auth user
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user)
    throw new Error(`Could not create auth user ${email}: ${createError?.message}`)

  const userId = created.user.id

  // Insert into users table
  const { error: insertError } = await admin.from('users').insert({
    id: userId,
    organization_id: orgId,
    email,
    full_name: `Red Team ${email.split('@')[0]}`,
    role,
  })
  if (insertError) throw new Error(`Could not insert user row for ${email}: ${insertError.message}`)

  return userId
}
