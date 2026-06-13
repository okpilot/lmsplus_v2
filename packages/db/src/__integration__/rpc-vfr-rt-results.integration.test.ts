/**
 * A.11 — VFR RT exam: get_vfr_rt_exam_results + complete_overdue_exam_session.
 *
 * get_vfr_rt_exam_results covers:
 *   - not authenticated → not_authenticated error
 *   - pre-completion session → 'Session not found, not owned, or not completed'
 *   - non-owner → same guard error
 *   - wrong mode session → same guard error
 *   - soft-deleted caller → user_not_found_or_inactive (mig 103 gate, #838)
 *   - passing session: per-part pcts match submit result; revealed key present
 *   - passing session: explanation_text / explanation_image_url revealed per
 *     question post-completion (mig 106), with ≥2 distinct non-null fixture
 *     values per field and null passthrough for questions seeded without them
 *   - failing session (Part 2 fail): second distinct fixture outcome
 *
 * complete_overdue_exam_session (mig 102 extension) covers:
 *   - vfr_rt_exam session past deadline + partial answers → auto-grades with per-part
 *     formulas, emits 'vfr_rt_exam.expired' audit event, marks session ended
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

const admin = getAdminClient()
const suffix = Date.now()

// ─── RT seed helpers (self-contained per file) ────────────────────────────────

async function getRtRefs(): Promise<{
  rtSubjectId: string
  p1TopicId: string
  p2TopicId: string
  p3TopicId: string
}> {
  const { data: sub, error: subErr } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .single()
  if (subErr || !sub) throw new Error('getRtRefs: RT subject not found')
  const { data: topics, error: topErr } = await admin
    .from('easa_topics')
    .select('id, code')
    .eq('subject_id', sub.id)
    .in('code', ['P1_ACRONYMS', 'P2_DIALOG', 'P3_MC'])
  if (topErr) throw new Error(`getRtRefs: ${topErr.message}`)
  const byCode = Object.fromEntries(
    (topics ?? []).map((t: { id: string; code: string }) => [t.code, t.id]),
  )
  if (!byCode['P1_ACRONYMS'] || !byCode['P2_DIALOG'] || !byCode['P3_MC'])
    throw new Error('getRtRefs: RT topics missing')
  return {
    rtSubjectId: sub.id,
    p1TopicId: byCode['P1_ACRONYMS'],
    p2TopicId: byCode['P2_DIALOG'],
    p3TopicId: byCode['P3_MC'],
  }
}

async function ensureBank(orgId: string, adminId: string): Promise<string> {
  const { data: existing, error: lookupErr } = await admin
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupErr) throw new Error(`ensureBank: ${lookupErr.message}`)
  if (existing) return existing.id as string
  const { data, error } = await admin
    .from('question_banks')
    .insert({ organization_id: orgId, name: `Results Bank ${suffix}`, created_by: adminId })
    .select('id')
    .single()
  if (error) throw new Error(`ensureBank insert: ${error.message}`)
  return data.id as string
}

interface SaQ {
  id: string
  canonical: string
}
interface DfQ {
  id: string
  blanks: Array<{ index: number; canonical: string }>
}
interface McQ {
  id: string
  correctOption: string
}

async function seedPool(opts: {
  orgId: string
  bankId: string
  adminId: string
  rtSubjectId: string
  p1TopicId: string
  p2TopicId: string
  p3TopicId: string
  base: number
}): Promise<{ saQs: SaQ[]; dfQs: DfQ[]; mcQs: McQ[] }> {
  const { orgId, bankId, adminId, rtSubjectId, p1TopicId, p2TopicId, p3TopicId, base } = opts
  const insertQ = async (q: object) => {
    const { data, error } = await admin.from('questions').insert(q).select('id').single()
    if (error) throw new Error(`seedPool insert: ${error.message}`)
    return data.id as string
  }
  const saQs: SaQ[] = await Promise.all(
    Array.from({ length: 8 }, async (_, i) => {
      const canonical = `sa_canon_${base}_${i}`
      const id = await insertQ({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: rtSubjectId,
        topic_id: p1TopicId,
        question_text: `SA res ${base} ${i} ${suffix}?`,
        explanation_text: `SA res expl ${base} ${i}`,
        // i === 0 carries an explanation image — with the MC i === 0 image below
        // this gives the results tests ≥2 distinct non-null image fixtures.
        explanation_image_url: i === 0 ? `https://cdn.test/expl-sa-${base}.png` : null,
        question_type: 'short_answer',
        canonical_answer: canonical,
        accepted_synonyms: [],
        options: [],
        blanks_config: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminId,
      })
      return { id, canonical }
    }),
  )
  const dfQs: DfQ[] = await Promise.all(
    Array.from({ length: 9 }, async (_, i) => {
      const blanks = [
        { index: 0, canonical: `df_c0_${base}_${i}`, synonyms: [] },
        { index: 1, canonical: `df_c1_${base}_${i}`, synonyms: [] },
      ]
      const id = await insertQ({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: rtSubjectId,
        topic_id: p2TopicId,
        question_text: `DF res ${base} ${i} ${suffix}?`,
        explanation_text: `DF res expl ${base} ${i}`,
        question_type: 'dialog_fill',
        dialog_template: `[atc] {{0|df_c0_${base}_${i}}} then {{1|df_c1_${base}_${i}}}.`,
        blanks_config: blanks,
        options: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminId,
      })
      return { id, blanks }
    }),
  )
  const mcQs: McQ[] = await Promise.all(
    Array.from({ length: 8 }, async (_, i) => {
      const id = await insertQ({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: rtSubjectId,
        topic_id: p3TopicId,
        question_text: `MC res ${base} ${i} ${suffix}?`,
        // explanation_text is NOT NULL by schema (initial_schema.sql) — only
        // explanation_image_url can be null, asserted in the passthrough test.
        explanation_text: `MC res expl ${base} ${i}`,
        // i === 0 carries an explanation image distinct from the SA i === 0 one.
        explanation_image_url: i === 0 ? `https://cdn.test/expl-mc-${base}.png` : null,
        question_type: 'multiple_choice',
        options: [
          { id: 'a', text: `A` },
          { id: 'b', text: `B` },
          { id: 'c', text: `C` },
          { id: 'd', text: `D` },
        ],
        // MC answer key in its own REVOKE-gated column (#823, mig 109).
        correct_option_id: 'b',
        difficulty: 'medium',
        status: 'active',
        created_by: adminId,
      })
      return { id, correctOption: 'b' }
    }),
  )
  return { saQs, dfQs, mcQs }
}

// ─── global test org state ────────────────────────────────────────────────────

let orgId: string
let adminUserId: string
let studentId: string
let studentClient: SupabaseClient
let rtSubjectId: string
let saQs: SaQ[]
let dfQs: DfQ[]
let mcQs: McQ[]
// Session ids completed during the tests — exposed for get_vfr_rt_exam_results describe
let passingSessionId: string
let failingSessionId: string // Part 2 fail
const userIds: string[] = []

beforeAll(async () => {
  const refs = await getRtRefs()
  rtSubjectId = refs.rtSubjectId

  orgId = await createTestOrg({
    admin,
    name: `RT Results Org ${suffix}`,
    slug: `rt-results-${suffix}`,
  })
  adminUserId = await createTestUser({
    admin,
    orgId,
    email: `admin-rtres-${suffix}@test.local`,
    password: 'test-pass-123',
    role: 'admin',
  })
  userIds.push(adminUserId)
  studentId = await createTestUser({
    admin,
    orgId,
    email: `student-rtres-${suffix}@test.local`,
    password: 'test-pass-123',
    role: 'student',
  })
  userIds.push(studentId)
  studentClient = await getAuthenticatedClient({
    email: `student-rtres-${suffix}@test.local`,
    password: 'test-pass-123',
  })

  const bankId = await ensureBank(orgId, adminUserId)
  const pool = await seedPool({
    orgId,
    bankId,
    adminId: adminUserId,
    rtSubjectId,
    p1TopicId: refs.p1TopicId,
    p2TopicId: refs.p2TopicId,
    p3TopicId: refs.p3TopicId,
    base: 500,
  })
  saQs = pool.saQs
  dfQs = pool.dfQs
  mcQs = pool.mcQs

  const { error: ecErr } = await admin.from('exam_configs').insert({
    organization_id: orgId,
    subject_id: rtSubjectId,
    enabled: true,
    total_questions: 25,
    time_limit_seconds: 1800,
    pass_mark: 75,
  })
  if (ecErr) throw new Error(`exam_configs: ${ecErr.message}`)

  // ── Fixture A: passing session (all correct) ──────────────────────────────
  {
    const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    if (error) throw new Error(`start passing: ${error.message}`)
    const r = data as unknown as { session_id: string; question_ids: string[] }
    passingSessionId = r.session_id

    const saById = Object.fromEntries(saQs.map((q) => [q.id, q]))
    const dfById = Object.fromEntries(dfQs.map((q) => [q.id, q]))
    const mcById = Object.fromEntries(mcQs.map((q) => [q.id, q]))
    const answers: object[] = []
    for (const qId of r.question_ids) {
      if (saById[qId]) {
        answers.push({ question_id: qId, response_text: saById[qId]!.canonical })
      } else if (dfById[qId]) {
        for (const b of dfById[qId]!.blanks)
          answers.push({ question_id: qId, blank_index: b.index, response_text: b.canonical })
      } else if (mcById[qId]) {
        answers.push({ question_id: qId, selected_option_id: mcById[qId]!.correctOption })
      }
    }
    const { error: subErr } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: passingSessionId,
      p_answers: answers,
    })
    if (subErr) throw new Error(`submit passing: ${subErr.message}`)
  }

  // ── Fixture B: Part 2 fail session ───────────────────────────────────────
  {
    const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    if (error) throw new Error(`start failing: ${error.message}`)
    const r = data as unknown as { session_id: string; question_ids: string[] }
    failingSessionId = r.session_id

    const saById = Object.fromEntries(saQs.map((q) => [q.id, q]))
    const dfById = Object.fromEntries(dfQs.map((q) => [q.id, q]))
    const mcById = Object.fromEntries(mcQs.map((q) => [q.id, q]))
    const answers: object[] = []
    for (const qId of r.question_ids) {
      if (saById[qId]) {
        answers.push({ question_id: qId, response_text: saById[qId]!.canonical })
      } else if (dfById[qId]) {
        for (const b of dfById[qId]!.blanks)
          answers.push({ question_id: qId, blank_index: b.index, response_text: 'WRONG_XYZ' })
      } else if (mcById[qId]) {
        answers.push({ question_id: qId, selected_option_id: mcById[qId]!.correctOption })
      }
    }
    const { error: subErr } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: failingSessionId,
      p_answers: answers,
    })
    if (subErr) throw new Error(`submit failing: ${subErr.message}`)
  }
})

afterAll(async () => {
  await cleanupTestData({ admin, orgId, userIds })
})

// ─── get_vfr_rt_exam_results ──────────────────────────────────────────────────

describe('RPC: get_vfr_rt_exam_results — guard errors', () => {
  it('rejects unauthenticated call with not_authenticated', async () => {
    const anonClient = await import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(
        process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
        process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
      ),
    )
    const { error } = await anonClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: passingSessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  it('rejects a pre-completion session with the guard error — no key material in response', async () => {
    // Start a new session (NOT submitted, so ended_at IS NULL)
    const { data: startData, error: startErr } = await studentClient.rpc(
      'start_vfr_rt_exam_session',
      {
        p_subject_id: rtSubjectId,
      },
    )
    if (startErr) throw new Error(`start pre-completion: ${startErr.message}`)
    const openSession = (startData as unknown as { session_id: string }).session_id

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: openSession,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    // Exact wording from mig 103 / design.md (capital S)
    expect(error?.message).toContain('Session not found, not owned, or not completed')

    // Force-end so the next start_vfr_rt_exam_session can create a fresh session.
    // Zero-row no-op guard (code-style §5): exactly one row must be closed —
    // a silent no-op here would leak an active session into later tests.
    const { data: closed, error: closeErr } = await admin
      .from('quiz_sessions')
      .update({
        ended_at: new Date().toISOString(),
        correct_count: 0,
        score_percentage: 0,
        passed: false,
      })
      .eq('id', openSession)
      .select('id')
    if (closeErr) throw new Error(`force-close pre-completion session: ${closeErr.message}`)
    expect(closed).toHaveLength(1)
  })

  it('rejects a non-owner call with the guard error', async () => {
    // Create a second student in the same org (owns a different session)
    const studentId2 = await createTestUser({
      admin,
      orgId,
      email: `student-rtres2-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId2)
    const client2 = await getAuthenticatedClient({
      email: `student-rtres2-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    // passingSessionId belongs to studentId, not studentId2
    const { data, error } = await client2.rpc('get_vfr_rt_exam_results', {
      p_session_id: passingSessionId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found, not owned, or not completed')
  })

  it('rejects a non-vfr_rt_exam session with the guard error', async () => {
    // Hermetic fixture: INSERT a completed quick_quiz session directly via the
    // service-role client. It is owned by studentId, completed (ended_at set),
    // and not deleted — so the ONLY guard predicate that fails is the mode check.
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        subject_id: rtSubjectId,
        config: { question_ids: [mcQs[0]!.id, mcQs[1]!.id] },
        total_questions: 2,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`quick_quiz session insert: ${insErr.message}`)
    const quickSessionId = inserted.id as string

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: quickSessionId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found, not owned, or not completed')
  })

  it('rejects a soft-deleted caller with user_not_found_or_inactive', async () => {
    // Soft-delete the student — mig 103's active-user gate (#838) fires before
    // the session guard, so even the owned + completed passing session is
    // rejected (family pattern, migs 099/099b/100).
    const { error: softDeleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)
    if (softDeleteErr) throw new Error(`soft-delete setup: ${softDeleteErr.message}`)

    try {
      const { error } = await studentClient.rpc('get_vfr_rt_exam_results', {
        p_session_id: passingSessionId,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('user_not_found_or_inactive')
    } finally {
      // Restore the student so afterAll cleanup can delete the row cleanly.
      const { error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', studentId)
      // console.error, not throw: a throw here would mask the test's own
      // assertion failure (biome noUnsafeFinally).
      if (restoreErr) {
        console.error('[soft-delete restore] student row left soft-deleted:', restoreErr.message)
      }
    }
  })
})

describe('RPC: get_vfr_rt_exam_results — passing session (Fixture A)', () => {
  it('returns part percentages at 100 and passed_overall true', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: passingSessionId,
    })
    expect(error).toBeNull()
    const result = data as unknown as {
      part1_pct: number
      part2_pct: number
      part3_pct: number
      passed_overall: boolean
      passed_per_part: { part1: boolean; part2: boolean; part3: boolean }
      correct_count: number
      total_questions: number
      questions: unknown[]
    }
    expect(Number(result.part1_pct)).toBe(100)
    expect(Number(result.part2_pct)).toBe(100)
    expect(Number(result.part3_pct)).toBe(100)
    expect(result.passed_overall).toBe(true)
    expect(result.passed_per_part.part1).toBe(true)
    expect(result.passed_per_part.part2).toBe(true)
    expect(result.passed_per_part.part3).toBe(true)
    expect(Number(result.total_questions)).toBe(25)
    // correct_count is ROW-level (one quiz_session_answers row per blank for
    // dialog_fill, informational-only per migs 100/102/103): 8 SA + 9 DF × 2
    // blanks (18) + 8 MC = 34 — NOT the 25 question-level count.
    expect(Number(result.correct_count)).toBe(34)
    expect(Array.isArray(result.questions)).toBe(true)
    expect(result.questions).toHaveLength(25)
  })

  it('revealed key contains canonical_answer for short_answer questions', async () => {
    const { data } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: passingSessionId,
    })
    const result = data as unknown as { questions: Array<Record<string, unknown>> }
    const saEntry = result.questions.find((q) => q['question_type'] === 'short_answer')
    expect(saEntry).toBeDefined()
    const key = saEntry!['key'] as Record<string, unknown>
    // canonical_answer must be revealed in the results (post-submit safe per mig 103 guard)
    expect(key['canonical_answer']).toBeTruthy()
    expect(typeof key['canonical_answer']).toBe('string')
    expect(Array.isArray(key['accepted_synonyms'])).toBe(true)
  })

  it('revealed key contains blanks for dialog_fill questions', async () => {
    const { data } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: passingSessionId,
    })
    const result = data as unknown as { questions: Array<Record<string, unknown>> }
    const dfEntry = result.questions.find((q) => q['question_type'] === 'dialog_fill')
    expect(dfEntry).toBeDefined()
    const key = dfEntry!['key'] as Record<string, unknown>
    const blanks = key['blanks'] as Array<unknown>
    expect(Array.isArray(blanks)).toBe(true)
    expect(blanks.length).toBeGreaterThan(0)
    const blank0 = blanks[0] as Record<string, unknown>
    // Full blanks_config is revealed post-submit (canonical + synonyms)
    expect(blank0['canonical']).toBeTruthy()
  })

  it('revealed key contains correct_option_id for multiple_choice questions', async () => {
    const { data } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: passingSessionId,
    })
    const result = data as unknown as { questions: Array<Record<string, unknown>> }
    const mcEntry = result.questions.find((q) => q['question_type'] === 'multiple_choice')
    expect(mcEntry).toBeDefined()
    const key = mcEntry!['key'] as Record<string, unknown>
    expect(key['correct_option_id']).toBeTruthy()
    expect(typeof key['correct_option_id']).toBe('string')
  })

  it('reveals the seeded explanation fields for every question after completion', async () => {
    // mig 106: explanation_text / explanation_image_url moved out of the in-exam
    // questions read and are revealed here, per entry, post-completion only.
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: passingSessionId,
    })
    expect(error).toBeNull()
    const result = data as unknown as { questions: Array<Record<string, unknown>> }
    expect(result.questions).toHaveLength(25)

    // Every entry carries both keys (present even when the value is null)
    for (const q of result.questions) {
      expect('explanation_text' in q).toBe(true)
      expect('explanation_image_url' in q).toBe(true)
    }

    // Values must match the seeded fixtures exactly (service-role read = ground truth)
    const ids = result.questions.map((q) => q['question_id'] as string)
    const { data: seeded, error: seededErr } = await admin
      .from('questions')
      .select('id, explanation_text, explanation_image_url')
      .in('id', ids)
    expect(seededErr).toBeNull()
    const byId = new Map(
      (
        (seeded ?? []) as Array<{
          id: string
          explanation_text: string | null
          explanation_image_url: string | null
        }>
      ).map((q) => [q.id, q]),
    )
    for (const q of result.questions) {
      const expected = byId.get(q['question_id'] as string)
      expect(expected).toBeDefined()
      expect(q['explanation_text']).toBe(expected!.explanation_text)
      expect(q['explanation_image_url']).toBe(expected!.explanation_image_url)
    }

    // Hardcoded-constant guard: a regression that returns one fixed value (or
    // always null) must fail — each field has ≥2 distinct non-null fixtures.
    const texts = result.questions
      .map((q) => q['explanation_text'])
      .filter((t): t is string => typeof t === 'string')
    expect(new Set(texts).size).toBeGreaterThanOrEqual(2)
    const imageUrls = result.questions
      .map((q) => q['explanation_image_url'])
      .filter((u): u is string => typeof u === 'string')
    expect(new Set(imageUrls).size).toBeGreaterThanOrEqual(2)
  })

  it('passes through a null explanation_image_url for questions seeded without one', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: passingSessionId,
    })
    expect(error).toBeNull()
    const result = data as unknown as { questions: Array<Record<string, unknown>> }

    // explanation_text is NOT NULL by schema, so null passthrough is only
    // observable on explanation_image_url; dialog_fill questions are seeded
    // without one.
    const dfEntry = result.questions.find((q) => q['question_id'] === dfQs[0]!.id)
    expect(dfEntry).toBeDefined()
    expect(dfEntry!['explanation_image_url']).toBeNull()
  })
})

describe('RPC: get_vfr_rt_exam_results — Part 2 fail session (Fixture B)', () => {
  it('returns part2_pct 0, passed_overall false, part1 and part3 at 100', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: failingSessionId,
    })
    expect(error).toBeNull()
    const result = data as unknown as {
      part1_pct: number
      part2_pct: number
      part3_pct: number
      passed_overall: boolean
      passed_per_part: { part1: boolean; part2: boolean; part3: boolean }
      correct_count: number
    }
    expect(Number(result.part1_pct)).toBe(100)
    expect(Number(result.part2_pct)).toBe(0)
    expect(Number(result.part3_pct)).toBe(100)
    expect(result.passed_overall).toBe(false)
    expect(result.passed_per_part.part1).toBe(true)
    expect(result.passed_per_part.part2).toBe(false)
    expect(result.passed_per_part.part3).toBe(true)
    // correct_count is ROW-level (per-blank for dialog_fill, informational-only
    // per migs 100/102/103): 8 SA + 0 of 18 wrong DF blank rows + 8 MC = 16.
    expect(Number(result.correct_count)).toBe(16)
  })
})

// ─── complete_overdue_exam_session (mig 102 extension) ────────────────────────

describe('RPC: complete_overdue_exam_session — vfr_rt_exam mode', () => {
  it('auto-grades a past-deadline vfr_rt_exam session with partial answers and emits vfr_rt_exam.expired', async () => {
    // Seed one more set of questions for this describe so the overall pool still
    // satisfies start_vfr_rt_exam_session's 8/9/8 requirement.
    // We'll insert the session directly with backdated started_at rather than
    // calling start_vfr_rt_exam_session to avoid consuming the main fixture pool.

    // Build a frozen question list from already-seeded questions
    const frozenIds = [...saQs.map((q) => q.id), ...dfQs.map((q) => q.id), ...mcQs.map((q) => q.id)]

    // Insert a backdated session directly (service_role bypasses trigger guard)
    const oldStartedAt = new Date(Date.now() - (1800 + 120) * 1000).toISOString()
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'vfr_rt_exam',
        subject_id: rtSubjectId,
        config: {
          question_ids: frozenIds,
          parts: { p1_end: 8, p2_end: 17, p3_end: 25 },
        },
        total_questions: 25,
        time_limit_seconds: 1800,
        started_at: oldStartedAt,
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`overdue session insert: ${insErr.message}`)
    const overdueSessionId = inserted.id as string

    // Pre-populate one correct SA answer so we get a non-zero partial score
    const firstSa = saQs[0]!
    await admin.from('quiz_session_answers').insert({
      session_id: overdueSessionId,
      question_id: firstSa.id,
      response_text: firstSa.canonical,
      is_correct: true,
      response_time_ms: 1000,
    })

    // Call complete_overdue_exam_session as the session owner (requires auth.uid())
    const { data, error } = await studentClient.rpc('complete_overdue_exam_session', {
      p_session_id: overdueSessionId,
    })
    expect(error).toBeNull()

    const result = data as unknown as {
      session_id: string
      score_percentage: number
      passed: boolean
      total_questions: number
      answered_count: number
    }
    expect(result.session_id).toBe(overdueSessionId)
    expect(Number(result.total_questions)).toBe(25)
    // 1 correct SA out of 8 → part1 = 12.5%; parts 2+3 = 0 → passed = false
    expect(result.passed).toBe(false)
    // answered_count is the number of answer rows (1 in this case)
    expect(Number(result.answered_count)).toBe(1)

    // The session row must now have ended_at set
    const { data: session, error: sErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, passed')
      .eq('id', overdueSessionId)
      .single()
    expect(sErr).toBeNull()
    expect(session?.ended_at).not.toBeNull()

    // Audit event 'vfr_rt_exam.expired' must exist for this session
    const { data: events, error: evErr } = await admin
      .from('audit_events')
      .select('event_type')
      .eq('resource_id', overdueSessionId)
    expect(evErr).toBeNull()
    const types = (events ?? []).map((e: { event_type: string }) => e.event_type)
    expect(types).toContain('vfr_rt_exam.expired')
  })
})
