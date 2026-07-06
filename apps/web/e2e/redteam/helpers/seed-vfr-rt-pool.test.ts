import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildVfrRtAnswers,
  cleanupVfrRtPool,
  seedVfrRtPool,
  VFR_RT_DF_ANSWER,
  VFR_RT_MC_CORRECT,
  VFR_RT_PASS_MARK,
  VFR_RT_POOL_SIZE,
  VFR_RT_SA_ANSWER,
  VFR_RT_TIME_LIMIT_SECONDS,
} from './seed-vfr-rt-pool'

// ---------------------------------------------------------------------------
// Supabase admin-client mock — same buildChain pattern as cleanup.test.ts.
// The helper module has no runtime imports (admin is passed in), so only the
// injected client is mocked.
// ---------------------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())

function buildChain(returnValue: unknown): unknown {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

// Variant of buildChain that also captures the payload passed to `.update(...)`
// on the returned chain, so a test can assert exactly what was written (e.g.
// distinguishing a `deleted_at` soft-delete from a prior-settings restore).
function buildChainCapture(
  returnValue: unknown,
  captureUpdate: (payload: unknown) => void,
  captureFilter?: (column: unknown, value: unknown) => void,
): unknown {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        if (prop === 'update') captureUpdate(args[0])
        if (prop === 'eq' && captureFilter) captureFilter(args[0], args[1])
        return buildChainCapture(returnValue, captureUpdate, captureFilter)
      }
    },
  })
}

const adminMock = { from: mockFrom } as unknown as SupabaseClient

beforeEach(() => {
  vi.resetAllMocks()
})

// cleanupVfrRtPool issues from() in this order:
//   1. questions   (soft-delete pool rows)
//   2. easa_subjects (resolve RT subject id)
//   3. exam_configs (soft-delete the org's RT config)

describe('cleanupVfrRtPool — no-op silence', () => {
  it('does not throw or log when no pool rows and no config match', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // questions: 0 rows
      .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null })) // subject
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // exam_configs: 0 rows

    await expect(cleanupVfrRtPool({ admin: adminMock, orgId: 'org-1' })).resolves.toBeUndefined()
    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('cleanupVfrRtPool — logging on actual mutation', () => {
  it('logs once per step that soft-deleted at least one row', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [{ id: 'q1' }, { id: 'q2' }], error: null }))
      .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null }))
      .mockReturnValueOnce(buildChain({ data: [{ id: 'cfg1' }], error: null }))

    await cleanupVfrRtPool({ admin: adminMock, orgId: 'org-1' })
    expect(logSpy).toHaveBeenCalledTimes(2)
  })
})

describe('cleanupVfrRtPool — error paths', () => {
  it('surfaces a question soft-delete failure', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'questions boom' } }))
      .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null }))
      .mockReturnValueOnce(buildChain({ data: [], error: null }))

    await expect(cleanupVfrRtPool({ admin: adminMock, orgId: 'org-1' })).rejects.toThrow(
      /questions boom/,
    )
  })

  it('surfaces an exam_config soft-delete failure', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // questions ok
      .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null })) // subject ok
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'config boom' } }))

    await expect(cleanupVfrRtPool({ admin: adminMock, orgId: 'org-1' })).rejects.toThrow(
      /config boom/,
    )
  })

  it('surfaces a missing RT subject when resolving the config step', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // questions ok
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'no subject' } })) // subject fails

    await expect(cleanupVfrRtPool({ admin: adminMock, orgId: 'org-1' })).rejects.toThrow(
      /RT subject not found/,
    )
  })

  it('aggregates failures from both steps into one error', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'questions boom' } }))
      .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null }))
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'config boom' } }))

    await expect(cleanupVfrRtPool({ admin: adminMock, orgId: 'org-1' })).rejects.toThrow(
      /questions boom.*config boom|config boom.*questions boom/,
    )
  })
})

// seedVfrRtPool issues from() in this order:
//   1. easa_subjects   (resolveRtSubjectId, via resolveRtRefs)
//   2. easa_topics     (resolveRtRefs)
//   3. question_banks  (ensureBank lookup — mocked as a reuse, no insert)
//   4. questions       (SA insert)
//   5. questions       (DF insert)
//   6. questions       (MC insert)
//   7. exam_configs    (ensureRtExamConfig lookup)
//   8. exam_configs    (insert OR normalize UPDATE, only reached per-branch)
function mockSeedPoolChainThroughQuestions() {
  mockFrom
    .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null })) // easa_subjects
    .mockReturnValueOnce(
      buildChain({
        data: [
          { id: 'topic-p1', code: 'P1_ACRONYMS' },
          { id: 'topic-p2', code: 'P2_DIALOG' },
          { id: 'topic-p3', code: 'P3_MC' },
        ],
        error: null,
      }),
    ) // easa_topics
    .mockReturnValueOnce(buildChain({ data: { id: 'bank-1' }, error: null })) // question_banks: reuse existing
    .mockReturnValueOnce(buildChain({ data: [{ id: 'sa-1' }], error: null })) // questions: SA insert
    .mockReturnValueOnce(buildChain({ data: [{ id: 'df-1' }], error: null })) // questions: DF insert
    .mockReturnValueOnce(buildChain({ data: [{ id: 'mc-1' }], error: null })) // questions: MC insert
}

