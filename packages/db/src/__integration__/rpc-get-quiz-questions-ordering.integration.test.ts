import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// get_quiz_questions delivers the `ordering` question type (mig 136, #697 Phase 5).
//
// An ordering question's answer key IS the canonical array order of
// questions.ordering_items. mig 136 delivers the items SHUFFLED (ORDER BY random)
// projecting only {id,text}, NULL for non-ordering rows — the shuffle destroys the
// canonical sequence and ordering_items itself is REVOKE-gated from `authenticated`
// by omission from mig 094's column grant (N6). These behaviors only run when the
// function EXECUTES against real rows; a `db reset` proves only that the body parses.

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

type OrderingItem = { id: string; text: string }

describe('RPC: get_quiz_questions — ordering delivery (shuffled, no answer key)', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let orderingId: string
  let mcId: string

  // Canonical sequence = ARRAY ORDER. IDs are OPAQUE (semantic codes, NOT 1..N) so
  // the id ordering itself cannot leak the canonical sequence (seed invariant, N6).
  const ORDERING_ITEMS: OrderingItem[] = [
    { id: 'distress-prefix', text: 'MAYDAY MAYDAY MAYDAY' },
    { id: 'callsign', text: 'Golf Bravo Charlie' },
    { id: 'nature', text: 'engine failure' },
    { id: 'intentions', text: 'forced landing' },
  ]

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org OrderQQ ${suffix}`,
      slug: `test-orderqq-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-orderqq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-orderqq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-orderqq-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `OQ${suffix}`,
      subjectName: `OrderQQ Subject ${suffix}`,
      topicCode: `OQ${suffix}-01`,
      topicName: `OrderQQ Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({ organization_id: orgId, name: `OrderQQ Bank ${suffix}`, created_by: adminUserId })
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

    orderingId = await insertQuestion(admin, {
      ...base,
      question_type: 'ordering',
      question_text: 'Sequence the distress call',
      ordering_items: ORDERING_ITEMS,
      explanation_text: 'Ordering explanation',
    })
    mcId = await insertQuestion(admin, {
      ...base,
      question_type: 'multiple_choice',
      question_text: 'MC question',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      correct_option_id: 'a',
      explanation_text: 'MC explanation',
    })
  })

  afterAll(async () => {
    // §7 per-step accumulator: isolate each cleanup so a failure in one does not
    // skip the next (and leak rows). Reference cleanup is FK-dependent on test
    // cleanup, so it is gated on `errors.length === 0`.
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

  type QuizQuestionRow = {
    id: string
    question_type: string
    options: unknown
    dialog_template: string | null
    blanks_safe: unknown
    ordering_items_shuffled: unknown
  }

  async function fetchRow(ids: string[], targetId: string): Promise<QuizQuestionRow> {
    const { data, error } = await studentClient.rpc('get_quiz_questions', { p_question_ids: ids })
    expect(error).toBeNull()
    const rows = requireRpcRows<QuizQuestionRow>(data, 'get_quiz_questions')
    const row = rows.find((r) => r.id === targetId)
    if (!row) throw new Error(`row for ${targetId} not in response`)
    return row
  }

  it('delivers ordering items as a {id,text} array of the authored length with the other type columns null', async () => {
    // Non-vacuity: the ordering question exists with its canonical items before probing as student.
    const { data: exists, error: existsErr } = await admin
      .from('questions')
      .select('id')
      .eq('id', orderingId)
      .single<{ id: string }>()
    expect(existsErr).toBeNull()
    expect(exists?.id).toBe(orderingId)

    const row = await fetchRow([orderingId], orderingId)
    expect(row.question_type).toBe('ordering')
    expect(row.options).toBeNull()
    expect(row.dialog_template).toBeNull()
    expect(row.blanks_safe).toBeNull()

    if (!Array.isArray(row.ordering_items_shuffled)) {
      throw new Error('ordering_items_shuffled is not an array')
    }
    const items = row.ordering_items_shuffled as Array<Record<string, unknown>>
    expect(items).toHaveLength(ORDERING_ITEMS.length)
    // Each delivered item carries ONLY {id,text} — no canonical-order signal beyond
    // the (shuffleable) array. Every authored id+text is present exactly once.
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['id', 'text'])
    }
    expect((items as OrderingItem[]).map((i) => i.id).sort()).toEqual(
      ORDERING_ITEMS.map((i) => i.id).sort(),
    )
    expect((items as OrderingItem[]).map((i) => i.text).sort()).toEqual(
      ORDERING_ITEMS.map((i) => i.text).sort(),
    )
    // Security: the delivered order must be SHUFFLED, not canonical — the canonical
    // sequence IS the answer key. Set equality alone would pass even if the RPC
    // leaked ordering_items in canonical order. Resample until at least one delivery
    // differs from canonical (4 items → P(canonical)=1/24; 8 samples → ~5.6e-12).
    const canonicalIds = ORDERING_ITEMS.map((i) => i.id).join('|')
    let sawNonCanonical = (items as OrderingItem[]).map((i) => i.id).join('|') !== canonicalIds
    for (let attempt = 0; attempt < 7 && !sawNonCanonical; attempt++) {
      const retry = await fetchRow([orderingId], orderingId)
      if (!Array.isArray(retry.ordering_items_shuffled)) {
        throw new Error('ordering_items_shuffled is not an array')
      }
      sawNonCanonical =
        (retry.ordering_items_shuffled as OrderingItem[]).map((i) => i.id).join('|') !==
        canonicalIds
    }
    expect(sawNonCanonical).toBe(true)
    // No raw answer-key column surfaces on the delivered row.
    expect('ordering_items' in row).toBe(false)
  })

  it('returns ordering_items_shuffled null for a multiple_choice row', async () => {
    const row = await fetchRow([mcId], mcId)
    expect(row.question_type).toBe('multiple_choice')
    expect(row.ordering_items_shuffled).toBeNull()
    if (!Array.isArray(row.options)) throw new Error('MC options is not an array')
  })

  it('never exposes the raw ordering_items answer-key column to an authenticated client (REVOKE by omission, N6)', async () => {
    // ordering_items is an answer key (its array order). mig 094 REVOKEd the blanket
    // SELECT and re-granted an EXPLICIT column list; a column added after that grant
    // is excluded, so `authenticated` cannot SELECT it via PostgREST. Direct select
    // of ordering_items must fail (or omit the column), whereas the service role can.
    const { data: studentData, error: studentErr } = await studentClient
      .from('questions')
      .select('id, ordering_items')
      .eq('id', orderingId)
    // PostgREST raises 42501 (permission denied for column) when a non-granted column
    // is requested. Either the request errors, or — defensively — the column is absent.
    if (studentErr) {
      const code = (studentErr as { code?: string }).code
      const message = studentErr.message.toLowerCase()
      expect(
        code === '42501' ||
          message.includes('permission denied') ||
          message.includes('ordering_items'),
        `unexpected error: ${code}: ${studentErr.message}`,
      ).toBe(true)
    } else {
      // Defensive: if no error, the answer-key column must NOT have leaked.
      const rows = (studentData ?? []) as Array<Record<string, unknown>>
      for (const r of rows) {
        expect('ordering_items' in r).toBe(false)
      }
    }

    // Non-vacuity: the service role (which bypasses the column REVOKE) CAN read it,
    // proving the column genuinely exists and carries the canonical-order key.
    const { data: adminData, error: adminErr } = await admin
      .from('questions')
      .select('id, ordering_items')
      .eq('id', orderingId)
      .single<{ id: string; ordering_items: OrderingItem[] }>()
    expect(adminErr).toBeNull()
    expect(adminData?.ordering_items.map((i) => i.id)).toEqual(ORDERING_ITEMS.map((i) => i.id))
  })
})
