import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Subject under test ---------------------------------------------------

import { collectUserData } from './collect-user-data'

// ---- Helpers ---------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

const MOCK_USER = {
  id: USER_ID,
  email: 'student@example.com',
  full_name: 'Jane Smith',
  role: 'student',
  created_at: '2026-01-01T00:00:00Z',
  last_active_at: '2026-03-01T00:00:00Z',
}

const MOCK_SESSION = {
  id: 'sess-1',
  mode: 'study',
  subject_id: 'subj-1',
  topic_id: null,
  total_questions: 10,
  correct_count: 8,
  score_percentage: 80,
  started_at: '2026-03-01T10:00:00Z',
  ended_at: '2026-03-01T10:30:00Z',
}

const MOCK_ANSWER = {
  session_id: 'sess-1',
  question_id: 'q-1',
  selected_option_id: 'opt-1',
  is_correct: true,
  response_time_ms: 4000,
  answered_at: '2026-03-01T10:05:00Z',
}

/**
 * Count/range-aware chain proxy.
 * - `.select('*', { head: true })` → resolves `{ count, error }` (count call)
 * - `.range(from, to)` → resolves `{ data: rows.slice(from, to+1), error }` (page call)
 * - `.single()` → resolves `{ data: rows, error }` (used for the user row)
 * - awaited directly → resolves `{ data: rows, error }` (legacy / non-paginated path)
 */
function makeChain(rows: unknown, error: unknown) {
  const state = { head: false, from: 0, to: Number.MAX_SAFE_INTEGER }
  const resolveValue = () => {
    if (error) return state.head ? { count: null, error } : { data: null, error }
    if (state.head) return { count: Array.isArray(rows) ? rows.length : 0, error: null }
    if (Array.isArray(rows)) return { data: rows.slice(state.from, state.to + 1), error: null }
    return { data: rows, error: null } // non-array (e.g. user object) or null
  }
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolveValue())
      if (prop === 'single') return vi.fn().mockResolvedValue({ data: rows, error })
      if (prop === 'select') {
        return (_col: unknown, opts?: { head?: boolean; count?: string }) => {
          if (opts?.head) state.head = true
          return new Proxy(target, handler)
        }
      }
      if (prop === 'range') {
        return (from: number, to: number) => {
          state.from = from
          state.to = to
          return new Proxy(target, handler)
        }
      }
      return () => new Proxy(target, handler)
    },
  }
  return new Proxy({} as Record<string, unknown>, handler)
}

/**
 * Build a fake Supabase client that returns pre-configured data for each table.
 * Each call to `.from(tableName)` returns a chain that resolves to the supplied value.
 */
function buildSupabaseClient(
  overrides: {
    userError?: { message: string } | null
    userData?: object | null
    sessionsData?: object[]
    responsesData?: object[]
    fsrsData?: object[]
    flagsData?: object[]
    commentsData?: object[]
    consentsData?: object[]
    auditData?: object[]
    answersData?: object[]
  } = {},
): SupabaseClient<Database> {
  const {
    userError = null,
    userData = MOCK_USER,
    sessionsData = [MOCK_SESSION],
    responsesData = [],
    fsrsData = [],
    flagsData = [],
    commentsData = [],
    consentsData = [],
    auditData = [],
    answersData = [MOCK_ANSWER],
  } = overrides

  const tableData: Record<string, { data: unknown; error: unknown }> = {
    users: { data: userData, error: userError },
    quiz_sessions: { data: sessionsData, error: null },
    student_responses: { data: responsesData, error: null },
    fsrs_cards: { data: fsrsData, error: null },
    active_flagged_questions: { data: flagsData, error: null },
    question_comments: { data: commentsData, error: null },
    user_consents: { data: consentsData, error: null },
    audit_events: { data: auditData, error: null },
    quiz_session_answers: { data: answersData, error: null },
  }

  return {
    from: (table: string) =>
      makeChain(
        (tableData[table] ?? { data: [], error: null }).data,
        (tableData[table] ?? { data: [], error: null }).error,
      ),
  } as unknown as SupabaseClient<Database>
}

/**
 * Variant that injects errors for specific tables while keeping user data valid.
 */
function buildSupabaseClientWithErrors(
  errors: {
    sessionsError?: { message: string }
    responsesError?: { message: string }
    fsrsError?: { message: string }
    flagsError?: { message: string }
    commentsError?: { message: string }
    consentsError?: { message: string }
    auditError?: { message: string }
    answersError?: { message: string }
  } = {},
): SupabaseClient<Database> {
  const tableData: Record<string, { data: unknown; error: unknown }> = {
    users: { data: MOCK_USER, error: null },
    quiz_sessions: {
      data: errors.sessionsError ? null : [MOCK_SESSION],
      error: errors.sessionsError ?? null,
    },
    student_responses: {
      data: errors.responsesError ? null : [],
      error: errors.responsesError ?? null,
    },
    fsrs_cards: { data: errors.fsrsError ? null : [], error: errors.fsrsError ?? null },
    active_flagged_questions: {
      data: errors.flagsError ? null : [],
      error: errors.flagsError ?? null,
    },
    question_comments: {
      data: errors.commentsError ? null : [],
      error: errors.commentsError ?? null,
    },
    user_consents: { data: errors.consentsError ? null : [], error: errors.consentsError ?? null },
    audit_events: { data: errors.auditError ? null : [], error: errors.auditError ?? null },
    quiz_session_answers: {
      data: errors.answersError ? null : [],
      error: errors.answersError ?? null,
    },
  }

  return {
    from: (table: string) =>
      makeChain(
        (tableData[table] ?? { data: [], error: null }).data,
        (tableData[table] ?? { data: [], error: null }).error,
      ),
  } as unknown as SupabaseClient<Database>
}

