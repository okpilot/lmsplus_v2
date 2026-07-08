import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSubjectInfo } from './resolve-subject-info'

// ---- Helpers ---------------------------------------------------------------

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

const mockFrom = vi.fn()

// A minimal client whose `.from(...)` chain resolves to the given { data, error }.
function fakeClient(returnValue: unknown): Parameters<typeof resolveSubjectInfo>[0] {
  mockFrom.mockReturnValue(buildChain(returnValue))
  return { from: mockFrom } as unknown as Parameters<typeof resolveSubjectInfo>[0]
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

// ---- resolveSubjectInfo ----------------------------------------------------

describe('resolveSubjectInfo', () => {
  it('returns null name and code without querying when no subject id is given', async () => {
    const client = fakeClient({ data: null, error: null })
    const result = await resolveSubjectInfo(client, null, '[test]')
    expect(result).toEqual({ subjectName: null, subjectCode: null })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns the subject name and code when the lookup succeeds', async () => {
    const client = fakeClient({ data: { name: 'Radiotelephony', code: 'RT' }, error: null })
    const result = await resolveSubjectInfo(client, 'subject-1', '[test]')
    expect(result).toEqual({ subjectName: 'Radiotelephony', subjectCode: 'RT' })
    expect(mockFrom).toHaveBeenCalledWith('easa_subjects')
  })

  it('returns nulls when the subject row is not found', async () => {
    const client = fakeClient({ data: null, error: null })
    const result = await resolveSubjectInfo(client, 'missing-id', '[test]')
    expect(result).toEqual({ subjectName: null, subjectCode: null })
  })

  it('logs and returns nulls when the lookup errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = fakeClient({ data: null, error: { message: 'boom' } })
    const result = await resolveSubjectInfo(client, 'subject-1', '[getQuizReportSummary]')
    expect(result).toEqual({ subjectName: null, subjectCode: null })
    expect(errorSpy).toHaveBeenCalledWith('[getQuizReportSummary] Subject lookup error:', 'boom')
  })
})
