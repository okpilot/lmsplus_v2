/**
 * Red Team Spec: get_report_answer_keys RPC (Vector EN, #989)
 *
 * SECURITY DEFINER RPC (mig 133) returning the NON-MC answer keys for a COMPLETED
 * session the caller owns: short_answer's canonical_answer (one row per question,
 * blank_index NULL) and dialog_fill's per-blank canonicals from blanks_config
 * (one row per blank). These answer-key columns are REVOKE-gated from authenticated
 * (mig 094); SECURITY DEFINER bypasses the REVOKE, so the guard set is the only
 * thing standing between an attacker and the keys. Sibling of get_report_correct_options
 * (mig 114, rpc-report.spec.ts Vectors L/M/N), which delivers the MC key.
 *
 * Vectors (attack-surface.md EN):
 *  - EN1 unauthenticated -> 'Not authenticated' (auth.uid() IS NULL guard).
 *  - EN2 cross-student / foreign session_id (IDOR) ->
 *        'Session not found, not owned, or not completed' (ownership EXISTS guard).
 *  - EN3 the owner's own session that is still active (ended_at IS NULL) ->
 *        same message (the EXISTS guard requires ended_at IS NOT NULL).
 *  - EN4 a soft-deleted caller holding a valid JWT ->
 *        'user not found or inactive' (active-user gate, fires before ownership).
 *  - positive control: the owner reads keys for a completed session seeded with
 *        a real short_answer + dialog_fill question (non-vacuity for EN1-EN4).
 *
 * Non-vacuity (code-style.md §7): the positive control seeds real non-MC questions
 * — egmont seeds MC-only, so without this the RPC would return 0 rows for an
 * unrelated reason and the "keys not leaked" negatives would pass vacuously. The
 * positive control confirms keys ARE returned for the owner+completed path BEFORE
 * the negative probes run.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  E2E_REDTEAM_EN_MARKER,
  E2E_REDTEAM_EN_SOFTDEL_STUDENT_EMAIL,
  E2E_REDTEAM_EN_SOFTDEL_STUDENT_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// Fail fast (matches server-action-unauthenticated.spec.ts): a missing anon key must
// surface as a deterministic setup error at load — not a misleading RPC/auth failure
// inside EN1 (where the '' fallback would build a client that then fails opaquely).
if (!ANON_KEY) {
  throw new Error(
    'rpc-report-answer-keys.spec: NEXT_PUBLIC_SUPABASE_ANON_KEY is required (set it in apps/web/.env.local)',
  )
}
const RPC = 'get_report_answer_keys'

// Dedicated throwaway student for EN4 — NOT the shared redteam-victim@. Soft-deleting
// the shared victim risks cross-spec failures if the process crashes mid-test; this
// email is unique to this file so the blast radius of a soft-delete is bounded here.
// Aliased from the shared helper exports (code-style §7 #1: markers/fixtures from a shared module).
const SOFTDEL_STUDENT_EMAIL = E2E_REDTEAM_EN_SOFTDEL_STUDENT_EMAIL
const SOFTDEL_STUDENT_PASSWORD = E2E_REDTEAM_EN_SOFTDEL_STUDENT_PASSWORD

// Hermeticity markers for the non-MC questions this spec inserts (egmont has none).
const EN_SHORT_ANSWER_QNUM = `${E2E_REDTEAM_EN_MARKER} short-answer`
const EN_DIALOG_FILL_QNUM = `${E2E_REDTEAM_EN_MARKER} dialog-fill`

const SHORT_ANSWER_CANONICAL = 'cleared to land'
const DIALOG_BLANKS = [
  { index: 0, canonical: 'cleared to land', synonyms: [] as string[] },
  { index: 1, canonical: 'two seven', synonyms: ['27'] },
]

test.describe('Red Team: get_report_answer_keys RPC (Vector EN)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let orgId: string
  let subjectId: string
  // FKs derived from a real egmont MC question so the inserted non-MC questions
  // satisfy every NOT NULL FK (bank_id, topic_id, created_by) without new seeding.
  let bankId: string
  let topicId: string
  let createdBy: string
  let shortAnswerQuestionId: string
  let dialogFillQuestionId: string

  const createdSessionIds = new Set<string>()
  const createdQuestionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    orgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId

    // Derive valid FKs (bank_id, topic_id, created_by) from a real active egmont
    // question so the non-MC inserts below satisfy the questions table's NOT NULL
    // FKs without standing up the VFR-RT training seed.
    const { data: fkRow, error: fkErr } = await admin
      .from('questions')
      .select('bank_id, topic_id, created_by')
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
    topicId = fkRow.topic_id as string
    createdBy = fkRow.created_by as string

    // Insert one short_answer + one dialog_fill question via the service-role client
    // (bypasses the REVOKE-gated answer-key columns + the type/columns CHECK).
    // Shape mirrors seed-vfr-rt-training-eval.ts and the questions_question_type_columns_check
    // (mig 094): MC=options only; short_answer=canonical_answer set, blanks=[];
    // dialog_fill=dialog_template set + blanks_config length>0; correct_option_id NULL for both.
    const baseQuestion = {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: subjectId,
      topic_id: topicId,
      created_by: createdBy,
      question_text: `${E2E_REDTEAM_EN_MARKER} report-answer-keys fixture`,
      explanation_text: 'Red-team EN fixture explanation.',
      difficulty: 'medium' as const,
      status: 'active' as const,
      options: [] as unknown[],
      correct_option_id: null,
    }

    const { data: saRow, error: saErr } = await admin
      .from('questions')
      .insert({
        ...baseQuestion,
        question_number: EN_SHORT_ANSWER_QNUM,
        question_type: 'short_answer',
        canonical_answer: SHORT_ANSWER_CANONICAL,
        accepted_synonyms: [],
        dialog_template: null,
        blanks_config: [],
      })
      .select('id')
      .single()
    if (saErr || !saRow) throw new Error(`beforeAll: short_answer insert: ${saErr?.message}`)
    shortAnswerQuestionId = saRow.id
    createdQuestionIds.add(saRow.id)

    const { data: dfRow, error: dfErr } = await admin
      .from('questions')
      .insert({
        ...baseQuestion,
        question_number: EN_DIALOG_FILL_QNUM,
        question_type: 'dialog_fill',
        canonical_answer: null,
        accepted_synonyms: [],
        // Placeholders MUST be {{N|answer}} (mig 125 questions_dialog_fill_template_wellformed:
        // after stripping /\{\{\d+\|[^{}|]*\}\}/ no braces may remain). The embedded answer is
        // stripped before reaching students (get_quiz_questions, mig 126); ';' separates synonyms.
        dialog_template: 'Tower: {{0|cleared to land}}, runway {{1|two seven;27}}.',
        blanks_config: DIALOG_BLANKS,
      })
      .select('id')
      .single()
    if (dfErr || !dfRow) throw new Error(`beforeAll: dialog_fill insert: ${dfErr?.message}`)
    dialogFillQuestionId = dfRow.id
    createdQuestionIds.add(dfRow.id)
  })

  // Seed a victim-owned session. When completed + answered, the RPC returns its keys.
  const seedSession = async (opts: {
    studentId: string
    completed: boolean
    questionIds?: string[]
  }): Promise<string> => {
    const questionIds = opts.questionIds ?? []
    const row: Record<string, unknown> = {
      organization_id: orgId,
      student_id: opts.studentId,
      mode: 'quick_quiz',
      subject_id: subjectId,
      config: { question_ids: questionIds },
      total_questions: questionIds.length > 0 ? questionIds.length : 1,
      started_at: new Date(Date.now() - 60_000).toISOString(),
    }
    if (opts.completed) {
      row.ended_at = new Date().toISOString()
      row.score_percentage = 0
      // quick_quiz leaves passed NULL in production: batch_submit_quiz's pass_mark
      // block is mode-guarded to mock_exam/internal_exam (mig 132), so practice modes
      // never set passed. (Irrelevant to get_report_answer_keys, which gates on
      // ended_at only — but the seed matches the production completion shape.)
      row.passed = null
      row.correct_count = 0
    }
    const { data, error } = await admin.from('quiz_sessions').insert(row).select('id').single()
    if (error || !data) throw new Error(`seed session: ${error?.message}`)
    createdSessionIds.add(data.id)
    return data.id
  }

  // Insert immutable (append-only) answer rows for the seeded session. The
  // blank_index<->dialog_fill trigger (mig 131) requires: short_answer -> blank_index
  // NULL + response_text set; dialog_fill -> one row PER BLANK with blank_index set.
  const seedAnswers = async (sessionId: string): Promise<void> => {
    const rows: Record<string, unknown>[] = [
      {
        session_id: sessionId,
        question_id: shortAnswerQuestionId,
        selected_option_id: null,
        response_text: SHORT_ANSWER_CANONICAL,
        blank_index: null,
        is_correct: true,
        response_time_ms: 5000,
      },
      ...DIALOG_BLANKS.map((b) => ({
        session_id: sessionId,
        question_id: dialogFillQuestionId,
        selected_option_id: null,
        response_text: b.canonical,
        blank_index: b.index,
        is_correct: true,
        response_time_ms: 5000,
      })),
    ]
    const { error } = await admin.from('quiz_session_answers').insert(rows)
    if (error) throw new Error(`seed answers: ${error.message}`)
  }

  test.afterEach(async () => {
    // Soft-delete only the sessions; the immutable quiz_session_answers rows are
    // never hard-deleted and cannot pollute other specs once their session is
    // soft-deleted (mirrors rpc-report.spec.ts). Questions are torn down in afterAll.
    if (createdSessionIds.size === 0) return
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(createdSessionIds))
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[report-answer-keys] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  test.afterAll(async () => {
    // Soft-delete the non-MC fixture questions (questions is soft-deletable).
    if (createdQuestionIds.size === 0) return
    const { data, error } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', Array.from(createdQuestionIds))
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterAll question cleanup: ${error.message}`)
    if ((data?.length ?? 0) > 0) {
      console.log(`[report-answer-keys] soft-deleted ${data?.length} fixture question(s)`)
    }
    createdQuestionIds.clear()
  })

  test('positive control: the owner reads non-MC answer keys for a completed session', async () => {
    // Non-vacuity for EN1-EN4: prove the keys ARE returned on the owner+completed
    // path before asserting they are NOT returned on the blocked paths.
    const sessionId = await seedSession({
      studentId: victimUserId,
      completed: true,
      questionIds: [shortAnswerQuestionId, dialogFillQuestionId],
    })
    await seedAnswers(sessionId)

    const { data, error } = await victimClient.rpc(RPC, { p_session_id: sessionId })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as {
      question_id: string
      question_type: string
      blank_index: number | null
      answer_key: string
    }[]

    // Full-contract (code-style §7): the RPC must return ONLY this session's two
    // fixture questions' keys (1 short_answer row + 1 row per dialog_fill blank) —
    // a regression that over-returns extra answer-key rows must fail here, not pass
    // via subset filtering below.
    expect(rows.map((r) => r.question_id).sort()).toEqual(
      [shortAnswerQuestionId, ...DIALOG_BLANKS.map(() => dialogFillQuestionId)].sort(),
    )

    // short_answer: exactly ONE row, blank_index NULL, answer_key = canonical.
    const saRows = rows.filter((r) => r.question_id === shortAnswerQuestionId)
    expect(saRows).toHaveLength(1)
    expect(saRows[0]?.question_type).toBe('short_answer')
    expect(saRows[0]?.blank_index).toBeNull()
    expect(saRows[0]?.answer_key).toBe(SHORT_ANSWER_CANONICAL)

    // dialog_fill: ONE row PER BLANK, each blank_index -> its canonical.
    const dfRows = rows.filter((r) => r.question_id === dialogFillQuestionId)
    expect(dfRows).toHaveLength(DIALOG_BLANKS.length)
    for (const blank of DIALOG_BLANKS) {
      const match = dfRows.find((r) => r.blank_index === blank.index)
      expect(match).toBeDefined()
      expect(match?.question_type).toBe('dialog_fill')
      expect(match?.answer_key).toBe(blank.canonical)
    }
  })

  test('EN1: an unauthenticated caller is rejected', async () => {
    const sessionId = await seedSession({
      studentId: victimUserId,
      completed: true,
      questionIds: [shortAnswerQuestionId, dialogFillQuestionId],
    })
    await seedAnswers(sessionId)
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data).toBeNull()
  })

  test('EN2: a different student cannot read a foreign session report (IDOR)', async () => {
    const sessionId = await seedSession({
      studentId: victimUserId,
      completed: true,
      questionIds: [shortAnswerQuestionId, dialogFillQuestionId],
    })
    await seedAnswers(sessionId)
    const { data, error } = await attackerClient.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found, not owned, or not completed/i)
    expect(data).toBeNull()
  })

  test('EN3: the owner cannot read keys for a still-active session', async () => {
    // Same combined-guard message as EN2; the distinguishing factor is the setup
    // (own-but-active session vs. foreign-completed session). The ownership EXISTS
    // guard requires ended_at IS NOT NULL.
    const sessionId = await seedSession({
      studentId: victimUserId,
      completed: false,
      questionIds: [shortAnswerQuestionId, dialogFillQuestionId],
    })
    await seedAnswers(sessionId)
    const { data, error } = await victimClient.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found, not owned, or not completed/i)
    expect(data).toBeNull()
  })

  // --- EN4: soft-deleted caller (active-user gate) ---

  test.describe('EN4: a soft-deleted caller is rejected by the active-user gate', () => {
    // A dedicated throwaway student owns a COMPLETED session whose non-MC keys they
    // can read while active. After soft-delete (users.deleted_at set), the active-user
    // gate (which fires right after auth.uid(), BEFORE the ownership check) must reject
    // with 'user not found or inactive' — proving a deactivated account with a still
    // valid JWT cannot keep reading answer keys. Patterns EI/EJ
    // (rpc-admin-authoring-report-soft-deleted.spec.ts) for the student-facing path.
    let softDelStudentId = ''
    let softDelStudentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>

    test.beforeAll(async () => {
      // Create (or realign) the dedicated throwaway student, ensuring it is NOT
      // soft-deleted from a prior aborted run.
      // perPage default is 50; once the shared local auth.users list grows past that,
      // the reused throwaway student could land on a later page and be missed, wrongly
      // falling through to createUser (which then fails on the duplicate email). Use a
      // ceiling well above any test-env user count.
      const { data: authList, error: listError } = await admin.auth.admin.listUsers({
        perPage: 1000,
      })
      if (listError) throw new Error(`EN4 beforeAll: listUsers failed: ${listError.message}`)
      const existing = authList.users.find((u) => u.email === SOFTDEL_STUDENT_EMAIL)

      if (existing) {
        softDelStudentId = existing.id
        const { data: userRow, error: userRowErr } = await admin
          .from('users')
          .select('id, organization_id, role, deleted_at')
          .eq('id', existing.id)
          .maybeSingle()
        if (userRowErr) throw new Error(`EN4 beforeAll: users lookup: ${userRowErr.message}`)
        if (!userRow) {
          const { error: insErr } = await admin.from('users').insert({
            id: existing.id,
            organization_id: orgId,
            email: SOFTDEL_STUDENT_EMAIL,
            full_name: 'Red Team Soft-Delete Report-Keys Student',
            role: 'student',
          })
          if (insErr) throw new Error(`EN4 beforeAll: insert user: ${insErr.message}`)
        } else if (
          userRow.organization_id !== orgId ||
          userRow.role !== 'student' ||
          userRow.deleted_at !== null
        ) {
          const { data: realigned, error: updErr } = await admin
            .from('users')
            .update({ organization_id: orgId, role: 'student', deleted_at: null })
            .eq('id', existing.id)
            .select('id')
          if (updErr) throw new Error(`EN4 beforeAll: realign user: ${updErr.message}`)
          if (!realigned?.length) throw new Error('EN4 beforeAll: realign affected 0 rows')
        }
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: SOFTDEL_STUDENT_EMAIL,
          password: SOFTDEL_STUDENT_PASSWORD,
          email_confirm: true,
        })
        if (createErr || !created.user)
          throw new Error(`EN4 beforeAll: createUser: ${createErr?.message}`)
        softDelStudentId = created.user.id
        const { error: insErr } = await admin.from('users').insert({
          id: softDelStudentId,
          organization_id: orgId,
          email: SOFTDEL_STUDENT_EMAIL,
          full_name: 'Red Team Soft-Delete Report-Keys Student',
          role: 'student',
        })
        if (insErr) throw new Error(`EN4 beforeAll: insert user: ${insErr.message}`)
      }

      // Authenticate BEFORE soft-delete — holds a still-valid JWT for the post-delete call.
      softDelStudentClient = await createAuthenticatedClient(
        SOFTDEL_STUDENT_EMAIL,
        SOFTDEL_STUDENT_PASSWORD,
      )
    })

    test.afterAll(async () => {
      // The throwaway student accumulates quiz_sessions + immutable
      // quiz_session_answers FK references, so a hard auth delete is blocked
      // (FK RESTRICT). Soft-delete the users row instead (security rule 6) so it
      // neither pollutes active-student queries nor blocks on FKs; the next run's
      // beforeAll realigns it (deleted_at=null) for reuse. A failed soft-delete would
      // leave the student ACTIVE and leak into downstream specs sharing this Supabase
      // project, so THROW on a real error (code-style.md §7 — log-and-continue is only
      // for failures that don't leak shared state). Zero rows is non-fatal: the row may
      // already be soft-deleted from a prior run.
      if (!softDelStudentId) return
      const { data, error } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', softDelStudentId)
        .is('deleted_at', null)
        .select('id')
      if (error) {
        throw new Error(`[report-answer-keys] EN4 afterAll soft-delete failed: ${error.message}`)
      }
      if ((data?.length ?? 0) > 0) {
        console.log(`[report-answer-keys] EN4 soft-deleted ${data?.length} student(s)`)
      }
    })

    test('the owner can read keys until soft-deleted, then is rejected', async () => {
      // Non-vacuous setup: seed the throwaway student's OWN completed+answered
      // session and prove the keys are readable BEFORE soft-deletion.
      const sessionId = await seedSession({
        studentId: softDelStudentId,
        completed: true,
        questionIds: [shortAnswerQuestionId, dialogFillQuestionId],
      })
      await seedAnswers(sessionId)

      const before = await softDelStudentClient.rpc(RPC, { p_session_id: sessionId })
      expect(before.error).toBeNull()
      expect(Array.isArray(before.data)).toBe(true)
      expect((before.data as unknown[]).length).toBeGreaterThan(0)

      // Soft-delete + post-delete call in a try/finally so the user is always
      // restored to a clean state for the cascade delete (noUnsafeFinally: the
      // assertions live OUTSIDE the finally).
      let restoreError: string | null = null
      let result: { data: unknown; error: { message: string } | null } | null = null
      try {
        const { data: deleted, error: delErr } = await admin
          .from('users')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', softDelStudentId)
          .is('deleted_at', null)
          .select('id')
        expect(delErr).toBeNull()
        // Non-vacuity: confirm the soft-delete actually changed a row.
        expect(deleted?.length).toBe(1)

        const r = await softDelStudentClient.rpc(RPC, { p_session_id: sessionId })
        result = { data: r.data, error: r.error }
      } finally {
        const { data: restored, error: restoreErr } = await admin
          .from('users')
          .update({ deleted_at: null })
          .eq('id', softDelStudentId)
          .select('id')
        if (restoreErr) restoreError = restoreErr.message
        else if ((restored?.length ?? 0) === 0) restoreError = 'restore matched no rows'
      }

      // Reachability guard: result is set only if the soft-delete + post-delete RPC
      // call both ran. The try has no catch, so an in-try assertion failure already
      // fails the test before reaching here — but this makes "the security probe
      // actually ran" explicit, so the proof below can never pass vacuously.
      expect(result).not.toBeNull()

      // Security proof first: the active-user gate rejects and no key is leaked.
      expect(result?.error).not.toBeNull()
      expect(result?.error?.message ?? '').toMatch(/user not found or inactive/i)
      expect(result?.data).toBeNull()

      // Infra check last so a restore failure never masks the security proof.
      expect(restoreError).toBeNull()
    })
  })
})
