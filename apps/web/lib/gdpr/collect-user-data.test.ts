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

  function makeChain(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {}
    const terminal = vi.fn().mockResolvedValue(result)
    // Build a Proxy that forwards any method call back to the same chain,
    // terminating at `.single()` or an awaited promise.
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop) {
        if (prop === 'then') {
          // Allow the chain itself to be awaited (returns result without .single())
          return (resolve: (v: unknown) => void) => resolve(result)
        }
        if (prop === 'single') return terminal
        return () => new Proxy(target, handler)
      },
    }
    return new Proxy(chain, handler)
  }

  const tableData: Record<string, { data: unknown; error: unknown }> = {
    users: { data: userData, error: userError },
    quiz_sessions: { data: sessionsData, error: null },
    student_responses: { data: responsesData, error: null },
    fsrs_cards: { data: fsrsData, error: null },
    flagged_questions: { data: flagsData, error: null },
    question_comments: { data: commentsData, error: null },
    user_consents: { data: consentsData, error: null },
    audit_events: { data: auditData, error: null },
    quiz_session_answers: { data: answersData, error: null },
  }

  return {
    from: (table: string) => makeChain(tableData[table] ?? { data: [], error: null }),
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
})
