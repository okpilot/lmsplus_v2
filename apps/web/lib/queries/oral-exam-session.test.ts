import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { getActiveOralExamSession, getOralExamSession } from './oral-exam-session'

// ---- Helpers --------------------------------------------------------------

/**
 * Proxy-based fluent chain stub — forwards every chained Supabase method
 * (select, eq, is, maybeSingle, …) back to itself and ultimately resolves to
 * `returnValue`. Defined locally per the project buildChain convention.
 */
function makeChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const proxy: Record<string, unknown> = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => proxy
    },
  })
  return proxy
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// getActiveOralExamSession
// ---------------------------------------------------------------------------

describe('getActiveOralExamSession', () => {
  it('returns null when the caller has no active session', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))

    const result = await getActiveOralExamSession()

    expect(result).toBeNull()
  })

  it('throws when the DB query returns an error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'connection reset' } }))

    await expect(getActiveOralExamSession()).rejects.toThrow(
      'Failed to fetch active oral session: connection reset',
    )
  })

  it('falls back to mode "mock" when config.mode is not a string', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: { id: 's1', status: 'in_progress', config: { mode: 42, sections: [] } },
        error: null,
      }),
    )

    const result = await getActiveOralExamSession()

    expect(result?.mode).toBe('mock')
  })

  it('falls back to mode "mock" when config is absent', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: { id: 's1', status: 'in_progress', config: null },
        error: null,
      }),
    )

    const result = await getActiveOralExamSession()

    expect(result?.mode).toBe('mock')
  })

  it('returns sections as empty array when config.sections is absent', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: { id: 's1', status: 'in_progress', config: { mode: 'practice' } },
        error: null,
      }),
    )

    const result = await getActiveOralExamSession()

    expect(result?.sections).toEqual([])
  })

  it('returns sections as empty array when config.sections is not an array', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: { id: 's1', status: 'in_progress', config: { mode: 'practice', sections: 'bad' } },
        error: null,
      }),
    )

    const result = await getActiveOralExamSession()

    expect(result?.sections).toEqual([])
  })

  it('returns each planned section with a numeric sectionNo and a type', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: {
          id: 's1',
          status: 'in_progress',
          config: {
            mode: 'practice',
            sections: [
              { section_no: 1, type: 'interview' },
              { section_no: 2, type: 'picture_description' },
            ],
          },
        },
        error: null,
      }),
    )

    const result = await getActiveOralExamSession()

    expect(result?.sections).toEqual([
      { sectionNo: 1, type: 'interview' },
      { sectionNo: 2, type: 'picture_description' },
    ])
  })

  it('filters out non-object elements in config.sections', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: {
          id: 's1',
          status: 'in_progress',
          config: {
            mode: 'mock',
            sections: [null, 'bad', { section_no: 1, type: 'interview' }, 42],
          },
        },
        error: null,
      }),
    )

    const result = await getActiveOralExamSession()

    expect(result?.sections).toEqual([{ sectionNo: 1, type: 'interview' }])
  })
})

// ---------------------------------------------------------------------------
// getOralExamSession
// ---------------------------------------------------------------------------

describe('getOralExamSession', () => {
  it('returns null when no session row is found', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))

    const result = await getOralExamSession('00000000-0000-4000-a000-000000000000')

    expect(result).toBeNull()
  })

  it('throws when the DB query returns an error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'timeout' } }))

    await expect(getOralExamSession('some-id')).rejects.toThrow(
      'Failed to fetch oral session: timeout',
    )
  })

  it('returns responses as empty array when oral_exam_section_responses is null', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: {
          id: 's1',
          status: 'in_progress',
          config: { mode: 'practice', sections: [] },
          oral_exam_section_responses: null,
        },
        error: null,
      }),
    )

    const result = await getOralExamSession('s1')

    expect(result?.responses).toEqual([])
  })

  it('returns each section response with a numeric sectionNo and a status', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: {
          id: 's1',
          status: 'in_progress',
          config: { mode: 'mock', sections: [{ section_no: 1, type: 'interview' }] },
          oral_exam_section_responses: [
            { section_no: 1, status: 'grading' },
            { section_no: 2, status: 'scored' },
          ],
        },
        error: null,
      }),
    )

    const result = await getOralExamSession('s1')

    expect(result?.responses).toEqual([
      { sectionNo: 1, status: 'grading' },
      { sectionNo: 2, status: 'scored' },
    ])
  })

  it('includes config-derived sections and section responses in the full detail shape', async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: {
          id: 's1',
          status: 'graded',
          config: {
            mode: 'practice',
            sections: [{ section_no: 1, type: 'interview' }],
          },
          oral_exam_section_responses: [{ section_no: 1, status: 'scored' }],
        },
        error: null,
      }),
    )

    const result = await getOralExamSession('s1')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('s1')
    expect(result?.status).toBe('graded')
    expect(result?.mode).toBe('practice')
    expect(result?.sections).toEqual([{ sectionNo: 1, type: 'interview' }])
    expect(result?.responses).toEqual([{ sectionNo: 1, status: 'scored' }])
  })
})
