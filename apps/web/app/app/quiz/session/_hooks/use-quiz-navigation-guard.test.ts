import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_hooks/use-navigation-guard', () => ({ useNavigationGuard: vi.fn() }))
vi.mock('./use-back-guard', () => ({
  useBackGuard: vi.fn(),
  releaseBackGuard: vi.fn(),
}))

import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { _resetConnectionState, setConnectionStatus } from '../_utils/connection-state'
import { useBackGuard } from './use-back-guard'
import { useQuizNavigationGuard } from './use-quiz-navigation-guard'

const beforeUnload = vi.mocked(useNavigationGuard)
const backGuard = vi.mocked(useBackGuard)

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
})

describe('useQuizNavigationGuard', () => {
  it('arms both guards from the start, before any answer exists', () => {
    const onAttempt = vi.fn()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt, key: 'sess-1' }))
    expect(beforeUnload).toHaveBeenLastCalledWith(true)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function), 'sess-1')
  })

  it('disarms both guards once the quiz is submitted', () => {
    renderHook(() => useQuizNavigationGuard({ submitted: true, onAttempt: vi.fn(), key: 'sess-1' }))
    expect(beforeUnload).toHaveBeenLastCalledWith(false)
    expect(backGuard).toHaveBeenLastCalledWith(false, expect.any(Function), 'sess-1')
  })

  it('drops only the refresh prompt once the sign-in expired and keeps Back guarded without a dialog', () => {
    const onAttempt = vi.fn()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt, key: 'sess-1' }))
    act(() => setConnectionStatus('signed-out'))
    expect(beforeUnload).toHaveBeenLastCalledWith(false)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function), 'sess-1')
    backGuard.mock.lastCall?.[1]()
    expect(onAttempt).not.toHaveBeenCalled()
  })

  it('reports a Back attempt while the sign-in is valid', () => {
    const onAttempt = vi.fn()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt, key: 'sess-1' }))
    backGuard.mock.lastCall?.[1]()
    expect(onAttempt).toHaveBeenCalledTimes(1)
  })

  it('keeps both guards armed while offline', () => {
    renderHook(() =>
      useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn(), key: 'sess-1' }),
    )
    act(() => setConnectionStatus('offline'))
    expect(beforeUnload).toHaveBeenLastCalledWith(true)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function), 'sess-1')
  })
})
