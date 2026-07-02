import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// diagram_config is an answer key (diagram_config.answer — same mechanism as
// ordering_items' array order, mig 143). mig 094 REVOKEd the blanket SELECT on
// `questions` from `authenticated` and re-GRANTed an EXPLICIT column list;
// diagram_config was added AFTER that grant (mig 150) and is excluded from it
// — a REVOKE-by-OMISSION, not an explicit REVOKE statement, so it can only be
// verified by EXECUTING a real PostgREST select against real grants. A
// `db reset` proves only that the column exists on the table, not that
// PostgREST hides it from `authenticated`.

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

describe('Column grant: diagram_config REVOKE-by-omission from authenticated', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let diagramId: string

  const DIAGRAM_CONFIG: DiagramConfig = {
    image_ref: 'rwy-27-09-lh-pattern',
    zones: [
      { id: 'zone-nw', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      { id: 'zone-ne', x: 0.6, y: 0.1, w: 0.2, h: 0.2 },
    ],
    labels: [
      { id: 'lbl-alpha', text: 'Upwind Leg' },
      { id: 'lbl-bravo', text: 'Crosswind Leg' },
    ],
    answer: [
      { zone_id: 'zone-nw', label_id: 'lbl-alpha' },
      { zone_id: 'zone-ne', label_id: 'lbl-bravo' },
    ],
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DiagramColRevoke ${suffix}`,
      slug: `test-diagramcolrevoke-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-diagramcolrevoke-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-diagramcolrevoke-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-diagramcolrevoke-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `DC${suffix}`,
      subjectName: `DiagramColRevoke Subject ${suffix}`,
      topicCode: `DC${suffix}-01`,
      topicName: `DiagramColRevoke Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `DiagramColRevoke Bank ${suffix}`,
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
      diagram_config: DIAGRAM_CONFIG,
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

  it('hides diagram_config from an authenticated SELECT while the row itself remains visible', async () => {
    // Positive control (non-vacuity): the student CAN see the row via the
    // tenant_isolation RLS policy (same org), so a missing diagram_config
    // proves the COLUMN REVOKE hid the key — not that RLS blocked the whole row.
    const { data: visibleRows, error: visibleErr } = await studentClient
      .from('questions')
      .select('id')
      .eq('id', diagramId)
    expect(visibleErr).toBeNull()
    expect(visibleRows?.some((r) => r.id === diagramId)).toBe(true)

    const { data: studentData, error: studentErr } = await studentClient
      .from('questions')
      .select('id, diagram_config')
      .eq('id', diagramId)
    // PostgREST raises 42501 (permission denied for column) when a non-granted
    // column is requested. Either the request errors, or — defensively — the
    // column is absent from the returned row.
    if (studentErr) {
      const code = (studentErr as { code?: string }).code
      const message = studentErr.message.toLowerCase()
      expect(
        code === '42501' ||
          message.includes('permission denied') ||
          message.includes('diagram_config'),
        `unexpected error: ${code}: ${studentErr.message}`,
      ).toBe(true)
    } else {
      const rows = (studentData ?? []) as Array<Record<string, unknown>>
      expect(rows).toHaveLength(1)
      for (const r of rows) {
        expect('diagram_config' in r).toBe(false)
      }
    }

    // Non-vacuity: the service role (which bypasses the column REVOKE) CAN
    // read it, proving the column genuinely exists and carries the answer key.
    const { data: adminData, error: adminErr } = await admin
      .from('questions')
      .select('id, diagram_config')
      .eq('id', diagramId)
      .single<{ id: string; diagram_config: DiagramConfig }>()
    expect(adminErr).toBeNull()
    expect(adminData?.diagram_config.answer).toEqual(DIAGRAM_CONFIG.answer)
  })
})
