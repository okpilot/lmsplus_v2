import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClaim } = vi.hoisted(() => ({ mockClaim: vi.fn() }))

vi.mock('../_utils/claim-quiz-device', () => ({
  claimQuizDeviceBounded: (...a: unknown[]) => mockClaim(...a),
}))

import { useServerSessionBootstrap } from './use-server-session-bootstrap'

const OPTS = { sessionId: 's1', userId: 'u1' }

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
  it('claims the session on mount, before the claim has settled', () => {
    mockClaim.mockReturnValue(new Promise(() => undefined))

    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    expect(mockClaim).toHaveBeenCalledWith('s1')
    expect(result.current.claimError).toBeNull()
  })

  it('claims the session once', async () => {
    renderHook(() => useServerSessionBootstrap(OPTS))

    await waitFor(() => expect(mockClaim).toHaveBeenCalledTimes(1))
  })

  it('surfaces the claim error once it lands', async () => {
    mockClaim.mockResolvedValue('Another tab')

    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    await waitFor(() => expect(result.current.claimError).toBe('Another tab'))
  })

  it('does not claim again when re-rendered', async () => {
    const { rerender } = renderHook(() => useServerSessionBootstrap(OPTS))
    await waitFor(() => expect(mockClaim).toHaveBeenCalledTimes(1))

    rerender()

    expect(mockClaim).toHaveBeenCalledTimes(1)
  })

  it("keeps the student's local copy of the session being opened", async () => {
    seed('u1', 's1')
    const { result } = renderHook(() => useServerSessionBootstrap(OPTS))

    await act(async () => undefined)

    expect(result.current.claimError).toBeNull()
    expect(localStorage.getItem('quiz-active-session:u1')).not.toBeNull()
  })

  it("keeps other students' local copies in a shared browser", async () => {
    seed('u2', 'their-session')
    renderHook(() => useServerSessionBootstrap(OPTS))

    await act(async () => undefined)

    expect(localStorage.getItem('quiz-active-session:u2')).not.toBeNull()
  })

  it("drops another session's local copy at mount, while the claim is still pending", () => {
    mockClaim.mockReturnValue(new Promise(() => undefined))
    seed('u1', 'old')

    renderHook(() => useServerSessionBootstrap(OPTS))

    expect(localStorage.getItem('quiz-active-session:u1')).toBeNull()
  })

  it('drops the stale local copy even when the hook unmounts before the claim settles', async () => {
    let settle!: (v: string | null) => void
    mockClaim.mockReturnValue(new Promise((res) => (settle = res)))
    seed('u1', 'old')
    const { unmount } = renderHook(() => useServerSessionBootstrap(OPTS))
    unmount()

    await act(async () => settle(null))

    expect(localStorage.getItem('quiz-active-session:u1')).toBeNull()
  })

  it('leaves the local copy of the opened session unchanged while the claim is pending', () => {
    mockClaim.mockReturnValue(new Promise(() => undefined))
    seed('u1', 's1')
    const before = localStorage.getItem('quiz-active-session:u1')

    renderHook(() => useServerSessionBootstrap(OPTS))

    expect(localStorage.getItem('quiz-active-session:u1')).toBe(before)
  })
})
