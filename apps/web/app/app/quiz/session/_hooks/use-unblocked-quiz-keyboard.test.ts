import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetConnectionState, setConnectionStatus } from '../_utils/connection-state'
import { useUnblockedQuizKeyboard } from './use-unblocked-quiz-keyboard'

function opts(over: Partial<Parameters<typeof useUnblockedQuizKeyboard>[0]> = {}) {
  return {
    optionIds: ['a', 'b'],
    currentIndex: 0,
    isExam: false,
    onNavigate: vi.fn(),
    onConfirm: vi.fn(),
    onTab: vi.fn(),
    ...over,
  }
}

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
})

describe('useUnblockedQuizKeyboard', () => {
  it('navigates on arrow keys while the connection is fine', () => {
    const o = opts()
    renderHook(() => useUnblockedQuizKeyboard(o))
    press('ArrowRight')
    expect(o.onNavigate).toHaveBeenCalledWith(1)
  })

  it('ignores keys while the connection overlay blocks and resumes after', () => {
    const o = opts()
    renderHook(() => useUnblockedQuizKeyboard(o))
    act(() => setConnectionStatus('offline'))
    press('ArrowRight')
    expect(o.onNavigate).not.toHaveBeenCalled()
    act(() => setConnectionStatus('ok'))
    press('ArrowRight')
    expect(o.onNavigate).toHaveBeenCalledWith(1)
  })

  it('stays disabled when the caller disables it', () => {
    const o = opts({ enabled: false })
    renderHook(() => useUnblockedQuizKeyboard(o))
    press('ArrowRight')
    expect(o.onNavigate).not.toHaveBeenCalled()
  })
})