describe('seedVfrRtPool — exam_config ownership tracking', () => {
  it('returns configCreated=true when the exam_configs lookup finds no existing row', async () => {
    mockSeedPoolChainThroughQuestions()
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: null })) // exam_configs lookup: none
      .mockReturnValueOnce(buildChain({ data: { id: 'cfg-new' }, error: null })) // exam_configs insert

    const pool = await seedVfrRtPool({ admin: adminMock, orgId: 'org-1', adminUserId: 'admin-1' })

    expect(pool.configCreated).toBe(true)
    expect(pool.configId).toBe('cfg-new')
    expect(pool.configPrior).toBeUndefined()
  })

  it('returns configCreated=false and no configPrior when the insert loses a 23505 race and reselects the winner row', async () => {
    mockSeedPoolChainThroughQuestions()
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: null })) // exam_configs lookup: none
      .mockReturnValueOnce(
        buildChain({ data: null, error: { code: '23505', message: 'duplicate key' } }),
      ) // insert: lost race
      .mockReturnValueOnce(buildChain({ data: { id: 'cfg-raced' }, error: null })) // reselect winner

    const pool = await seedVfrRtPool({ admin: adminMock, orgId: 'org-1', adminUserId: 'admin-1' })

    expect(pool.configCreated).toBe(false)
    expect(pool.configId).toBe('cfg-raced')
    expect(pool.configPrior).toBeUndefined()
  })

  it('returns configCreated=false and captures prior settings without firing a normalize UPDATE when the existing config already has canonical values', async () => {
    mockSeedPoolChainThroughQuestions()
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: {
          id: 'cfg-canonical',
          enabled: true,
          total_questions: VFR_RT_POOL_SIZE,
          time_limit_seconds: VFR_RT_TIME_LIMIT_SECONDS,
          pass_mark: VFR_RT_PASS_MARK,
        },
        error: null,
      }),
    ) // exam_configs lookup: already canonical — no normalize UPDATE follows

    const pool = await seedVfrRtPool({ admin: adminMock, orgId: 'org-1', adminUserId: 'admin-1' })

    expect(pool.configCreated).toBe(false)
    expect(pool.configId).toBe('cfg-canonical')
    expect(pool.configPrior).toEqual({
      enabled: true,
      total_questions: VFR_RT_POOL_SIZE,
      time_limit_seconds: VFR_RT_TIME_LIMIT_SECONDS,
      pass_mark: VFR_RT_PASS_MARK,
    })
    // 7 from() calls total: 6 base (subjects/topics/bank/sa/df/mc) + 1 exam_configs lookup.
    // No 8th call for a normalize UPDATE — confirms needsNormalize=false skips the mutation.
    expect(mockFrom).toHaveBeenCalledTimes(7)
  })

  it('returns configCreated=false and captures the pre-normalize settings when the exam_configs lookup finds an existing row', async () => {
    mockSeedPoolChainThroughQuestions()
    mockFrom
      .mockReturnValueOnce(
        buildChain({
          data: {
            id: 'cfg-existing',
            enabled: false,
            total_questions: 20,
            time_limit_seconds: 1500,
            pass_mark: 70,
          },
          error: null,
        }),
      ) // exam_configs lookup: existing row with stale settings
      .mockReturnValueOnce(buildChain({ data: [{ id: 'cfg-existing' }], error: null })) // normalize UPDATE

    const pool = await seedVfrRtPool({ admin: adminMock, orgId: 'org-1', adminUserId: 'admin-1' })

    expect(pool.configCreated).toBe(false)
    expect(pool.configId).toBe('cfg-existing')
    expect(pool.configPrior).toEqual({
      enabled: false,
      total_questions: 20,
      time_limit_seconds: 1500,
      pass_mark: 70,
    })
  })
})

