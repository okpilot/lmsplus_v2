import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClaim, mockFlagsAction, mockQuestions, mockVfrQuestions } = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockFlagsAction: vi.fn(),
  mockQuestions: vi.fn(),
  mockVfrQuestions: vi.fn(),
}))

vi.mock('../_utils/claim-quiz-device', () => ({
  claimQuizDeviceBounded: (...a: unknown[]) => mockClaim(...a),
}))
vi.mock('../../actions/flag', () => ({ getFlaggedIds: (...a: unknown[]) => mockFlagsAction(...a) }))
vi.mock('@/lib/queries/load-session-questions', () => ({
  loadSessionQuestions: (...a: unknown[]) => mockQuestions(...a),
}))
vi.mock('@/lib/queries/load-vfr-rt-exam-questions', () => ({
  loadVfrRtExamQuestions: (...a: unknown[]) => mockVfrQuestions(...a),
}))

import { useServerSessionBootstrap } from './use-server-session-bootstrap'

type Runner = Parameters<typeof useServerSessionBootstrap>[0]['runner']
const RUNNER = { questions: [{ id: 'q1' }], flaggedIds: ['q2'] } as unknown as Runner
const OPTS = { sessionId: 's1', userId: 'u1', runner: RUNNER }

function seed(userId: string, sessionId: string) {
  localStorage.setItem(
    `quiz-active-session:${userId}`,
    JSON.stringify({
      userId,
      sessionId,
      questionIds: ['q1'],
      answers: {},
      currentIndex: 0,
      savedAt: Date.now(),
    }),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mockClaim.mockResolvedValue(null)
})

describe('useServerSessionBootstrap', () => {
  it('shows no questions until the claim has settled', async () => {
    let settle!: (v: string | null) => void
    mockClaim.mockReturnValue(new Promise((res) => (settle = res)))

    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))
    expect(result.current.questions).toBeNull()

    await act(async () => settle(null))

    expect(result.current.questions).toEqual([{ id: 'q1' }])
  })

  it('serves the server-loaded questions and flags and claims the session once', async () => {
    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    await waitFor(() => expect(result.current.questions).not.toBeNull())
    expect(result.current.flaggedIds).toEqual(['q2'])
    expect(result.current.claimError).toBeNull()
    expect(mockClaim).toHaveBeenCalledTimes(1)
    expect(mockClaim).toHaveBeenCalledWith('s1')
  })

  it('reads no questions or flags from the server after mount', async () => {
    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    await waitFor(() => expect(result.current.questions).not.toBeNull())
    expect(mockFlagsAction).not.toHaveBeenCalled()
    expect(mockQuestions).not.toHaveBeenCalled()
    expect(mockVfrQuestions).not.toHaveBeenCalled()
  })

  it('surfaces the claim error alongside the questions', async () => {
    mockClaim.mockResolvedValue('Another tab')

    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    await waitFor(() => expect(result.current.claimError).toBe('Another tab'))
    expect(result.current.questions).not.toBeNull()
  })

  it('does not claim again when re-rendered with a fresh load', async () => {
    const next = { questions: [{ id: 'reshuffled' }], flaggedIds: [] } as unknown as Runner
    const { rerender, result } = renderHook(
      ({ runner }: { runner: Runner }) => useServerSessionBootstrap({ ...OPTS, runner }),
      { initialProps: { runner: RUNNER } },
    )
    await waitFor(() => expect(result.current.questions).not.toBeNull())

    rerender({ runner: next })

    expect(mockClaim).toHaveBeenCalledTimes(1)
  })

  it("drops the student's local copy of another session once the claim settles", async () => {
    seed('u1', 'old')
    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    await waitFor(() => expect(result.current.questions).not.toBeNull())
    expect(localStorage.getItem('quiz-active-session:u1')).toBeNull()
  })

  it("keeps the student's local copy of the session being opened", async () => {
    seed('u1', 's1')
    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    await waitFor(() => expect(result.current.questions).not.toBeNull())
    expect(localStorage.getItem('quiz-active-session:u1')).not.toBeNull()
  })

  it("keeps other students' local copies in a shared browser", async () => {
    seed('u2', 'their-session')
    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    await waitFor(() => expect(result.current.questions).not.toBeNull())
    expect(localStorage.getItem('quiz-active-session:u2')).not.toBeNull()
  })

  it('keeps the local copy when the hook unmounts before the claim settles', async () => {
    let settle!: (v: string | null) => void
    mockClaim.mockReturnValue(new Promise((res) => (settle = res)))
    seed('u1', 'old')
    const { unmount } = renderHook(() => useServerSessionBootstrap(OPTS))
    unmount()

    await act(async () => settle(null))

    expect(localStorage.getItem('quiz-active-session:u1')).not.toBeNull()
  })
})
