import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGuard } = vi.hoisted(() => ({ mockGuard: vi.fn() }))
vi.mock('./use-quiz-navigation-guard', () => ({
  useQuizNavigationGuard: (...a: unknown[]) => mockGuard(...a),
}))

import { useQuizLeaveGuard } from './use-quiz-leave-guard'

type Args = Parameters<typeof useQuizLeaveGuard>[0]

function setup(over: Partial<Args> = {}) {
  const setShowFinishDialog = vi.fn()
  const args: Args = {
    isDiscovery: false,
    sessionId: 'sess-1',
    submitted: { current: false },
    setShowFinishDialog,
    pendingOptionId: null,
    existingAnswer: undefined,
    ...over,
  }
  const hook = renderHook((a: Args) => useQuizLeaveGuard(a), { initialProps: args })
  return { ...hook, setShowFinishDialog, args }
}

const attempt = () => mockGuard.mock.lastCall?.[0].onAttempt()

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useQuizLeaveGuard', () => {
  it('opens the Finish dialog when a study runner is left', () => {
    const { setShowFinishDialog, result } = setup()
    act(() => attempt())
    expect(setShowFinishDialog).toHaveBeenCalledWith(true)
    expect(result.current.discoveryConfirmOpen).toBe(false)
  })

  it('opens the Stay/Leave confirm instead when a discovery runner is left', () => {
    const { setShowFinishDialog, result } = setup({ isDiscovery: true })
    act(() => attempt())
    expect(result.current.discoveryConfirmOpen).toBe(true)
    expect(setShowFinishDialog).not.toHaveBeenCalled()
  })

  it('opens the discovery confirm from the header Exit button', () => {
    const { result } = setup({ isDiscovery: true })
    act(() => result.current.openExitConfirm())
    expect(result.current.discoveryConfirmOpen).toBe(true)
  })

  it('closes the discovery confirm when the student stays', () => {
    const { result } = setup({ isDiscovery: true })
    act(() => result.current.openExitConfirm())
    act(() => result.current.setDiscoveryConfirmOpen(false))
    expect(result.current.discoveryConfirmOpen).toBe(false)
  })

  it('stays armed until the submit has landed', () => {
    const { args } = setup()
    expect(mockGuard).toHaveBeenLastCalledWith(expect.objectContaining({ submitted: false }))
    expect(args.submitted.current).toBe(false)
  })

  it('disarms on the first re-render after the quiz is submitted', () => {
    const submitted = { current: false }
    const { rerender, args } = setup({ submitted })
    submitted.current = true
    rerender({ ...args, submitted })
    expect(mockGuard).toHaveBeenLastCalledWith(expect.objectContaining({ submitted: true }))
  })

  it('flags a picked option that has not been submitted', () => {
    const { result } = setup({ pendingOptionId: 'opt-1' })
    expect(result.current.pendingSelection).toBe(true)
  })

  it('does not flag a pick when nothing is selected', () => {
    const { result } = setup({ pendingOptionId: null })
    expect(result.current.pendingSelection).toBe(false)
  })

  it('does not flag a pick on a question that is already answered', () => {
    const { result } = setup({
      pendingOptionId: 'opt-1',
      existingAnswer: { selectedOptionId: 'a' },
    })
    expect(result.current.pendingSelection).toBe(false)
  })
})
