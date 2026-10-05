import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc, mockFrom, mockCreateClient } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({ createServerSupabaseClient: mockCreateClient }))
vi.mock('@/lib/supabase-rpc', () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }))

import { loadQuizSessionState } from './load-quiz-session-state'

const SESSION = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const Q1 = '33333333-3333-4333-8333-333333333333'
const Q2 = '44444444-4444-4444-8444-444444444444'

type Row = Record<string, unknown> | null

function row(over: Record<string, unknown> = {}): Row {
  return {
    config: { question_ids: [Q1, Q2] },
    started_at: '2026-10-01T10:00:00.000Z',
    time_limit_seconds: null,
    subject_id: 's1',
    easa_subjects: { name: 'Air Law', short: 'ALW' },
    ...over,
  }
}

function progress(over: Record<string, unknown> = {}) {
  return {
    status: 'open',
    mode: 'quick_quiz',
    current_index: 1,
    pinned_question_ids: [Q2],
    active_device_id: null,
    answers: [
      {
        question_id: Q1,
        answer: { selected_option_id: 'b' },
        time_spent_ms: 1500,
        answered_at: 't',
      },
    ],
    ...over,
  }
}

function setup(opts: { rpc?: unknown; rpcError?: string; row?: Row; rowError?: string }) {
  mockRpc.mockResolvedValue(
    opts.rpcError
      ? { data: null, error: { message: opts.rpcError } }
      : { data: opts.rpc ?? progress(), error: null },
  )
  const eq2 = vi.fn()
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: eq2,
    maybeSingle: vi
      .fn()
      .mockResolvedValue(
        opts.rowError
          ? { data: null, error: { message: opts.rowError } }
          : { data: opts.row === undefined ? row() : opts.row, error: null },
      ),
  }
  eq2.mockReturnValue(chain)
  mockFrom.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockCreateClient.mockResolvedValue({ from: mockFrom })
})

describe('loadQuizSessionState', () => {
  it('issues no query for an id that is not a uuid', async () => {
    const result = await loadQuizSessionState('not-a-uuid', USER)

    expect(result).toEqual({ kind: 'not_found' })
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('reads the session row for this student only', async () => {
    const chain = setup({})

    await loadQuizSessionState(SESSION, USER)

    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_quiz_progress', {
      p_session_id: SESSION,
    })
    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
    expect(chain.eq).toHaveBeenCalledWith('id', SESSION)
    expect(chain.eq).toHaveBeenCalledWith('student_id', USER)
  })

  it('returns an open practice session with its seed and subject', async () => {
    setup({})

    const result = await loadQuizSessionState(SESSION, USER)

    expect(result).toMatchObject({
      kind: 'open',
      sessionId: SESSION,
      mode: 'quick_quiz',
      questionIds: [Q1, Q2],
      subjectName: 'Air Law',
      subjectCode: 'ALW',
      startedAt: '2026-10-01T10:00:00.000Z',
      seed: {
        currentIndex: 1,
        pinnedQuestionIds: [Q2],
        activeMs: 1500,
        answers: { [Q1]: { selectedOptionId: 'b', responseTimeMs: 1500 } },
      },
    })
  })

  it('takes the status from the progress RPC, saved included', async () => {
    setup({ rpc: progress({ status: 'saved' }) })

    expect(await loadQuizSessionState(SESSION, USER)).toMatchObject({ kind: 'saved' })
  })

  it('reports an ended session with its mode so the caller can pick the report', async () => {
    setup({ rpc: progress({ status: 'ended', mode: 'internal_exam' }) })

    expect(await loadQuizSessionState(SESSION, USER)).toEqual({
      kind: 'ended',
      mode: 'internal_exam',
    })
  })

  it('reports a discarded session', async () => {
    setup({ rpc: progress({ status: 'discarded' }) })

    expect(await loadQuizSessionState(SESSION, USER)).toEqual({ kind: 'discarded' })
  })

  it('reports not found when the progress RPC says the session is not the caller own', async () => {
    setup({ rpcError: 'session_not_found', row: null })

    expect(await loadQuizSessionState(SESSION, USER)).toEqual({ kind: 'not_found' })
  })

  it('reports not found for a discovery session', async () => {
    setup({ rpc: progress({ mode: 'discovery' }) })

    expect(await loadQuizSessionState(SESSION, USER)).toEqual({ kind: 'not_found' })
  })

  it('reports not found when the session row is hidden from the student', async () => {
    setup({ row: null })

    expect(await loadQuizSessionState(SESSION, USER)).toEqual({ kind: 'not_found' })
  })

  it('throws on a progress RPC failure other than not found', async () => {
    setup({ rpcError: 'boom' })

    await expect(loadQuizSessionState(SESSION, USER)).rejects.toThrow(/Failed to load/)
  })

  it('throws on a session row query failure', async () => {
    setup({ rowError: 'boom' })

    await expect(loadQuizSessionState(SESSION, USER)).rejects.toThrow(/Failed to load/)
  })

  it('throws when the progress payload has an unknown shape', async () => {
    setup({ rpc: { status: 'open' } })

    await expect(loadQuizSessionState(SESSION, USER)).rejects.toThrow(/Failed to load/)
  })

  it('carries the pass mark and time limit of an exam from its config', async () => {
    setup({
      rpc: progress({ mode: 'mock_exam' }),
      row: row({ config: { question_ids: [Q1, Q2], pass_mark: 80 }, time_limit_seconds: 600 }),
    })

    expect(await loadQuizSessionState(SESSION, USER)).toMatchObject({
      kind: 'open',
      mode: 'mock_exam',
      passMark: 80,
      timeLimitSeconds: 600,
    })
  })

  it('falls back to 75 percent for a VFR RT exam whose config has no pass mark', async () => {
    setup({ rpc: progress({ mode: 'vfr_rt_exam' }) })

    expect(await loadQuizSessionState(SESSION, USER)).toMatchObject({ passMark: 75 })
  })

  it('leaves the pass mark out of a practice session', async () => {
    setup({ row: row({ config: { question_ids: [Q1, Q2], pass_mark: 80 } }) })

    expect(await loadQuizSessionState(SESSION, USER)).not.toHaveProperty('passMark', 80)
  })
})
