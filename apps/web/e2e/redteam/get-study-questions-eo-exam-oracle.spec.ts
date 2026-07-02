/**
 * Red Team Spec: get_study_questions RPC (Vector EO, feat/study-mode-mc) — EO6 + EO7.
 *
 * Sibling of get-study-questions-eo.spec.ts (EO1–EO5). This file holds the two
 * vectors that prove the exam-integrity boundary around the deliberately-exposed MC
 * answer key:
 *   - EO6 mid-exam answer-oracle (the CRITICAL vector): a student with an active
 *         exam session (mode NOT IN practice modes, ended_at IS NULL) POSTs their
 *         exam's question ids — already delivered client-side by get_quiz_questions
 *         / get_vfr_rt_exam_questions — to this RPC to read the MC keys mid-exam.
 *         The deny-by-default active-exam-session guard raises 'active_exam_session'.
 *         NON-VACUOUS: a preflight inside EO6 itself proves the same student+question
 *         returns the key when no exam is active.
 *   - EO7 draft-status excluded: a draft-status MC question is omitted while an active
 *         sibling IS returned. The status='active' guard is REQUIRED for Study Mode
 *         (same reasoning as the deleted_at filter: arbitrary caller-supplied ids, the
 *         §15 write-once-config carve-out does NOT apply).
 *
 * Hermeticity (code-style.md §7): this spec runs its OWN setupEoFixtures in beforeAll
 * (every question it reads is one it inserted, marker-tagged via E2E_REDTEAM_EO_MARKER)
 * and soft-deletes them in afterAll — independent of the sibling spec. The EO6
 * quiz_sessions row is seeded and torn down WITHIN the EO6 test (accumulate-then-throw
 * after the try/finally) so a leaked active session can't reject later calls spuriously.
 */

import { expect, test } from '@playwright/test'
import {
  cleanupEoFixtures,
  EG_MC_ACTIVE_KEY,
  type EoFixtures,
  RPC,
  type StudyQuestionRow,
  setupEoFixtures,
} from './helpers/get-study-questions-eo-setup'

