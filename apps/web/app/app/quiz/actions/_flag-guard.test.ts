import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findActiveInternalExamSession, flagQuestion, unflagQuestion } from './_flag-guard'

// ---- Helpers ---------------------------------------------------------------

/** Builds a fluent Supabase chain that resolves to the given return value. */
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

type MockSupabase = Parameters<typeof findActiveInternalExamSession>[0]

function makeSupabase(returnValue: unknown): MockSupabase {
  return { from: () => buildChain(returnValue) } as unknown as MockSupabase
}

// ---- Fixtures --------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'

// ---- findActiveInternalExamSession -----------------------------------------

describe('findActiveInternalExamSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns active:true when an active internal_exam session exists', async () => {
    const supabase = makeSupabase({ data: { id: SESSION_ID }, error: null })

    const result = await findActiveInternalExamSession(supabase, USER_ID)

    expect(result).toEqual({ active: true, dbError: false })
  })

  it('returns active:false when no active internal_exam session is found', async () => {
    const supabase = makeSupabase({ data: null, error: null })

    const result = await findActiveInternalExamSession(supabase, USER_ID)

    expect(result).toEqual({ active: false, dbError: false })
  })

  it('returns dbError:true and logs the error when the query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ data: null, error: { message: 'DB connection reset' } })

    const result = await findActiveInternalExamSession(supabase, USER_ID)

    expect(result).toEqual({ active: false, dbError: true })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[toggleFlag] active-exam guard error:',
      'DB connection reset',
    )
  })
})

// ---- flagQuestion ----------------------------------------------------------

describe('flagQuestion', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('flags the question when persistence succeeds', async () => {
    const supabase = makeSupabase({ error: null })

    const result = await flagQuestion(supabase, USER_ID, QUESTION_ID)

    expect(result).toEqual({ success: true, flagged: true })
  })

  it('returns a failure and logs when the flag cannot be persisted', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ error: { message: 'unique constraint' } })

    const result = await flagQuestion(supabase, USER_ID, QUESTION_ID)

    expect(result).toEqual({ success: false, error: 'Failed to flag' })
    expect(consoleSpy).toHaveBeenCalledWith('[toggleFlag] Flag error:', 'unique constraint')
  })
})

// ---- unflagQuestion --------------------------------------------------------

describe('unflagQuestion', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('unflags the question when an active flag is cleared', async () => {
    const supabase = makeSupabase({ data: [{ student_id: USER_ID }], error: null })

    const result = await unflagQuestion(supabase, USER_ID, QUESTION_ID)

    expect(result).toEqual({ success: true, flagged: false })
  })

  it('treats an already-cleared flag as successfully unflagged', async () => {
    const supabase = makeSupabase({ data: [], error: null })

    const result = await unflagQuestion(supabase, USER_ID, QUESTION_ID)

    expect(result).toEqual({ success: true, flagged: false })
  })

  it('returns a failure and logs when clearing the flag fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ data: null, error: { message: 'rls denied' } })

    const result = await unflagQuestion(supabase, USER_ID, QUESTION_ID)

    expect(result).toEqual({ success: false, error: 'Failed to unflag' })
    expect(consoleSpy).toHaveBeenCalledWith('[toggleFlag] Unflag error:', 'rls denied')
  })
})
