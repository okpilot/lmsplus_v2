import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

// mig 150's is_valid_diagram_config(jsonb) CHECK guards questions.diagram_config
// at authoring time — the answer key + the geometry it protects must be
// structurally valid before a `diagram_label` row can be inserted. Every risky
// cast (numeric coord parse) is CASE-guarded on jsonb_typeof BEFORE casting,
// and all three arrays (zones/labels/answer) are CASE-guarded on
// jsonb_typeof = 'array' before jsonb_array_elements() — a non-array input
// must degrade to 23514 (check_violation), never a raw 22023/22P02. These
// totality guards only run when the CHECK actually EXECUTES against an INSERT
// — a `db reset` proves only that the function body parses.

type AnswerEntry = { zone_id: string; label_id: string }

type DiagramConfig = {
  image_ref: string
  zones: unknown
  labels: unknown
  answer: unknown
}

function baseValidConfig(): DiagramConfig {
  return {
    image_ref: 'rwy-27-09-lh-pattern',
    zones: [
      { id: 'zn1', x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
      { id: 'zn2', x: 0.6, y: 0.6, w: 0.1, h: 0.1 },
    ],
    labels: [
      { id: 'lb1', text: 'Label One' },
      { id: 'lb2', text: 'Label Two' },
      { id: 'lb3', text: 'Distractor' },
    ],
    answer: [
      { zone_id: 'zn1', label_id: 'lb1' },
      { zone_id: 'zn2', label_id: 'lb2' },
    ] satisfies AnswerEntry[],
  }
}

describe('CHECK: is_valid_diagram_config — authoring-time reject/accept', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let bankId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DiagramCheck ${suffix}`,
      slug: `test-diagramcheck-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-diagramcheck-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    refs = await seedReferenceData({
      admin,
      subjectCode: `DV${suffix}`,
      subjectName: `DiagramCheck Subject ${suffix}`,
      topicCode: `DV${suffix}-01`,
      topicName: `DiagramCheck Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `DiagramCheck Bank ${suffix}`,
        created_by: adminUserId,
      })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    bankId = requireRpcResult<{ id: string }>(bank, 'question_banks insert').id
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

  async function insertDiagram(
    config: unknown,
    label: string,
  ): Promise<{ error: { code?: string; message: string } | null; id?: string }> {
    const { data, error } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs!.subjectId,
        topic_id: refs!.topicId,
        subtopic_id: null,
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
        question_type: 'diagram_label',
        question_text: `Diagram CHECK — ${label}`,
        diagram_config: config,
        explanation_text: 'CHECK test',
      })
      .select('id')
      .single<{ id: string }>()
    return { error: error as { code?: string; message: string } | null, id: data?.id }
  }

  it('rejects a zone whose coordinate is not a number', async () => {
    const config = baseValidConfig()
    const zones = config.zones as Array<Record<string, unknown>>
    zones[0] = { ...zones[0], x: '0.2' } // string, not number
    const { error } = await insertDiagram(config, 'non-number coord')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects a zone coordinate that is out of the [0,1] range', async () => {
    const config = baseValidConfig()
    const zones = config.zones as Array<Record<string, unknown>>
    zones[0] = { ...zones[0], x: 1.5 } // valid number type, out of range
    const { error } = await insertDiagram(config, 'out-of-range coord')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects a diagram_config whose zones is a non-array JSON value', async () => {
    // Totality guard: a non-array `zones` must fail cleanly with 23514 — NOT a
    // raw 22023 from an unguarded jsonb_array_elements.
    const config = baseValidConfig()
    ;(config as unknown as { zones: unknown }).zones = { not: 'an-array' }
    const { error } = await insertDiagram(config, 'non-array zones')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects a diagram_config whose labels is a non-array JSON value', async () => {
    const config = baseValidConfig()
    ;(config as unknown as { labels: unknown }).labels = { not: 'an-array' }
    const { error } = await insertDiagram(config, 'non-array labels')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects a diagram_config whose answer is a non-array JSON value', async () => {
    const config = baseValidConfig()
    ;(config as unknown as { answer: unknown }).answer = { not: 'an-array' }
    const { error } = await insertDiagram(config, 'non-array answer')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an answer that leaves a zone uncovered', async () => {
    const config = baseValidConfig()
    // Only zn1 covered; zn2 has no answer entry — answer count (1) != zone count (2).
    config.answer = [{ zone_id: 'zn1', label_id: 'lb1' }] satisfies AnswerEntry[]
    const { error } = await insertDiagram(config, 'uncovered zone')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an answer entry that references an unknown zone id', async () => {
    const config = baseValidConfig()
    config.answer = [
      { zone_id: 'zn1', label_id: 'lb1' },
      { zone_id: 'zn-does-not-exist', label_id: 'lb2' },
    ] satisfies AnswerEntry[]
    const { error } = await insertDiagram(config, 'unknown zone ref')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an answer entry that references an unknown label id', async () => {
    const config = baseValidConfig()
    config.answer = [
      { zone_id: 'zn1', label_id: 'lb1' },
      { zone_id: 'zn2', label_id: 'lb-does-not-exist' },
    ] satisfies AnswerEntry[]
    const { error } = await insertDiagram(config, 'unknown label ref')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an answer that covers the same zone twice', async () => {
    const config = baseValidConfig()
    // Both entries target zn1; zn2 is never referenced — distinct zone_id
    // count (1) != zone count (2).
    config.answer = [
      { zone_id: 'zn1', label_id: 'lb1' },
      { zone_id: 'zn1', label_id: 'lb2' },
    ] satisfies AnswerEntry[]
    const { error } = await insertDiagram(config, 'duplicate zone in answer')
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('accepts a valid diagram_config with an unused distractor label', async () => {
    // Positive control: baseValidConfig's lb3 is never referenced by `answer`
    // — Decision 52 explicitly allows distractors, so this must succeed.
    const config = baseValidConfig()
    const { error, id } = await insertDiagram(config, 'valid with distractor')
    expect(error).toBeNull()
    expect(typeof id).toBe('string')

    // Non-vacuity: the row is genuinely persisted with the distractor label intact.
    const { data: stored, error: readErr } = await admin
      .from('questions')
      .select('diagram_config')
      .eq('id', id as string)
      .single<{ diagram_config: DiagramConfig }>()
    expect(readErr).toBeNull()
    const labels = stored?.diagram_config.labels as Array<{ id: string }> | undefined
    expect(labels?.map((l) => l.id)).toContain('lb3')
  })
})
