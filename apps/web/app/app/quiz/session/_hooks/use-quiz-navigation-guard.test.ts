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
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt }))
    expect(beforeUnload).toHaveBeenLastCalledWith(true)
    expect(backGuard).toHaveBeenLastCalledWith(true, onAttempt)
  })

  it('disarms both guards once the quiz is submitted', () => {
    renderHook(() => useQuizNavigationGuard({ submitted: true, onAttempt: vi.fn() }))
    expect(beforeUnload).toHaveBeenLastCalledWith(false)
    expect(backGuard).toHaveBeenLastCalledWith(false, expect.any(Function))
  })

  it('disarms both guards once the sign-in expired', () => {
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn() }))
    act(() => setConnectionStatus('signed-out'))
    expect(beforeUnload).toHaveBeenLastCalledWith(false)
    expect(backGuard).toHaveBeenLastCalledWith(false, expect.any(Function))
  })

  it('keeps both guards armed while offline', () => {
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn() }))
    act(() => setConnectionStatus('offline'))
    expect(beforeUnload).toHaveBeenLastCalledWith(true)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function))
  })
})
