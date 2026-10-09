import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_hooks/use-navigation-guard', () => ({ useNavigationGuard: vi.fn() }))
vi.mock('./use-back-guard', () => ({ useBackGuard: vi.fn() }))

import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { _resetConnectionState, setConnectionStatus } from '../_utils/connection-state'
import { _resetRunnerExit, markRunnerExiting } from '../_utils/runner-exit'
import { useBackGuard } from './use-back-guard'
import { useQuizNavigationGuard } from './use-quiz-navigation-guard'

const beforeUnload = vi.mocked(useNavigationGuard)
const backGuard = vi.mocked(useBackGuard)

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
  _resetRunnerExit()
})

describe('useQuizNavigationGuard', () => {
  it('arms both guards from the start, before any answer exists', () => {
    const onAttempt = vi.fn()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt }))
    expect(beforeUnload).toHaveBeenLastCalledWith(true)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function))
  })

  it('disarms both guards once the quiz is submitted', () => {
    renderHook(() => useQuizNavigationGuard({ submitted: true, onAttempt: vi.fn() }))
    expect(beforeUnload).toHaveBeenLastCalledWith(false)
    expect(backGuard).toHaveBeenLastCalledWith(false, expect.any(Function))
  })

  it('drops only the refresh prompt once the sign-in expired and keeps Back guarded without a dialog', () => {
    const onAttempt = vi.fn()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt }))
    act(() => setConnectionStatus('signed-out'))
    expect(beforeUnload).toHaveBeenLastCalledWith(false)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function))
    backGuard.mock.lastCall?.[1]()
    expect(onAttempt).not.toHaveBeenCalled()
  })

  it('reports a Back attempt while the sign-in is valid', () => {
    const onAttempt = vi.fn()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt }))
    backGuard.mock.lastCall?.[1]()
    expect(onAttempt).toHaveBeenCalledTimes(1)
  })

  it.each(['offline', 'slow', 'save-failed'] as const)(
    'opens no dialog on Back while the connection is %s but keeps Back guarded',
    (status) => {
      const onAttempt = vi.fn()
      renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt }))
      act(() => setConnectionStatus(status))
      expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function))
      backGuard.mock.lastCall?.[1]()
      expect(onAttempt).not.toHaveBeenCalled()
    },
  )

  it('reports a Back attempt while the connection just recovered', () => {
    const onAttempt = vi.fn()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt }))
    act(() => setConnectionStatus('saved'))
    backGuard.mock.lastCall?.[1]()
    expect(onAttempt).toHaveBeenCalledTimes(1)
  })

  it('keeps both guards armed while offline', () => {
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn() }))
    act(() => setConnectionStatus('offline'))
    expect(beforeUnload).toHaveBeenLastCalledWith(true)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function))
  })

  it('releases both guards once a confirmed exit begins', () => {
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn() }))
    act(() => markRunnerExiting())
    expect(beforeUnload).toHaveBeenLastCalledWith(false)
    expect(backGuard).toHaveBeenLastCalledWith(false, expect.any(Function))
  })

  it('arms both guards again for the next runner after the previous one unmounts', () => {
    const first = renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn() }))
    act(() => markRunnerExiting())
    first.unmount()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn() }))
    expect(beforeUnload).toHaveBeenLastCalledWith(true)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function))
  })

  it('arms both guards for a new runner when an unmounted runner marked its exit late', () => {
    const first = renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn() }))
    first.unmount()
    markRunnerExiting()
    renderHook(() => useQuizNavigationGuard({ submitted: false, onAttempt: vi.fn() }))
    expect(beforeUnload).toHaveBeenLastCalledWith(true)
    expect(backGuard).toHaveBeenLastCalledWith(true, expect.any(Function))
  })
})
