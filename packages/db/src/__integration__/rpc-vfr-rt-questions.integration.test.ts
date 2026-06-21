/**
 * A.11 — VFR RT exam: get_vfr_rt_exam_questions answer-key strip, explanation absence,
 * session-gate negatives, and cross-org isolation.
 * Split from rpc-vfr-rt-start.integration.test.ts (#844).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { createTestOrg, createTestUser, getAuthenticatedClient } from './setup'
import {
  admin,
  ensureBank,
  getRtRefs,
  insertDialogFillQuestion,
  insertMcQuestion,
  insertShortAnswerQuestion,
  suffix,
} from './vfr-rt-helpers'

// ─── get_vfr_rt_exam_questions ────────────────────────────────────────────────

describe('RPC: get_vfr_rt_exam_questions', () => {
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let rtSubjectId: string
  let p1TopicId: string
  let p2TopicId: string
  let p3TopicId: string
  let saIds: string[]
  let dfIds: string[]
  let mcIds: string[]
  let saId: string
  let dfId: string
  let mcId: string
  // The caller-owned in-flight session every happy-path test reads through.
  // #833 contract: the RPC takes p_session_id and derives the question ids
  // server-side from the session's frozen config.question_ids — callers can no
  // longer pass arbitrary question id arrays.
  let sessionId: string
  let sessionQuestionIds: string[]
  const userIds: string[] = []

  beforeAll(async () => {
    const refs = await getRtRefs()
    rtSubjectId = refs.rtSubjectId
    p1TopicId = refs.p1TopicId
    p2TopicId = refs.p2TopicId
    p3TopicId = refs.p3TopicId

    orgId = await createTestOrg({
      admin,
      name: `RT Questions Org ${suffix}`,
      slug: `rt-qs-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-rtqs-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-rtqs-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-rtqs-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const bankId = await ensureBank(orgId, adminUserId)

    // Seed EXACTLY the 8/9/8 part minimum: the sampler then has no slack, so the
    // started session's 25 frozen question_ids necessarily include every seeded
    // question — tests can locate saId/dfId/mcId in the RPC response.
    saIds = []
    for (let i = 0; i < 8; i++) {
      saIds.push(
        await insertShortAnswerQuestion({
          orgId,
          bankId,
          adminId: adminUserId,
          rtSubjectId,
          p1TopicId,
          idx: 200 + i,
        }),
      )
    }
    dfIds = []
    for (let i = 0; i < 9; i++) {
      dfIds.push(
        await insertDialogFillQuestion({
          orgId,
          bankId,
          adminId: adminUserId,
          rtSubjectId,
          p2TopicId,
          idx: 200 + i,
        }),
      )
    }
    mcIds = []
    for (let i = 0; i < 8; i++) {
      mcIds.push(
        await insertMcQuestion({
          orgId,
          bankId,
          adminId: adminUserId,
          rtSubjectId,
          p3TopicId,
          idx: 200 + i,
        }),
      )
    }
    saId = saIds[0]!
    dfId = dfIds[0]!
    mcId = mcIds[0]!

    const { error: ecErr } = await admin.from('exam_configs').insert({
      organization_id: orgId,
      subject_id: rtSubjectId,
      enabled: true,
      total_questions: 25,
      time_limit_seconds: 1800,
      pass_mark: 75,
    })
    if (ecErr) throw new Error(`exam_configs insert: ${ecErr.message}`)

    const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    if (error) throw new Error(`start session for questions tests: ${error.message}`)
    const r = requireRpcResult<{ session_id: string; question_ids: string[] }>(
      data,
      'start_vfr_rt_exam_session',
    )
    sessionId = r.session_id
    sessionQuestionIds = r.question_ids
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  it('returns type-discriminated rows for all three question types in the session', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<{
      id: string
      question_type: string
      options: unknown
      dialog_template: string | null
      blanks_safe: unknown
      canonical_answer?: unknown
      accepted_synonyms?: unknown
      blanks_config?: unknown
    }>(data, 'get_vfr_rt_exam_questions')
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(25)

    const saRow = rows.find((r) => r.id === saId)
    const dfRow = rows.find((r) => r.id === dfId)
    const mcRow = rows.find((r) => r.id === mcId)

    expect(saRow?.question_type).toBe('short_answer')
    expect(dfRow?.question_type).toBe('dialog_fill')
    expect(mcRow?.question_type).toBe('multiple_choice')
  })

  it("returns rows in the session's frozen question order", async () => {
    // The frozen config.question_ids order is the part structure the exam UI
    // renders (P1 → P2 → P3) — the RPC must preserve it, not re-shuffle.
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<{ id: string }>(data, 'get_vfr_rt_exam_questions')
    expect(rows.map((r) => r.id)).toEqual(sessionQuestionIds)
  })

  it('strips canonical_answer and accepted_synonyms from short_answer rows', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<Record<string, unknown>>(data, 'get_vfr_rt_exam_questions')
    const row = rows.find((r) => r.id === saId)
    expect(row).toBeDefined()
    // These keys must be absent from the returned row entirely
    expect('canonical_answer' in row!).toBe(false)
    expect('accepted_synonyms' in row!).toBe(false)
    // options is NULL for short_answer
    expect(row!.options).toBeNull()
  })

  it('rewrites dialog_fill tokens from {{n|canonical;syn}} to {{n}} and strips blanks_config canonicals', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<Record<string, unknown>>(data, 'get_vfr_rt_exam_questions')
    const dfRow = rows.find((r) => r.id === dfId)
    expect(dfRow).toBeDefined()

    // dialog_template must have {{n}} plain markers, NOT {{n|canonical;...}} tokens
    const tpl = dfRow!.dialog_template as string
    expect(tpl).toContain('{{0}}')
    expect(tpl).not.toContain('S5-ABC')
    expect(tpl).not.toContain('S5-XYZ')
    expect(tpl).not.toMatch(/\{\{\d+\|/)

    // blanks_safe contains only index, not canonical or synonyms
    const blanksSafe = dfRow!.blanks_safe as Array<Record<string, unknown>>
    expect(Array.isArray(blanksSafe)).toBe(true)
    expect(blanksSafe).toHaveLength(1)
    const blank = blanksSafe[0]!
    expect('index' in blank).toBe(true)
    expect('canonical' in blank).toBe(false)
    expect('synonyms' in blank).toBe(false)

    // blanks_config must not be in the response at all
    expect('blanks_config' in dfRow!).toBe(false)
    expect(JSON.stringify(dfRow)).not.toContain('S5-ABC')
  })

  it('returns MC options stripped of the correct flag', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<Record<string, unknown>>(data, 'get_vfr_rt_exam_questions')
    const mcRow = rows.find((r) => r.id === mcId)
    expect(mcRow).toBeDefined()
    const opts = mcRow!.options as Array<Record<string, unknown>>
    expect(Array.isArray(opts)).toBe(true)
    // Every returned option object must only have 'id' and 'text' — no 'correct'
    for (const opt of opts) {
      expect(Object.keys(opt).sort()).toEqual(['id', 'text'])
      expect('correct' in opt).toBe(false)
    }
  })

  it('omits explanation_text and explanation_image_url from every returned row', async () => {
    // #833 contract change: explanations moved to get_vfr_rt_exam_results (the
    // post-completion reveal) — the in-exam read must not carry them at all.
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<Record<string, unknown>>(data, 'get_vfr_rt_exam_questions')
    expect(rows).toHaveLength(25)
    for (const row of rows) {
      expect('explanation_text' in row).toBe(false)
      expect('explanation_image_url' in row).toBe(false)
    }
    // Value-level guard: the seeded explanation strings ('SA explanation N',
    // 'DF explanation N', 'MC explanation N') must not appear under ANY key.
    const serialized = JSON.stringify(rows)
    expect(serialized).not.toContain('SA explanation')
    expect(serialized).not.toContain('DF explanation')
    expect(serialized).not.toContain('MC explanation')
  })

  it('returns the same stripped rows for a completed session', async () => {
    // #833 contract: the results page re-fetches questions after submit, so the
    // RPC accepts sessions with ended_at set — there is no in-flight requirement.
    // Insert the completed session directly: ended_at IS NOT NULL keeps it out of
    // the active-session partial unique index, so it coexists with the main
    // in-flight session.
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'vfr_rt_exam',
        subject_id: rtSubjectId,
        config: { question_ids: [saId, dfId, mcId] },
        total_questions: 3,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`completed session insert: ${insErr.message}`)
    const completedSessionId = inserted.id as string

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: completedSessionId,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<Record<string, unknown>>(data, 'get_vfr_rt_exam_questions')
    expect(rows).toHaveLength(3)
    // The frozen question order holds on the completed path too
    expect(rows.map((r) => r.id)).toEqual([saId, dfId, mcId])
    // Answer-key and explanation stripping still applies post-completion
    for (const row of rows) {
      expect('canonical_answer' in row).toBe(false)
      expect('accepted_synonyms' in row).toBe(false)
      expect('explanation_text' in row).toBe(false)
      expect('explanation_image_url' in row).toBe(false)
    }
    const mcRow = rows.find((r) => r.id === mcId)
    expect(mcRow).toBeDefined()
    const opts = mcRow!.options as Array<Record<string, unknown>>
    for (const opt of opts) {
      expect('correct' in opt).toBe(false)
    }
  })

  it('still returns a question soft-deleted after the session started', async () => {
    // §15 carve-out (docs/security.md §15; docs/database.md §3 "Scoring
    // Soft-Deleted Questions"): config.question_ids is write-once at session
    // start, so an in-flight exam keeps rendering a question retired mid-exam.
    // saIds[7] is not asserted by any other test in this block.
    const carveOutId = saIds[7]!
    const { data: softDeleted, error: sdErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', carveOutId)
      .select('id')
    if (sdErr) throw new Error(`carve-out soft-delete setup: ${sdErr.message}`)
    expect(softDeleted).toHaveLength(1)

    try {
      const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
        p_session_id: sessionId,
      })
      expect(error).toBeNull()
      const rows = requireRpcRows<{ id: string }>(data, 'get_vfr_rt_exam_questions')
      expect(rows).toHaveLength(25)
      expect(rows.map((r) => r.id)).toContain(carveOutId)
    } finally {
      // Restore so later tests see the seeded state. console.error, not throw:
      // a throw here would mask the test's own assertion failure (biome
      // noUnsafeFinally).
      const { data: restored, error: restoreErr } = await admin
        .from('questions')
        .update({ deleted_at: null })
        .eq('id', carveOutId)
        .select('id')
      if (restoreErr) {
        console.error('[carve-out restore] question left soft-deleted:', restoreErr.message)
      } else if ((restored?.length ?? 0) === 0) {
        console.error(
          '[carve-out restore] zero rows restored — question left soft-deleted:',
          carveOutId,
        )
      }
    }
  })

  it("rejects another student's session id with the guard error", async () => {
    // Replaces the pre-#833 mixed-array cross-org test: arbitrary question ids
    // can no longer be passed, so isolation is enforced at the session gate.
    // Non-vacuous: the second student's session genuinely exists and is readable
    // by its owner — only the cross-owner call must raise.
    const studentId2 = await createTestUser({
      admin,
      orgId,
      email: `student-rtqs2-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId2)
    const client2 = await getAuthenticatedClient({
      email: `student-rtqs2-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const { data: startData, error: startErr } = await client2.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(startErr).toBeNull()
    const foreignSessionId = requireRpcResult<{ session_id: string }>(
      startData,
      'start_vfr_rt_exam_session',
    ).session_id
    expect(foreignSessionId).toBeTruthy()

    // Positive control: the owner can read their own session's questions.
    const { data: ownData, error: ownErr } = await client2.rpc('get_vfr_rt_exam_questions', {
      p_session_id: foreignSessionId,
    })
    expect(ownErr).toBeNull()
    expect(ownData as unknown as unknown[]).toHaveLength(25)

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: foreignSessionId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found or not owned')
  })

  it('rejects a non-vfr_rt_exam session with the guard error', async () => {
    // Owned by the caller, completed, not deleted — the ONLY failing guard
    // predicate is the mode check.
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        subject_id: rtSubjectId,
        config: { question_ids: [mcId] },
        total_questions: 1,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`quick_quiz session insert: ${insErr.message}`)
    const quickSessionId = inserted.id as string
    expect(quickSessionId).toBeTruthy()

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: quickSessionId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found or not owned')
  })

  it('rejects a soft-deleted vfr_rt_exam session with the guard error', async () => {
    // Owned, right mode, completed (so it never collides with the active-session
    // partial unique index) — the ONLY failing guard predicate is deleted_at.
    // The row demonstrably exists (insert returned its id), so the raise is
    // non-vacuous.
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'vfr_rt_exam',
        subject_id: rtSubjectId,
        config: { question_ids: [saId, dfId, mcId] },
        total_questions: 3,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        ended_at: new Date().toISOString(),
        deleted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`soft-deleted session insert: ${insErr.message}`)
    const deletedSessionId = inserted.id as string
    expect(deletedSessionId).toBeTruthy()

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: deletedSessionId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found or not owned')
  })

  it('rejects a nonexistent session id with the guard error', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: '00000000-0000-4000-a000-000000000833',
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found or not owned')
  })

  it('filters foreign-org questions out of a session whose frozen config references them', async () => {
    // Mig 105 defense-in-depth (issue #831): the questions JOIN filters
    // q.organization_id = v_caller_org_id. The session gate cannot catch this
    // case — the session is genuinely owned by the caller — so if a frozen
    // config.question_ids ever references a foreign-org question, only the org
    // filter keeps it out of the response.
    const foreignOrgId = await createTestOrg({
      admin,
      name: `RT Foreign Org ${suffix}`,
      slug: `rt-foreign-${suffix}`,
    })
    let foreignAdminId: string | null = null
    let foreignQuestionId: string | null = null
    try {
      foreignAdminId = await createTestUser({
        admin,
        orgId: foreignOrgId,
        email: `admin-rtforeign-${suffix}@test.local`,
        password: 'test-pass-123',
        role: 'admin',
      })
      const foreignBankId = await ensureBank(foreignOrgId, foreignAdminId)
      // easa_subjects/easa_topics are GLOBAL tables — the foreign-org question
      // can share the seeded RT subject/topic refs.
      foreignQuestionId = await insertShortAnswerQuestion({
        orgId: foreignOrgId,
        bankId: foreignBankId,
        adminId: foreignAdminId,
        rtSubjectId,
        p1TopicId,
        idx: 400,
      })

      // Non-vacuous: the foreign question demonstrably exists (and belongs to
      // the foreign org) before the call — "1 row" below proves filtering, not
      // a missing fixture.
      const { data: foreignRow, error: foreignErr } = await admin
        .from('questions')
        .select('id, organization_id')
        .eq('id', foreignQuestionId)
        .single()
      expect(foreignErr).toBeNull()
      expect(foreignRow?.organization_id).toBe(foreignOrgId)

      // Caller-owned, right mode, not deleted, valid question_ids array (so the
      // mig 105 session_config_malformed guard passes). ended_at is set so the
      // row stays off the active-session partial unique index — the RPC accepts
      // completed sessions.
      const { data: inserted, error: insErr } = await admin
        .from('quiz_sessions')
        .insert({
          organization_id: orgId,
          student_id: studentId,
          mode: 'vfr_rt_exam',
          subject_id: rtSubjectId,
          config: { question_ids: [saId, foreignQuestionId], parts: [] },
          total_questions: 2,
          correct_count: 0,
          score_percentage: 0,
          passed: false,
          ended_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insErr) throw new Error(`mixed-org session insert: ${insErr.message}`)
      const mixedSessionId = inserted.id as string
      expect(mixedSessionId).toBeTruthy()

      const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
        p_session_id: mixedSessionId,
      })
      expect(error).toBeNull()
      const rows = requireRpcRows<{ id: string }>(data, 'get_vfr_rt_exam_questions')
      expect(rows).toHaveLength(1)
      expect(rows[0]!.id).toBe(saId)
      expect(rows.map((r) => r.id)).not.toContain(foreignQuestionId)
      // The mixed session itself is org-scoped to this describe's org, so
      // afterAll's cleanupTestData removes it — same as the other
      // admin-inserted-session tests in this block.
    } finally {
      // Foreign-org rows are OUTSIDE afterAll's org scope — remove them here in
      // FK-safe order (question → bank → user → org → auth user). console.error,
      // not throw: a throw here would mask the test's own assertion failure
      // (biome noUnsafeFinally).
      if (foreignQuestionId) {
        const { data: deletedQ, error: qErr } = await admin
          .from('questions')
          .delete()
          .eq('id', foreignQuestionId)
          .select('id')
        if (qErr) {
          console.error('[foreign-org cleanup] question delete failed:', qErr.message)
        } else if ((deletedQ?.length ?? 0) === 0) {
          console.error('[foreign-org cleanup] zero questions deleted:', foreignQuestionId)
        }
      }
      // Zero rows is valid for the bank (ensureBank may not have run) — log only
      // when something was actually removed.
      const { data: deletedBanks, error: bankErr } = await admin
        .from('question_banks')
        .delete()
        .eq('organization_id', foreignOrgId)
        .select('id')
      if (bankErr) {
        console.error('[foreign-org cleanup] bank delete failed:', bankErr.message)
      } else if ((deletedBanks?.length ?? 0) > 0) {
        console.log(`[foreign-org cleanup] removed ${deletedBanks?.length} bank(s)`)
      }
      if (foreignAdminId) {
        const { data: deletedUsers, error: userErr } = await admin
          .from('users')
          .delete()
          .eq('id', foreignAdminId)
          .select('id')
        if (userErr) {
          console.error('[foreign-org cleanup] user delete failed:', userErr.message)
        } else if ((deletedUsers?.length ?? 0) === 0) {
          console.error('[foreign-org cleanup] zero users deleted:', foreignAdminId)
        }
      }
      const { data: deletedOrgs, error: orgErr } = await admin
        .from('organizations')
        .delete()
        .eq('id', foreignOrgId)
        .select('id')
      if (orgErr) {
        console.error('[foreign-org cleanup] org delete failed:', orgErr.message)
      } else if ((deletedOrgs?.length ?? 0) === 0) {
        console.error('[foreign-org cleanup] zero orgs deleted:', foreignOrgId)
      }
      if (foreignAdminId) {
        const { error: authErr } = await admin.auth.admin.deleteUser(foreignAdminId)
        if (authErr) {
          console.error('[foreign-org cleanup] auth user delete failed:', authErr.message)
        }
      }
    }
  })

  it('rejects an unauthenticated call with not_authenticated', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { error } = await anonClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  it('rejects a soft-deleted caller with user_not_found_or_inactive', async () => {
    // Soft-delete the student — the deleted_at-filtered SELECT INTO yields NULL,
    // triggering the user_not_found_or_inactive gate (mig 099b family pattern).
    const { error: softDeleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)
    if (softDeleteErr) throw new Error(`soft-delete setup: ${softDeleteErr.message}`)

    try {
      const { error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
        p_session_id: sessionId,
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
