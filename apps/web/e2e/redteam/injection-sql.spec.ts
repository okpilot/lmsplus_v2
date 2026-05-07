/**
 * Red Team Spec: OWASP A05 — SQL/string fuzzing of RPC text parameters
 *
 * Issue #108. Covers three RPCs whose user-controlled `text` parameters could,
 * if mishandled, allow string injection or length-based exhaustion:
 *  - start_internal_exam_session(p_code text)        — student-facing redeem
 *  - void_internal_exam_code(p_code_id uuid, p_reason text) — admin write
 *  - submit_quiz_answer(... p_selected_option text ...)     — student write
 *
 * For each RPC every payload is asserted to either (a) hit a documented guard
 * with the expected error message, or (b) be stored as plain text without
 * executing a side effect beyond the RPC's own contract. None of the payloads
 * may bypass auth, leak rows, or execute injected SQL — that's the proof.
 *
 * Status: Expected to PASS — guards live in the SECURITY DEFINER bodies
 * (migrations 040 / 20260430000005 / 20260430000006).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import {
  DB_LAYER_PAYLOADS,
  TRANSPORT_LAYER_PAYLOADS,
  WHITESPACE_PAYLOADS,
} from './helpers/payloads'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  E2E_REDTEAM_CODE_PREFIX,
  ensureExamConfig,
  pickSubjectWithQuestions,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed'

type IssuedCode = { id: string; code: string }

async function seedUnconsumedCode(
  admin: ReturnType<typeof getAdminClient>,
  opts: { studentId: string; subjectId: string; orgId: string; issuedBy: string },
): Promise<IssuedCode> {
  const code = `${E2E_REDTEAM_CODE_PREFIX}${crypto
    .randomUUID()
    .replace(/-/g, '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, 'A')
    .slice(0, 6)}`
  const { data, error } = await admin
    .from('internal_exam_codes')
    .insert({
      code,
      subject_id: opts.subjectId,
      student_id: opts.studentId,
      issued_by: opts.issuedBy,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      organization_id: opts.orgId,
    })
    .select('id, code')
    .single()
  if (error || !data) throw new Error(`seedUnconsumedCode: ${error?.message}`)
  return data
}

test.describe('Red Team: OWASP A05 SQL fuzzing — RPC text parameters', () => {
  test.describe('start_internal_exam_session — p_code is parameterised, never executed', () => {
    let studentClient: SupabaseClient

    test.beforeAll(async () => {
      await seedRedTeamUsers()
      studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    })

    for (const payload of DB_LAYER_PAYLOADS) {
      test(`SQL-fragment p_code (${payload.name}) is rejected as code_not_found`, async () => {
        const { data, error } = await studentClient.rpc('start_internal_exam_session', {
          p_code: payload.value,
        })

        expect(error).not.toBeNull()
        expect(error?.message ?? '').toMatch(/code_not_found/i)
        expect(data).toBeNull()
      })
    }

    for (const payload of TRANSPORT_LAYER_PAYLOADS) {
      test(`control-character p_code (${payload.name}) is rejected before reaching the RPC`, async () => {
        const { data, error } = await studentClient.rpc('start_internal_exam_session', {
          p_code: payload.value,
        })

        // Transport-layer rejection produces a generic 400 / parse error.
        // We only assert that the call did NOT silently succeed.
        expect(error).not.toBeNull()
        expect(data).toBeNull()
      })
    }
  })

  test.describe('void_internal_exam_code — p_reason is stored as text, length-bounded, non-blank', () => {
    let admin: ReturnType<typeof getAdminClient>
    let adminClient: SupabaseClient
    let adminUserId: string
    let victimUserId: string
    let orgId: string
    let subjectId: string

    test.beforeAll(async () => {
      admin = getAdminClient()

      const seedStudents = await seedRedTeamUsers()
      victimUserId = seedStudents.victimUserId
      orgId = seedStudents.orgId

      const seedAdmin = await seedRedTeamAdmin()
      adminUserId = seedAdmin.adminUserId
      adminClient = await createAuthenticatedClient(seedAdmin.email, seedAdmin.password)

      const picked = await pickSubjectWithQuestions(admin, { orgId })
      subjectId = picked.subjectId
      await ensureExamConfig(orgId, subjectId, picked.topicId)
    })

    // Each test seeds and consumes its own unconsumed code so tests do not
    // contend on a shared `voided_at` write. afterEach soft-deletes the code
    // (and any unrelated codes the test created) to keep fixtures hermetic.
    let activeCodeId: string | null = null

    test.afterEach(async () => {
      const codeToCleanup = activeCodeId
      activeCodeId = null
      if (!codeToCleanup) return
      const { data, error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', codeToCleanup)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`afterEach soft-delete code ${codeToCleanup}: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[injection-sql] soft-deleted internal_exam_code ${codeToCleanup}`)
      }
    })

    // Short SQL fragments: stored verbatim, code voided per the contract.
    // Length-bounded by the 500-char guard, so we filter on payload length —
    // not on name — so renaming an entry in payloads.ts can't silently flip
    // a length-guard case into a "stored as text" assertion.
    const STORED_AS_TEXT_PAYLOADS = DB_LAYER_PAYLOADS.filter((p) => p.value.length <= 500)

    for (const payload of STORED_AS_TEXT_PAYLOADS) {
      test(`SQL-fragment p_reason (${payload.name}) is stored as text and does not execute`, async () => {
        const code = await seedUnconsumedCode(admin, {
          studentId: victimUserId,
          subjectId,
          orgId,
          issuedBy: adminUserId,
        })
        activeCodeId = code.id

        const { error } = await adminClient.rpc('void_internal_exam_code', {
          p_code_id: code.id,
          p_reason: payload.value,
        })

        expect(error).toBeNull()
        const { data: row } = await admin
          .from('internal_exam_codes')
          .select('voided_at, voided_by, void_reason')
          .eq('id', code.id)
          .single()
        expect(row?.voided_at).not.toBeNull()
        expect(row?.voided_by).toBe(adminUserId)
        // Round-trip equality proves the payload was not interpreted.
        expect(row?.void_reason).toBe(payload.value)
      })
    }

    test('p_reason exceeding 500 chars is rejected as invalid_reason', async () => {
      const code = await seedUnconsumedCode(admin, {
        studentId: victimUserId,
        subjectId,
        orgId,
        issuedBy: adminUserId,
      })
      activeCodeId = code.id

      const { error } = await adminClient.rpc('void_internal_exam_code', {
        p_code_id: code.id,
        p_reason: 'A'.repeat(501),
      })

      expect(error?.message ?? '').toMatch(/invalid_reason/i)
      const { data: row } = await admin
        .from('internal_exam_codes')
        .select('voided_at, void_reason')
        .eq('id', code.id)
        .single()
      expect(row?.voided_at ?? null).toBeNull()
      expect(row?.void_reason ?? null).toBeNull()
    })

    for (const payload of WHITESPACE_PAYLOADS) {
      test(`whitespace-only p_reason (${payload.name}) is rejected as invalid_reason`, async () => {
        const code = await seedUnconsumedCode(admin, {
          studentId: victimUserId,
          subjectId,
          orgId,
          issuedBy: adminUserId,
        })
        activeCodeId = code.id

        const { error } = await adminClient.rpc('void_internal_exam_code', {
          p_code_id: code.id,
          p_reason: payload.value,
        })

        expect(error?.message ?? '').toMatch(/invalid_reason/i)

        // Code must remain un-voided after the rejection.
        const { data: row } = await admin
          .from('internal_exam_codes')
          .select('voided_at')
          .eq('id', code.id)
          .single()
        expect(row?.voided_at ?? null).toBeNull()
      })
    }

    for (const payload of TRANSPORT_LAYER_PAYLOADS) {
      test(`control-character p_reason (${payload.name}) is rejected before reaching the RPC`, async () => {
        const code = await seedUnconsumedCode(admin, {
          studentId: victimUserId,
          subjectId,
          orgId,
          issuedBy: adminUserId,
        })
        activeCodeId = code.id

        const { error } = await adminClient.rpc('void_internal_exam_code', {
          p_code_id: code.id,
          p_reason: payload.value,
        })

        expect(error).not.toBeNull()

        // Code must remain un-voided after the transport-layer rejection.
        const { data: row } = await admin
          .from('internal_exam_codes')
          .select('voided_at')
          .eq('id', code.id)
          .single()
        expect(row?.voided_at ?? null).toBeNull()
      })
    }
  })

  test.describe('submit_quiz_answer — p_selected_option must match an option id on the question', () => {
    let admin: ReturnType<typeof getAdminClient>
    let studentClient: SupabaseClient
    let subjectId: string
    let topicId: string
    let knownQuestionId: string
    let activeSessionId: string | null = null

    test.beforeAll(async () => {
      admin = getAdminClient()

      const seed = await seedRedTeamUsers()
      const orgId = seed.orgId
      studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

      const picked = await pickSubjectWithQuestions(admin, { orgId })
      subjectId = picked.subjectId
      topicId = picked.topicId

      // Pull one active question id in the picked subject + topic so the
      // session config carries a real membership-eligible question.
      const { data: questions, error: questionsError } = await admin
        .from('questions')
        .select('id')
        .eq('organization_id', orgId)
        .eq('subject_id', subjectId)
        .eq('topic_id', topicId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(1)
      if (questionsError) throw new Error(`seed questions: ${questionsError.message}`)
      if (!questions?.length)
        throw new Error('seed questions: no active question for subject/topic')
      knownQuestionId = questions[0].id
    })

    // Per-test session creation: a payload that happens to match a real
    // option_id (extremely unlikely but possible for UUID-shaped fragments)
    // would consume the question and break sibling tests if a single session
    // were shared. Each test gets a fresh session.
    test.beforeEach(async () => {
      const { data: startData, error: startError } = await studentClient.rpc('start_quiz_session', {
        p_mode: 'quick_quiz',
        p_subject_id: subjectId,
        p_topic_id: topicId,
        p_question_ids: [knownQuestionId],
      })
      if (startError || !startData) throw new Error(`start_quiz_session: ${startError?.message}`)
      activeSessionId = startData as string
    })

    test.afterEach(async () => {
      const sessionToCleanup = activeSessionId
      activeSessionId = null
      if (!sessionToCleanup) return
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sessionToCleanup)
        .select('id')
      if (error) {
        throw new Error(`afterEach soft-delete session ${sessionToCleanup}: ${error.message}`)
      }
      if ((data?.length ?? 0) > 0) {
        console.log(`[injection-sql] soft-deleted quiz_session ${sessionToCleanup}`)
      }
    })

    for (const payload of DB_LAYER_PAYLOADS) {
      test(`SQL-fragment p_selected_option (${payload.name}) is rejected as not a member of the question`, async () => {
        const { data, error } = await studentClient.rpc('submit_quiz_answer', {
          p_session_id: activeSessionId as string,
          p_question_id: knownQuestionId,
          p_selected_option: payload.value,
          p_response_time_ms: 1000,
        })

        expect(error).not.toBeNull()
        expect(error?.message ?? '').toMatch(/selected option does not belong/i)
        expect(data).toBeNull()
      })
    }

    for (const payload of TRANSPORT_LAYER_PAYLOADS) {
      test(`control-character p_selected_option (${payload.name}) is rejected before persistence`, async () => {
        const { data, error } = await studentClient.rpc('submit_quiz_answer', {
          p_session_id: activeSessionId as string,
          p_question_id: knownQuestionId,
          p_selected_option: payload.value,
          p_response_time_ms: 1000,
        })

        expect(error).not.toBeNull()
        expect(data).toBeNull()
      })
    }
  })
})
