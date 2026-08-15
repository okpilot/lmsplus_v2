import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData, clearActiveSessions } from './cleanup'
import { requireRpcResult } from './guards'
import { seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

// Red-team Vectors EL1-EL6 (guard rejections) + EM (output contract) —
// check_non_mc_answer immediate-feedback grader (mig 119, #697 Phase 2).
//
// The grading branches (short_answer normalize/compare, dialog_fill per-blank
// loop + full-coverage rule) only run when the function is EXECUTED, not at
// CREATE-time. A `db reset` proves the body parses; this file proves it grades.

type CheckNonMcResult = {
  is_correct: boolean
  correct_answer: string | null
  blanks: Array<{ index: number; is_correct: boolean; canonical: string }> | null
  explanation_text: string | null
  explanation_image_url: string | null
}

/** Runtime-guard the jsonb result (code-style.md §5 — cast guard applies in tests). */
function asResult(data: unknown): CheckNonMcResult {
  return requireRpcResult<CheckNonMcResult>(data, 'check_non_mc_answer')
}

async function insertQuestion(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin.from('questions').insert(row).select('id').single()
  if (error) throw new Error(`insertQuestion: ${error.message}`)
  const id = requireRpcResult<{ id: string }>(data, 'insertQuestion').id
  if (typeof id !== 'string' || id.length === 0) throw new Error('insertQuestion: no id')
  return id
}

describe('RPC: check_non_mc_answer — guards (EL) + output contract (EM)', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  // short_answer: one passing-seed, one failing-seed (≥2 distinct seeds per type).
  let saCorrectId: string
  let saWrongId: string
  // dialog_fill: 3-blank question used for full-correct, 2-of-3, and missing-blank.
  let dfId: string
  let mcId: string

  const SA_CANONICAL = 'mayday mayday mayday'
  const DF_B0 = 'cleared'
  const DF_B1 = 'runway two seven'
  const DF_B2 = 'wind calm'

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org NonMC ${suffix}`,
      slug: `test-nonmc-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `NM${suffix}`,
      subjectName: `NonMC Subject ${suffix}`,
      topicCode: `NM${suffix}-01`,
      topicName: `NonMC Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({ organization_id: orgId, name: `NonMC Bank ${suffix}`, created_by: adminUserId })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    bankId = requireRpcResult<{ id: string }>(bank, 'question_banks insert').id

    const base = {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
    }

    saCorrectId = await insertQuestion(admin, {
      ...base,
      question_type: 'short_answer',
      question_text: 'Distress call?',
      canonical_answer: SA_CANONICAL,
      explanation_text: 'SA explanation',
    })
    saWrongId = await insertQuestion(admin, {
      ...base,
      question_type: 'short_answer',
      question_text: 'Another short answer?',
      canonical_answer: 'squawk seven seven zero zero',
      explanation_text: 'SA wrong-seed explanation',
    })
    dfId = await insertQuestion(admin, {
      ...base,
      question_type: 'dialog_fill',
      question_text: 'Three-blank dialog',
      dialog_template: '[atc] {{0|cleared}} to land {{1|runway two seven}}, {{2|wind calm}}.',
      blanks_config: [
        { index: 0, canonical: DF_B0, synonyms: [] },
        { index: 1, canonical: DF_B1, synonyms: [] },
        { index: 2, canonical: DF_B2, synonyms: [] },
      ],
      explanation_text: 'DF explanation',
    })
    mcId = await insertQuestion(admin, {
      ...base,
      question_type: 'multiple_choice',
      question_text: 'MC question',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
        { id: 'd', text: 'D' },
      ],
      correct_option_id: 'b',
      explanation_text: 'MC explanation',
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  // Single-active-session invariant (#1011): each test starts a fresh session for
  // the reused test student, so clear any still-active session left by the prior
  // test before the next start RPC raises `another_session_active`. Scoped to the
  // reused `studentId` (not org-wide): EL3/EL4 spin up their own per-test students,
  // and a broad org-wide clear could wipe a session those tests intentionally hold.
  beforeEach(async () => {
    await clearActiveSessions({ admin, studentIds: [studentId] })
  })

  /** Start a smart_review session pinning the given question ids. */
  async function startSession(qIds: string[]): Promise<string> {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: qIds,
    })
    if (error) throw new Error(`startSession: ${error.message}`)
    if (typeof data !== 'string') throw new Error('startSession: no session id')
    return data
  }

  // ── EL1: unauthenticated ───────────────────────────────────────────────────
  it('EL1 — rejects an unauthenticated caller with not_authenticated', async () => {
    const anon = getAnonClient()
    // anon needs a session id; reuse a real session id but call without auth.
    const sessionId = await startSession([saCorrectId])
    const { error } = await anon.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_response_text: SA_CANONICAL,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  // ── EL2: non-whitelist mode (mock_exam session) ─────────────────────────────
  it('EL2 — rejects a mock_exam session with unsupported_session_mode', async () => {
    const { data: sessRow, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        subject_id: refs.subjectId,
        config: { question_ids: [saCorrectId] },
        total_questions: 1,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (sessErr) throw new Error(`mock_exam session insert: ${sessErr.message}`)
    const examSessionId = sessRow.id
    try {
      const { data, error } = await studentClient.rpc('check_non_mc_answer', {
        p_question_id: saCorrectId,
        p_session_id: examSessionId,
        p_response_text: SA_CANONICAL,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('unsupported_session_mode')
      expect(data).toBeNull()
    } finally {
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
        .eq('id', examSessionId)
      if (endErr) console.error('[EL2 cleanup] session left active:', endErr.message)
    }
  })

  // ── EL3: soft-deleted caller ────────────────────────────────────────────────
  it('EL3 — rejects a soft-deleted caller with user_not_found_or_inactive', async () => {
    const delStudentId = await createTestUser({
      admin,
      orgId,
      email: `studentDel-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(delStudentId)
    const delClient = await getAuthenticatedClient({
      email: `studentDel-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const { data: sd, error: startErr } = await delClient.rpc('start_quiz_session', {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: [saCorrectId],
    })
    if (startErr) throw new Error(`startSession (del): ${startErr.message}`)
    if (typeof sd !== 'string') throw new Error('startSession (del): no session id')
    const delSessionId = sd
    try {
      const { error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', delStudentId)
      if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
      const { error } = await delClient.rpc('check_non_mc_answer', {
        p_question_id: saCorrectId,
        p_session_id: delSessionId,
        p_response_text: SA_CANONICAL,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('user_not_found_or_inactive')
    } finally {
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
        .eq('id', delSessionId)
      if (endErr) console.error('[EL3 cleanup] session left active:', endErr.message)
    }
  })

  // ── EL4: non-owner (another student's session) ──────────────────────────────
  it("EL4 — rejects another student's session as not owned", async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)
    const studentBClient = await getAuthenticatedClient({
      email: `studentB-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    // studentA owns the session; studentB tries to answer against it.
    const sessionId = await startSession([saCorrectId])
    const { error } = await studentBClient.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_response_text: SA_CANONICAL,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or not owned')
  })

  // ── EL5: question not a member of the session ───────────────────────────────
  it('EL5 — rejects a question that is not in the session config', async () => {
    const sessionId = await startSession([saCorrectId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saWrongId, // not in this session's question_ids
      p_session_id: sessionId,
      p_response_text: 'anything',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('does not belong to session')
  })

  // ── EL6: answer_type_mismatch + invalid_blank_index ─────────────────────────
  it('EL6 — rejects short_answer called with blank_answers (answer_type_mismatch)', async () => {
    const sessionId = await startSession([saCorrectId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_blank_answers: [{ blank_index: 0, response_text: 'x' }],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('EL6 — rejects dialog_fill called with response_text (answer_type_mismatch)', async () => {
    const sessionId = await startSession([dfId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_response_text: 'some text',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('EL6 — rejects a dialog_fill blank_index not in blanks_config (invalid_blank_index)', async () => {
    const sessionId = await startSession([dfId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [{ blank_index: 99, response_text: 'x' }],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_blank_index')
  })

  // ── EM: output contract — short_answer ──────────────────────────────────────
  it('EM — short_answer correct returns is_correct:true and the canonical answer', async () => {
    const sessionId = await startSession([saCorrectId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_response_text: SA_CANONICAL,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    expect(result.correct_answer).toBe(SA_CANONICAL)
    expect(result.blanks).toBeNull()
    expect(result.explanation_text).toBe('SA explanation')
  })

  it('EM — short_answer wrong returns is_correct:false (distinct failing seed)', async () => {
    // saWrongId canonical is 'squawk seven seven zero zero' — answer with the
    // OTHER question's canonical so a hardcoded-true regression fails here.
    const sessionId = await startSession([saWrongId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saWrongId,
      p_session_id: sessionId,
      p_response_text: SA_CANONICAL,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    expect(result.correct_answer).toBe('squawk seven seven zero zero')
  })

  // ── EM: output contract — dialog_fill ───────────────────────────────────────
  it('EM — dialog_fill all blanks correct returns is_correct:true with per-blank results', async () => {
    const sessionId = await startSession([dfId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [
        { blank_index: 0, response_text: DF_B0 },
        { blank_index: 1, response_text: DF_B1 },
        { blank_index: 2, response_text: DF_B2 },
      ],
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    expect(result.correct_answer).toBeNull()
    if (!Array.isArray(result.blanks)) throw new Error('blanks is not an array')
    expect(result.blanks).toHaveLength(3)
    for (const b of result.blanks) {
      expect(b.is_correct).toBe(true)
    }
    expect(result.blanks.map((b) => b.canonical)).toEqual([DF_B0, DF_B1, DF_B2])
  })

  it('EM — dialog_fill 2-of-3 blanks correct returns is_correct:FALSE (full-coverage rule)', async () => {
    // All 3 blanks submitted, blank 2 wrong → 2 true + 1 false, top-level FALSE.
    const sessionId = await startSession([dfId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [
        { blank_index: 0, response_text: DF_B0 },
        { blank_index: 1, response_text: DF_B1 },
        { blank_index: 2, response_text: 'totally wrong' },
      ],
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    if (!Array.isArray(result.blanks)) throw new Error('blanks is not an array')
    const byIndex = new Map(result.blanks.map((b) => [b.index, b.is_correct]))
    expect(byIndex.get(0)).toBe(true)
    expect(byIndex.get(1)).toBe(true)
    expect(byIndex.get(2)).toBe(false)
  })

  it('EM — dialog_fill with a blank omitted (2 of 3 submitted, both correct) returns is_correct:FALSE (coverage)', async () => {
    // Only blanks 0 and 1 submitted (both correct); blank 2 missing → coverage
    // rule makes top-level FALSE even though every submitted blank is correct.
    const sessionId = await startSession([dfId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [
        { blank_index: 0, response_text: DF_B0 },
        { blank_index: 1, response_text: DF_B1 },
      ],
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    if (!Array.isArray(result.blanks)) throw new Error('blanks is not an array')
    expect(result.blanks).toHaveLength(2)
    for (const b of result.blanks) {
      expect(b.is_correct).toBe(true)
    }
  })

  it('EM — rejects calling MC through this non-MC grader (unsupported_question_type)', async () => {
    const sessionId = await startSession([mcId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: mcId,
      p_session_id: sessionId,
      p_response_text: 'b',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('unsupported_question_type')
  })

  // ── Typo tolerance (answer_matches, mig 158; reaches this RPC via mig 159) ──────────────────
  // Graded through the RPC, not against answer_matches directly, because what matters is that the
  // tolerance actually reaches the student's mark. Where a case DOES need the helper in isolation,
  // it is called with the service-role `admin` client: mig 158 REVOKEs EXECUTE on answer_matches
  // from PUBLIC, anon and authenticated, so `studentClient` cannot reach it.

  it('accepts a short answer with two letters swapped', async () => {
    const sessionId = await startSession([saCorrectId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_response_text: 'maydya mayday mayday',
    })
    expect(error).toBeNull()
    expect(asResult(data).is_correct).toBe(true)
  })

  it('still rejects a short answer that is a different phrase', async () => {
    const sessionId = await startSession([saCorrectId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_response_text: 'pan pan pan',
    })
    expect(error).toBeNull()
    expect(asResult(data).is_correct).toBe(false)
  })

  it('accepts a misspelled dialog blank', async () => {
    const sessionId = await startSession([dfId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [
        { blank_index: 0, response_text: 'cleraed' },
        { blank_index: 1, response_text: DF_B1 },
        { blank_index: 2, response_text: DF_B2 },
      ],
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    if (!Array.isArray(result.blanks)) throw new Error('blanks is not an array')
    expect(result.blanks.find((b) => b.index === 0)?.is_correct).toBe(true)
  })

  it.each([
    ['an altimeter setting', 'qnh 1015', 'QNH 1014'],
    ['a runway number', 'runway 32', 'runway 33'],
    ['a squawk code', 'squawk 6502', 'squawk 6503'],
    // The normaliser strips the separator, so 118.5 and 1185 ARE the same answer — the digits are
    // what must differ for this to be a real case.
    ['a frequency', '1180', '118.5'],
  ])('rejects a one-digit difference in %s', async (_label, response, candidate) => {
    // NOTE: these four prove the LENGTH FLOOR, not the digit rule. Every differing token here is
    // four characters or fewer, so `lim` is 0 and the pair is rejected before the digit check is
    // load-bearing — delete the digit rule and all four still pass. The genuinely digit-specific
    // case is the next test; keep both, but do not read these as covering the digit rule.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: response,
      p_candidate: candidate,
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('rejects a one-digit difference the spelling tolerance would otherwise forgive', async () => {
    // The only non-vacuous digit case: 125.50 normalises to the 5-character token 12550, one edit
    // from 12551, so the length floor ADMITS it (lim = 1) and the digit rule is the sole reason it
    // is rejected. Remove that rule and this test — alone — goes red. Real values: 125.50 vs
    // 125.51 MHz are different frequencies.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: '12551',
      p_candidate: '125.50',
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it.each([
    ['a reciprocal heading', 'turn northbound', 'turn southbound'],
    ['a runway serviceability', 'runway unserviceable', 'runway serviceable'],
    ['a speed instruction', 'increase speed', 'decrease speed'],
  ])('rejects %s that differs only by its opposite', async (_label, response, candidate) => {
    // Directional and negated opposites are two edits apart at eight-plus characters. The original
    // tier allowed two edits from that length and so ACCEPTED every one of these — an inverted
    // clearance graded correct. `runway unserviceable` vs `runway serviceable` is live ICAO
    // phraseology, which is why the tier was narrowed to one edit rather than patched with a
    // denylist of known pairs.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: response,
      p_candidate: candidate,
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('still forgives the transposition that the tolerance was built for', async () => {
    // Non-regression for the motivating case. 'airfiled'/'airfield' is Levenshtein distance 2, so
    // narrowing the tier to one edit would have broken it — it survives via the adjacent-swap
    // reduction, not via the edit budget. If this goes red, the swap reduction is gone.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: 'crossing of airfiled approved',
      p_candidate: 'crossing of airfield approved',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('returns false rather than raising on a token past the levenshtein limit', async () => {
    // extensions.levenshtein RAISES above 255 characters. responseText is Zod-capped at 500, and
    // inside submit_vfr_rt_exam_answers an unguarded raise aborts the WHOLE exam submission, not
    // one answer. Without the guard this call errors instead of returning.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: 'a'.repeat(260),
      p_candidate: 'airfield',
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('matches an exact answer longer than the levenshtein limit', async () => {
    // The length guard must not reject a CORRECT long answer: equality is settled before
    // tokenisation, so a 359-character exact match still returns true.
    const long = 'b'.repeat(359)
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: long,
      p_candidate: long,
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('refuses a direct answer_matches call from an authenticated student', async () => {
    // mig 158 REVOKEs EXECUTE from PUBLIC, anon and authenticated. Postgres grants EXECUTE to
    // PUBLIC by DEFAULT, so this closes rather than merely fails-to-open — and a future
    // CREATE OR REPLACE in a fresh migration that forgets to re-REVOKE would silently reopen it.
    // Mirrors the existing _grade_record_ordering REVOKE [authenticated, anon] pair.
    const { error } = await studentClient.rpc('answer_matches', {
      p_norm_response: 'cleared to land',
      p_candidate: 'cleared to land',
    })
    expect(error).not.toBeNull()
    // Assert the CODE, not merely that something failed: a misspelled RPC name or a wrong
    // argument name also produces an error, so a bare not-null check stays green even if the
    // REVOKE is dropped — the exact regression this test exists to catch. 42501 is
    // permission-denied; PostgREST reports PGRST202 when the revoked function drops out of the
    // role's schema cache.
    expect(['42501', 'PGRST202']).toContain(error?.code)
  })

  it('refuses a direct answer_matches call from an anonymous client', async () => {
    const anonClient = getAnonClient()
    const { error } = await anonClient.rpc('answer_matches', {
      p_norm_response: 'cleared to land',
      p_candidate: 'cleared to land',
    })
    expect(error).not.toBeNull()
    expect(['42501', 'PGRST202']).toContain(error?.code)
  })

  it('forgives two separately misspelled words in one phrase', async () => {
    // Sits exactly ON the whole-answer budget: two adjacent-swap words, each costing one edit.
    // Every word of the candidate is 5+ characters, which matters — a shorter candidate word
    // (`land`) is rejected by the length floor before the budget is ever consulted.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: 'reqeust depatrure information',
      p_candidate: 'request departure information',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('rejects a phrase with three separately misspelled words', async () => {
    // One past the budget. Paired with the accept case above, this is what pins `spent > 2`:
    // no other test drives that branch, so without it the budget could be deleted and the whole
    // suite would stay green.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: 'reqeust depatrure inofrmation',
      p_candidate: 'request departure information',
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('rejects an answer with a different number of words', async () => {
    // Word-count mismatch returns early, before any per-word comparison runs.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: 'request departure information now',
      p_candidate: 'request departure information',
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('normalises its left argument rather than trusting the caller', async () => {
    // answer_matches used to normalise only the right argument and assume the left was already
    // normalised — a silent precondition that returned WRONG RESULTS, not errors, when violated.
    // Both are normalised now, so a raw left argument grades the same as a clean one.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: '  CLEARED to Land!! ',
      p_candidate: 'cleared to land',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('does not forgive a swap that produces a different word', async () => {
    // 'lift' and 'left' are one edit apart, which is why a CANDIDATE under five characters is
    // never fuzzy-matched. Note the floor reads the candidate only: a shorter student token can
    // still match a 5+ candidate.
    const { data, error } = await admin.rpc('answer_matches', {
      p_norm_response: 'turn lift',
      p_candidate: 'turn left',
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })
})