describe('cleanupVfrRtPool — exam_config ownership branching', () => {
  it('soft-deletes the exam_config when the pool created it, targeting its own config id', async () => {
    const updatePayloads: unknown[] = []
    const filters: Array<[unknown, unknown]> = []
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // questions
      .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null })) // subject
      .mockReturnValueOnce(
        buildChainCapture(
          { data: [{ id: 'cfg-owned' }], error: null },
          (p) => updatePayloads.push(p),
          (col, val) => filters.push([col, val]),
        ),
      ) // exam_configs soft-delete

    await cleanupVfrRtPool({
      admin: adminMock,
      orgId: 'org-1',
      pool: { configCreated: true, configId: 'cfg-owned' },
    })

    expect(updatePayloads).toHaveLength(1)
    expect(updatePayloads[0]).toMatchObject({ deleted_at: expect.any(String) })
    // Targets the exact owned row, not just org+subject (cross-spec pollution guard).
    expect(filters).toContainEqual(['id', 'cfg-owned'])
  })

  it('restores the prior settings instead of soft-deleting when the pool reused an existing config, targeting its config id', async () => {
    const updatePayloads: unknown[] = []
    const filters: Array<[unknown, unknown]> = []
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // questions
      .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null })) // subject
      .mockReturnValueOnce(
        buildChainCapture(
          { data: [{ id: 'cfg-reused' }], error: null },
          (p) => updatePayloads.push(p),
          (col, val) => filters.push([col, val]),
        ),
      ) // exam_configs restore

    const prior = {
      enabled: false,
      total_questions: 20,
      time_limit_seconds: 1500,
      pass_mark: 70,
    }
    await cleanupVfrRtPool({
      admin: adminMock,
      orgId: 'org-1',
      pool: { configCreated: false, configPrior: prior, configId: 'cfg-reused' },
    })

    expect(updatePayloads).toHaveLength(1)
    expect(updatePayloads[0]).toEqual(prior)
    expect(updatePayloads[0]).not.toHaveProperty('deleted_at')
    // Restore targets the exact reused row by id, not just org+subject.
    expect(filters).toContainEqual(['id', 'cfg-reused'])
  })

  it('leaves the exam_config untouched when the pool reused it via a lost race and the prior settings are unknown', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: [], error: null })) // questions only

    await cleanupVfrRtPool({ admin: adminMock, orgId: 'org-1', pool: { configCreated: false } })

    // No easa_subjects or exam_configs call — the skip branch never resolves the subject id.
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('soft-deletes by org+subject only (no config id) when no pool is passed (backward compatibility)', async () => {
    const updatePayloads: unknown[] = []
    const filters: Array<[unknown, unknown]> = []
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // questions
      .mockReturnValueOnce(buildChain({ data: { id: 'rt-subject' }, error: null })) // subject
      .mockReturnValueOnce(
        buildChainCapture(
          { data: [{ id: 'cfg1' }], error: null },
          (p) => updatePayloads.push(p),
          (col, val) => filters.push([col, val]),
        ),
      ) // exam_configs soft-delete

    await cleanupVfrRtPool({ admin: adminMock, orgId: 'org-1' })

    expect(updatePayloads).toHaveLength(1)
    expect(updatePayloads[0]).toMatchObject({ deleted_at: expect.any(String) })
    // No ownership known → falls back to org+subject; must NOT constrain by a config id.
    expect(filters.map(([col]) => col)).not.toContain('id')
  })
})

describe('buildVfrRtAnswers', () => {
  const questions = [
    { id: 'sa-1', question_type: 'short_answer' },
    { id: 'df-1', question_type: 'dialog_fill' },
    { id: 'mc-1', question_type: 'multiple_choice' },
  ]

  it('builds a correct answer per type carrying only the fields that type allows', () => {
    const answers = buildVfrRtAnswers(questions)
    expect(answers).toEqual([
      { question_id: 'sa-1', response_text: VFR_RT_SA_ANSWER, response_time_ms: 1000 },
      {
        question_id: 'df-1',
        blank_index: 0,
        response_text: VFR_RT_DF_ANSWER,
        response_time_ms: 1000,
      },
      { question_id: 'mc-1', selected_option_id: VFR_RT_MC_CORRECT, response_time_ms: 1000 },
    ])
  })

  it('sends a wrong dialog_fill answer while keeping SA and MC correct when Part 2 should fail', () => {
    const answers = buildVfrRtAnswers(questions, { failPart2: true })
    const df = answers.find((a) => a.question_id === 'df-1')
    const sa = answers.find((a) => a.question_id === 'sa-1')
    const mc = answers.find((a) => a.question_id === 'mc-1')
    expect(df?.response_text).toBe('WRONG')
    expect(sa?.response_text).toBe(VFR_RT_SA_ANSWER)
    expect(mc?.selected_option_id).toBe(VFR_RT_MC_CORRECT)
  })

  it('throws on a question_type outside the RT pool', () => {
    expect(() => buildVfrRtAnswers([{ id: 'x-1', question_type: 'diagram_label' }])).toThrow(
      /unsupported question_type/,
    )
  })
})
