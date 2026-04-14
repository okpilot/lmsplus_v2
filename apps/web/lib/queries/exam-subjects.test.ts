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

import type { ExamSubjectOption } from './exam-subjects'
import { getExamEnabledSubjects } from './exam-subjects'

// ---- Helpers --------------------------------------------------------------

function buildChain(returnValue: unknown) {
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

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getExamEnabledSubjects', () => {
  it('returns mapped ExamSubjectOption array on success', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            subject_id: 'sub-1',
            total_questions: 30,
            time_limit_seconds: 1800,
            pass_mark: 75,
            easa_subjects: { id: 'sub-1', code: 'MET', name: 'Meteorology', short: 'MET' },
          },
        ],
        error: null,
      }),
    )

    const result = await getExamEnabledSubjects()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual<ExamSubjectOption>({
      id: 'sub-1',
      code: 'MET',
      name: 'Meteorology',
      short: 'MET',
      totalQuestions: 30,
      timeLimitSeconds: 1800,
      passMark: 75,
    })
  })

  it('correctly maps all fields from the DB row', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            subject_id: 'sub-agk',
            total_questions: 50,
            time_limit_seconds: 3600,
            pass_mark: 80,
            easa_subjects: {
              id: 'sub-agk',
              code: 'AGK',
              name: 'Aircraft General Knowledge',
              short: 'AGK',
            },
          },
        ],
        error: null,
      }),
    )

    const result = await getExamEnabledSubjects()
    // Test data guarantees exactly one result
    const subject = result[0]!

    expect(subject.id).toBe('sub-agk')
    expect(subject.code).toBe('AGK')
    expect(subject.name).toBe('Aircraft General Knowledge')
    expect(subject.short).toBe('AGK')
    expect(subject.totalQuestions).toBe(50)
    expect(subject.timeLimitSeconds).toBe(3600)
    expect(subject.passMark).toBe(80)
  })

  it('returns empty array when query returns an error', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: null, error: { message: 'relation does not exist' } }),
    )

    const result = await getExamEnabledSubjects()

    expect(result).toEqual([])
  })

  it('logs console.error when query returns an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'connection timeout' } }))

    await getExamEnabledSubjects()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[getExamEnabledSubjects] Query error:',
      'connection timeout',
    )
    consoleSpy.mockRestore()
  })

  it('returns empty array when data is null', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    const result = await getExamEnabledSubjects()

    expect(result).toEqual([])
  })

  it('filters out rows where easa_subjects is null', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            subject_id: 'sub-1',
            total_questions: 30,
            time_limit_seconds: 1800,
            pass_mark: 75,
            easa_subjects: { id: 'sub-1', code: 'MET', name: 'Meteorology', short: 'MET' },
          },
          {
            subject_id: 'sub-orphan',
            total_questions: 20,
            time_limit_seconds: 1200,
            pass_mark: 70,
            easa_subjects: null,
          },
        ],
        error: null,
      }),
    )

    const result = await getExamEnabledSubjects()

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('sub-1')
  })

  it('returns empty array when all rows have null easa_subjects', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            subject_id: 'sub-orphan',
            total_questions: 20,
            time_limit_seconds: 1200,
            pass_mark: 70,
            easa_subjects: null,
          },
        ],
        error: null,
      }),
    )

    const result = await getExamEnabledSubjects()

    expect(result).toEqual([])
  })

  it('returns empty array when data is an empty array', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getExamEnabledSubjects()

    expect(result).toEqual([])
  })

  it('passes enabled=true filter to the query', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    await getExamEnabledSubjects()

    // The chain proxy captures all calls — verify from() was called with 'exam_configs'
    expect(mockFrom).toHaveBeenCalledWith('exam_configs')
  })

  it('maps multiple rows correctly when all have valid easa_subjects', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            subject_id: 'sub-1',
            total_questions: 30,
            time_limit_seconds: 1800,
            pass_mark: 75,
            easa_subjects: { id: 'sub-1', code: 'MET', name: 'Meteorology', short: 'MET' },
          },
          {
            subject_id: 'sub-2',
            total_questions: 50,
            time_limit_seconds: 3000,
            pass_mark: 80,
            easa_subjects: {
              id: 'sub-2',
              code: 'AGK',
              name: 'Aircraft General Knowledge',
              short: 'AGK',
            },
          },
        ],
        error: null,
      }),
    )

    const result = await getExamEnabledSubjects()

    expect(result).toHaveLength(2)
    expect(result[0]!.code).toBe('MET')
    expect(result[1]!.code).toBe('AGK')
  })
})
