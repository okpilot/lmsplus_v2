import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildVfrRtAnswers,
  cleanupVfrRtPool,
  VFR_RT_DF_ANSWER,
  VFR_RT_MC_CORRECT,
  VFR_RT_SA_ANSWER,
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