/**
 * Variant that returns null data for all non-user tables to exercise ?? [] fallbacks.
 */
function buildSupabaseClientWithNulls(): SupabaseClient<Database> {
  const tableData: Record<string, { data: unknown; error: unknown }> = {
    users: { data: MOCK_USER, error: null },
    quiz_sessions: { data: null, error: null },
    student_responses: { data: null, error: null },
    fsrs_cards: { data: null, error: null },
    active_flagged_questions: { data: null, error: null },
    question_comments: { data: null, error: null },
    user_consents: { data: null, error: null },
    audit_events: { data: null, error: null },
    quiz_session_answers: { data: null, error: null },
  }

  return {
    from: (table: string) =>
      makeChain(
        (tableData[table] ?? { data: [], error: null }).data,
        (tableData[table] ?? { data: [], error: null }).error,
      ),
  } as unknown as SupabaseClient<Database>
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('collectUserData', () => {
  describe('happy path', () => {
    it('returns a payload with user profile data', async () => {
      const supabase = buildSupabaseClient()
      const result = await collectUserData(supabase, USER_ID)

      expect(result.user.id).toBe(USER_ID)
      expect(result.user.email).toBe('student@example.com')
      expect(result.user.full_name).toBe('Jane Smith')
    })

    it('includes an exported_at ISO timestamp in the payload', async () => {
      const supabase = buildSupabaseClient()
      const result = await collectUserData(supabase, USER_ID)

      expect(result.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('includes quiz sessions when they exist', async () => {
      const supabase = buildSupabaseClient()
      const result = await collectUserData(supabase, USER_ID)

      expect(result.quiz_sessions).toHaveLength(1)
      // Test data guarantees at least one session
      expect(result.quiz_sessions[0]!.id).toBe('sess-1')
    })

    it('includes quiz answers when sessions exist', async () => {
      const supabase = buildSupabaseClient()
      const result = await collectUserData(supabase, USER_ID)

      expect(result.quiz_answers).toHaveLength(1)
      // Test data guarantees at least one answer
      expect(result.quiz_answers[0]!.session_id).toBe('sess-1')
    })

    it('returns empty arrays for all collections when user has no activity', async () => {
      const supabase = buildSupabaseClient({ sessionsData: [] })
      const result = await collectUserData(supabase, USER_ID)

      expect(result.quiz_sessions).toHaveLength(0)
      expect(result.quiz_answers).toHaveLength(0)
      expect(result.student_responses).toHaveLength(0)
      expect(result.fsrs_cards).toHaveLength(0)
      expect(result.flagged_questions).toHaveLength(0)
      expect(result.question_comments).toHaveLength(0)
      expect(result.user_consents).toHaveLength(0)
      expect(result.audit_events).toHaveLength(0)
    })
  })

  describe('session answers phase 2', () => {
    it('skips the quiz_session_answers query when there are no sessions', async () => {
      const supabase = buildSupabaseClient({ sessionsData: [] })
      const result = await collectUserData(supabase, USER_ID)

      expect(result.quiz_answers).toHaveLength(0)
    })

    it('fetches quiz_session_answers only for sessions that belong to the user', async () => {
      const supabase = buildSupabaseClient({
        sessionsData: [MOCK_SESSION],
        answersData: [MOCK_ANSWER],
      })
      const result = await collectUserData(supabase, USER_ID)

      expect(result.quiz_answers).toHaveLength(1)
    })
  })

  describe('ip_address normalisation', () => {
    it('keeps ip_address as a string when it is a string', async () => {
      const supabase = buildSupabaseClient({
        auditData: [
          {
            event_type: 'auth.login',
            resource_type: 'user',
            resource_id: null,
            ip_address: '192.168.1.1',
            created_at: '2026-03-01T10:00:00Z',
          },
        ],
      })
      const result = await collectUserData(supabase, USER_ID)

      // Test data guarantees at least one audit event
      expect(result.audit_events[0]!.ip_address).toBe('192.168.1.1')
    })

    it('coerces non-string ip_address values to null', async () => {
      const supabase = buildSupabaseClient({
        auditData: [
          {
            event_type: 'auth.login',
            resource_type: 'user',
            resource_id: null,
            ip_address: { raw: '10.0.0.1' }, // object, not a string
            created_at: '2026-03-01T10:00:00Z',
          },
        ],
      })
      const result = await collectUserData(supabase, USER_ID)

      // Test data guarantees at least one audit event
      expect(result.audit_events[0]!.ip_address).toBeNull()
    })
  })

  describe('error handling', () => {
    it('throws when the user record is not found', async () => {
      const supabase = buildSupabaseClient({
        userData: null,
        userError: { message: 'PGRST116' },
      })

      await expect(collectUserData(supabase, USER_ID)).rejects.toThrow('User not found')
    })

    it('throws when user query returns data null even without an error', async () => {
      const supabase = buildSupabaseClient({ userData: null, userError: null })

      await expect(collectUserData(supabase, USER_ID)).rejects.toThrow('User not found')
    })
  })

  describe('table query error logging', () => {
    it('logs errors for failing non-user table queries but still returns data', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const supabase = buildSupabaseClientWithErrors({
        sessionsError: { message: 'timeout' },
        flagsError: { message: 'connection lost' },
      })
      const result = await collectUserData(supabase, USER_ID)

      expect(consoleSpy).toHaveBeenCalledWith(
        '[collectUserData] quiz_sessions query failed:',
        'timeout',
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        '[collectUserData] flagged_questions query failed:',
        'connection lost',
      )
      // Returns empty arrays for failed tables
      expect(result.quiz_sessions).toHaveLength(0)
      expect(result.flagged_questions).toHaveLength(0)
      // Non-failed tables still return data
      expect(result.user.id).toBe(USER_ID)
      consoleSpy.mockRestore()
    })

    it('logs error when quiz_session_answers query fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const supabase = buildSupabaseClientWithErrors({
        answersError: { message: 'answers timeout' },
      })
      const result = await collectUserData(supabase, USER_ID)

      expect(consoleSpy).toHaveBeenCalledWith(
        '[collectUserData] quiz_session_answers query failed:',
        'answers timeout',
      )
      expect(result.quiz_answers).toHaveLength(0)
      consoleSpy.mockRestore()
    })
  })

  describe('null data fallbacks', () => {
    it('falls back to empty arrays when table data is null', async () => {
      const supabase = buildSupabaseClientWithNulls()
      const result = await collectUserData(supabase, USER_ID)

      expect(result.quiz_sessions).toEqual([])
      expect(result.student_responses).toEqual([])
      expect(result.fsrs_cards).toEqual([])
      expect(result.flagged_questions).toEqual([])
      expect(result.question_comments).toEqual([])
      expect(result.user_consents).toEqual([])
      expect(result.audit_events).toEqual([])
      expect(result.quiz_answers).toEqual([])
    })

    it('returns empty quiz_answers when the phase-2 answers query fails', async () => {
      // Sessions exist (so phase-2 fires), but the answers query errors.
      const supabase = buildSupabaseClientWithErrors({ answersError: { message: 'timeout' } })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await collectUserData(supabase, USER_ID)

      // fetchUserSessionAnswers returns { data: [], error } on failure (never null) — empty + logged.
      expect(result.quiz_answers).toEqual([])
      expect(result.quiz_sessions).toHaveLength(1) // sessions exist, phase-2 fired
      consoleSpy.mockRestore()
    })
  })

  describe('flagged_questions runtime filter', () => {
    it('drops flagged rows where question_id or flagged_at is null and logs the drop', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const supabase = buildSupabaseClient({
        flagsData: [
          { question_id: 'q-valid', flagged_at: '2026-03-01T10:00:00Z' }, // valid — kept
          { question_id: null, flagged_at: '2026-03-01T10:00:00Z' }, // null question_id — dropped
          { question_id: 'q-no-date', flagged_at: null }, // null flagged_at — dropped
          { question_id: null, flagged_at: null }, // both null — dropped
        ],
      })
      const result = await collectUserData(supabase, USER_ID)

      expect(result.flagged_questions).toHaveLength(1)
      expect(result.flagged_questions[0]!.question_id).toBe('q-valid')
      expect(result.flagged_questions[0]!.flagged_at).toBe('2026-03-01T10:00:00Z')
      // A silently shortened legal export is the #668 failure mode — the drop must be logged.
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dropped 3 row(s)'))
      consoleSpy.mockRestore()
    })

    it('keeps all flagged rows when every row has non-null question_id and flagged_at', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const supabase = buildSupabaseClient({
        flagsData: [
          { question_id: 'q-1', flagged_at: '2026-03-01T10:00:00Z' },
          { question_id: 'q-2', flagged_at: '2026-03-02T10:00:00Z' },
        ],
      })
      const result = await collectUserData(supabase, USER_ID)

      expect(result.flagged_questions).toHaveLength(2)
      // No rows dropped → no drop log (guards against a `<` → `>=` regression).
      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('pagination', () => {
    it('fetches all rows when a table exceeds one page', async () => {
      const responsesData = Array.from({ length: 2500 }, (_, i) => ({
        question_id: `q-${i}`,
        selected_option_id: null,
        is_correct: i % 2 === 0,
        response_time_ms: 1000,
        session_id: 'sess-1',
        created_at: '2026-03-01T10:00:00Z',
      }))
      const supabase = buildSupabaseClient({ responsesData })
      const result = await collectUserData(supabase, USER_ID)

      expect(result.student_responses).toHaveLength(2500)
    })
  })
})
