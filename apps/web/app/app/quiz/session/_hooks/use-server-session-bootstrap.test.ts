import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoad } = vi.hoisted(() => ({ mockLoad: vi.fn() }))

vi.mock('./session-bootstrap-load', () => ({
  loadSessionData: (...a: unknown[]) => mockLoad(...a),
}))

import { useServerSessionBootstrap } from './use-server-session-bootstrap'

const IDS = ['q1', 'q2']

beforeEach(() => {
  vi.resetAllMocks()
  mockLoad.mockResolvedValue({
    success: true,
    questions: [{ id: 'q1' }],
    flaggedIds: ['q2'],
    claimError: 'mapped',
  })
})

describe('useServerSessionBootstrap', () => {
  it('loads the questions, flags and claim of a practice session', async () => {
    const { result } = renderHook(() =>
      useServerSessionBootstrap({ sessionId: 's1', questionIds: IDS, mode: 'quick_quiz' }),
    )

    await waitFor(() => expect(result.current.questions).toEqual([{ id: 'q1' }]))
    expect(mockLoad).toHaveBeenCalledWith(IDS, {
      sessionId: 's1',
      mode: 'study',
      examMode: undefined,
    })
    expect(result.current.flaggedIds).toEqual(['q2'])
    expect(result.current.claimError).toBe('mapped')
    expect(result.current.error).toBeNull()
  })

  it.each(['mock_exam', 'internal_exam', 'vfr_rt_exam'] as const)(
    'loads a %s session as an exam of its own mode',
    async (mode) => {
      renderHook(() => useServerSessionBootstrap({ sessionId: 's1', questionIds: IDS, mode }))

      await waitFor(() => expect(mockLoad).toHaveBeenCalled())
      expect(mockLoad).toHaveBeenCalledWith(IDS, { sessionId: 's1', mode: 'exam', examMode: mode })
    },
  )

  it('surfaces a load failure instead of the runner', async () => {
    mockLoad.mockResolvedValue({ success: false, error: 'No questions found' })

    const { result } = renderHook(() =>
      useServerSessionBootstrap({ sessionId: 's1', questionIds: IDS, mode: 'quick_quiz' }),
    )

    await waitFor(() => expect(result.current.error).toBe('No questions found'))
    expect(result.current.questions).toBeNull()
  })

  it('surfaces a generic failure when the load rejects', async () => {
    mockLoad.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() =>
      useServerSessionBootstrap({ sessionId: 's1', questionIds: IDS, mode: 'quick_quiz' }),
    )

    await waitFor(() => expect(result.current.error).toMatch(/Failed to load/))
  })

  it('does not reload the session when re-rendered with an equal question list', async () => {
    const { rerender, result } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useServerSessionBootstrap({ sessionId: 's1', questionIds: ids, mode: 'quick_quiz' }),
      { initialProps: { ids: ['q1', 'q2'] } },
    )
    await waitFor(() => expect(result.current.questions).not.toBeNull())

    rerender({ ids: ['q1', 'q2'] })

    expect(mockLoad).toHaveBeenCalledTimes(1)
  })
})