test.describe('Red Team: get_study_questions RPC (Vector EO — exam oracle)', () => {
  let fx: EoFixtures

  test.beforeAll(async () => {
    fx = await setupEoFixtures()
  })

  test.afterAll(async () => {
    await cleanupEoFixtures(fx.admin, fx.createdQuestionIds)
  })

  test('EO7: a draft-status question is excluded while an active sibling is returned', async () => {
    // Non-vacuity: the draft fixture exists and has the expected status.
    const { data: draftRow, error: draftErr } = await fx.admin
      .from('questions')
      .select('id, status')
      .eq('id', fx.egMcDraftId)
      .single()
    expect(draftErr).toBeNull()
    expect(draftRow?.status).toBe('draft')

    // The status='active' filter must surface only the active sibling; the draft MC
    // must be excluded even though it belongs to the same org and is an MC question —
    // so this proves the filter fires independently of deleted_at and question_type.
    const { data, error } = await fx.studentClient.rpc(RPC, {
      p_question_ids: [fx.egMcDraftId, fx.egMcActiveId],
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const ids = (data as StudyQuestionRow[]).map((r) => r.id)
    expect(ids).not.toContain(fx.egMcDraftId)
    expect(ids).toContain(fx.egMcActiveId)
  })

  test('EO6: a student with an active exam session cannot read MC answer keys (mid-exam oracle)', async () => {
    // Preflight: same student + same question returns the key when no exam is active.
    // Makes EO6 self-contained rather than relying on EO5 running first.
    const preflight = await fx.studentClient.rpc(RPC, { p_question_ids: [fx.egMcActiveId] })
    expect(preflight.error).toBeNull()
    expect(Array.isArray(preflight.data)).toBe(true)
    const preflightRows = preflight.data as StudyQuestionRow[]
    expect(preflightRows).toHaveLength(1)
    expect(preflightRows[0]?.correct_option_id).toBe(EG_MC_ACTIVE_KEY)

    // Seed a live (ended_at IS NULL) mock_exam session. Study Mode reveals keys, and
    // mock/internal/VFR-RT exams grade from the same MC pool, so the RPC must refuse
    // mid-exam — otherwise the student reads their live exam's answer keys by POSTing
    // the IDs the exam runner already handed them.
    const { data: sessionRow, error: insErr } = await fx.admin
      .from('quiz_sessions')
      .insert({ organization_id: fx.orgId, student_id: fx.victimUserId, mode: 'mock_exam' })
      .select('id')
      .single()
    expect(insErr).toBeNull()
    const sessionId = sessionRow?.id as string

    let cleanupError: string | null = null

    try {
      const { data, error } = await fx.studentClient.rpc(RPC, { p_question_ids: [fx.egMcActiveId] })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toMatch(/active_exam_session/i)
      expect(data).toBeNull()
    } finally {
      // quiz_sessions is soft-delete only (docs/database.md soft-delete matrix) — soft-delete
      // the seeded session, matching the sibling red-team specs. Setting deleted_at also clears
      // the active-session guard so later get_study_questions calls don't reject spuriously.
      // Biome noUnsafeFinally forbids throw-in-finally, so we accumulate and throw after.
      const { data: del, error: delErr } = await fx.admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sessionId)
        .is('deleted_at', null)
        .select('id')
      if (delErr) {
        cleanupError = `session cleanup failed: ${delErr.message}`
      } else if ((del?.length ?? 0) === 0) {
        cleanupError = `session cleanup matched no rows: ${sessionId}`
      }
    }
    // Throw AFTER the try/finally — a leaked active session causes later calls to
    // reject spuriously; surface the failure immediately.
    if (cleanupError) throw new Error(`[get-study-questions-eo] EO6: ${cleanupError}`)
  })

  test('EO10: serves study keys to a caller with an active discovery session', async () => {
    // Positive control for the mig 142 (20260629000700) behavioral change: the
    // active-exam-session guard EXCLUDES the caller's own 'discovery' session from
    // the deny-list (mode NOT IN ('smart_review','quick_quiz','discovery')). Study
    // Mode is discovery-backed (#1011, mig 137), so a discovery session must NOT
    // block its own get_study_questions key reads — otherwise Study never loads. A
    // regression dropping 'discovery' from the allowlist would raise
    // 'active_exam_session' here (while EO6's mock_exam block stays green), so this
    // is the ONLY red-team signal at the E2E tier for that regression.
    //
    // Create a REAL ephemeral discovery session as the student (start_discovery_session,
    // mig 137) rather than a hand-inserted row: p_subject_id NULL bypasses the subject
    // filter, and [egMcActiveId] is an active in-org MC question that satisfies the
    // RPC's per-id MC/active/in-org/non-deleted validation.
    const started = await fx.studentClient.rpc('start_discovery_session', {
      p_subject_id: null,
      p_question_ids: [fx.egMcActiveId],
    })
    expect(started.error).toBeNull()
    // §5 cast-guard: confirm the RPC returned a string id before reading it.
    expect(typeof started.data).toBe('string')
    const discoverySessionId = started.data as string

    let cleanupError: string | null = null
    try {
      // NON-VACUOUS: service-role read proves the discovery session genuinely exists
      // and is active — so a later success proves discovery was excluded from the
      // deny-list, not that no session was ever created.
      const { data: sessionRow, error: sessionErr } = await fx.admin
        .from('quiz_sessions')
        .select('id, mode, ended_at, deleted_at')
        .eq('id', discoverySessionId)
        .single()
      expect(sessionErr).toBeNull()
      expect(sessionRow?.mode).toBe('discovery')
      expect(sessionRow?.ended_at).toBeNull()
      expect(sessionRow?.deleted_at).toBeNull()

      // With the discovery session active, the same student reads the MC key without
      // tripping 'active_exam_session' — proving discovery does NOT block Study Mode.
      const { data, error } = await fx.studentClient.rpc(RPC, {
        p_question_ids: [fx.egMcActiveId],
      })
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
      const rows = data as StudyQuestionRow[]
      expect(rows).toHaveLength(1)
      // NON-VACUOUS: the returned row is the seeded question WITH its answer key.
      expect(rows[0]?.id).toBe(fx.egMcActiveId)
      expect(rows[0]?.correct_option_id).toBe(EG_MC_ACTIVE_KEY)
    } finally {
      // quiz_sessions is soft-delete only — soft-delete the seeded discovery session
      // so it does not linger as an active row for downstream specs sharing this
      // student. Biome noUnsafeFinally forbids throw-in-finally: accumulate here,
      // throw after the try/finally.
      const { data: del, error: delErr } = await fx.admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', discoverySessionId)
        .is('deleted_at', null)
        .select('id')
      if (delErr) {
        cleanupError = `discovery cleanup failed: ${delErr.message}`
      } else if ((del?.length ?? 0) === 0) {
        cleanupError = `discovery cleanup matched no rows: ${discoverySessionId}`
      }
    }
    if (cleanupError) throw new Error(`[get-study-questions-eo] EO10: ${cleanupError}`)
  })
})
