import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_hooks/use-navigation-guard', () => ({ useNavigationGuard: vi.fn() }))

import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { _resetConnectionState, adjustPending } from '../_utils/connection-state'
import { useQuizNavigationGuard } from './use-quiz-navigation-guard'

const guard = vi.mocked(useNavigationGuard)

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
})

describe('useQuizNavigationGuard', () => {
  it('does not block when nothing is unsaved or unsent', () => {
    renderHook(() => useQuizNavigationGuard(false, false))
    expect(guard).toHaveBeenLastCalledWith(false)
  })

  it('blocks while the caller has unsaved work', () => {
    renderHook(() => useQuizNavigationGuard(true, false))
    expect(guard).toHaveBeenLastCalledWith(true)
  })

  it('blocks while a progress save is unsent and releases when it lands', () => {
    renderHook(() => useQuizNavigationGuard(false, false))
    act(() => adjustPending(1))
    expect(guard).toHaveBeenLastCalledWith(true)
    act(() => adjustPending(-1))
    expect(guard).toHaveBeenLastCalledWith(false)
  })

  it('does not block after the quiz is submitted even with a save still unsent', () => {
    renderHook(() => useQuizNavigationGuard(true, true))
    act(() => adjustPending(1))
    expect(guard).toHaveBeenLastCalledWith(false)
  })

  it('blocks on an unsent save before the quiz is submitted', () => {
    renderHook(() => useQuizNavigationGuard(false, false))
    act(() => adjustPending(1))
    expect(guard).toHaveBeenLastCalledWith(true)
  })
})
