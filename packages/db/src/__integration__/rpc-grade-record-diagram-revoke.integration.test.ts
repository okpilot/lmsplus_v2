import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

// _grade_record_diagram_label (mig 154) is an internal per-zone grade+record
// helper — REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated (mig 120
// pattern; `CREATE FUNCTION` grants EXECUTE to PUBLIC by default AND Supabase
// separately grants anon/authenticated via ALTER DEFAULT PRIVILEGES, so
// REVOKE FROM PUBLIC alone is insufficient — every API role must be named).
// The helper trusts its p_student_id/p_session_id/p_org_id args with no
// auth.uid() check of its own — batch_submit_quiz is the sole authorization
// boundary (Decision 47). This REVOKE only takes effect at EXECUTION via
// PostgREST — a `db reset` proves only that the REVOKE statement parsed, not
// that the grant table was actually updated. Sibling of the ordering REVOKE
// coverage (rpc-batch-submit-quiz-ordering.integration.test.ts, last 2 tests).

type Zone = { id: string; x: number; y: number; w: number; h: number }
type Label = { id: string; text: string }
type AnswerEntry = { zone_id: string; label_id: string }
type DiagramConfig = { image_ref: string; zones: Zone[]; labels: Label[]; answer: AnswerEntry[] }

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

describe('RPC: _grade_record_diagram_label — REVOKE FROM PUBLIC/anon/authenticated', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let diagramId: string

  const CONFIG: DiagramConfig = {
    image_ref: 'rwy-27-09-lh-pattern',
    zones: [{ id: 'zone-nw', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
    labels: [{ id: 'lbl-alpha', text: 'Upwind Leg' }],
    answer: [{ zone_id: 'zone-nw', label_id: 'lbl-alpha' }],
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DiagramGradeRevoke ${suffix}`,
      slug: `test-diagramgraderevoke-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-diagramgraderevoke-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-diagramgraderevoke-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-diagramgraderevoke-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `DR${suffix}`,
      subjectName: `DiagramGradeRevoke Subject ${suffix}`,
      topicCode: `DR${suffix}-01`,
      topicName: `DiagramGradeRevoke Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `DiagramGradeRevoke Bank ${suffix}`,
        created_by: adminUserId,
      })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    bankId = requireRpcResult<{ id: string }>(bank, 'question_banks insert').id

    diagramId = await insertQuestion(admin, {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
      question_type: 'diagram_label',
      question_text: 'Label the traffic pattern',
      diagram_config: CONFIG,
      explanation_text: 'Diagram explanation',
    })
  })

  afterAll(async () => {
    const errors: string[] = []
    if (orgId) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (refs && errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  function buildPayload(): Record<string, unknown> {
    const dummyId = '00000000-0000-0000-0000-000000000000'
    return {
      p_session_id: dummyId,
      p_student_id: studentId,
      p_org_id: orgId,
      p_question_id: diagramId,
      p_zone_id: 'zone-nw',
      p_label_id: 'lbl-alpha',
      p_diagram_config: CONFIG,
      p_response_time: 0,
    }
  }

  it('prevents an authenticated caller from grading a diagram outside the guarded dispatch path', async () => {
    // REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated (mig 154): the helper
    // must not be callable via PostgREST by an authenticated user — a direct
    // call would bypass the dispatcher's auth/owner/mode guards and forge
    // graded rows. The payload is SIGNATURE-VALID (not `{}`): with a wrong arg
    // shape PostgREST returns PGRST202 from overload resolution BEFORE the
    // EXECUTE permission check, so the assertion would pass vacuously even if
    // the REVOKE regressed (code-style.md §7).
    const payload = buildPayload()
    // Positive control (§7 non-vacuity): the admin (service-role) call must
    // resolve the signature — it may fail later (e.g. FK violation on the
    // dummy session id), but NOT with PGRST202 — so a PGRST202 in the
    // authenticated call below genuinely means REVOKE, not an argument-shape drift.
    const { error: signatureErr } = await admin.rpc('_grade_record_diagram_label', payload)
    expect(signatureErr?.code, `signature must resolve: ${signatureErr?.message}`).not.toBe(
      'PGRST202',
    )
    const { error } = await studentClient.rpc('_grade_record_diagram_label', payload)
    expect(error, '_grade_record_diagram_label must be uncallable by authenticated').not.toBeNull()
    const code = (error as { code?: string }).code
    const message = (error?.message ?? '').toLowerCase()
    const denied =
      code === '42501' ||
      code === 'PGRST202' ||
      message.includes('permission denied') ||
      message.includes('could not find the function') ||
      message.includes('does not exist')
    expect(denied, `_grade_record_diagram_label error was ${code}: ${error?.message}`).toBe(true)
  })

  it('prevents an anonymous caller from grading a diagram outside the guarded dispatch path', async () => {
    // REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated: the authenticated
    // case above only proves the `authenticated` grant is gone. Without an
    // anon case, an anon-only grant leak would ship unnoticed. Same
    // signature-valid payload so a PGRST202 genuinely means REVOKE, not
    // argument-shape drift (code-style.md §7).
    const anon = getAnonClient()
    const payload = buildPayload()
    const { error } = await anon.rpc('_grade_record_diagram_label', payload)
    expect(error, '_grade_record_diagram_label must be uncallable by anon').not.toBeNull()
    const code = (error as { code?: string }).code
    const message = (error?.message ?? '').toLowerCase()
    const denied =
      code === '42501' ||
      code === 'PGRST202' ||
      message.includes('permission denied') ||
      message.includes('could not find the function') ||
      message.includes('does not exist')
    expect(denied, `anon _grade_record_diagram_label error was ${code}: ${error?.message}`).toBe(
      true,
    )
  })
})
