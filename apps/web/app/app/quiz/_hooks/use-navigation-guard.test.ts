import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavigationGuard } from './use-navigation-guard'

describe('useNavigationGuard', () => {
  const originalAdd = window.addEventListener
  const originalRemove = window.removeEventListener
  let addMock: ReturnType<typeof vi.fn>
  let removeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addMock = vi.fn()
    removeMock = vi.fn()
    window.addEventListener = addMock as unknown as typeof window.addEventListener
    window.removeEventListener = removeMock as unknown as typeof window.removeEventListener
  })

  afterEach(() => {
    window.addEventListener = originalAdd
    window.removeEventListener = originalRemove
  })

  it('attaches beforeunload handler when shouldBlock is true', () => {
    renderHook(() => useNavigationGuard(true))
    expect(addMock).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('does not attach handler when shouldBlock is false', () => {
    renderHook(() => useNavigationGuard(false))
    expect(addMock).not.toHaveBeenCalled()
  })

  it('removes handler on unmount', () => {
    const { unmount } = renderHook(() => useNavigationGuard(true))
    unmount()
    expect(removeMock).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('handler calls preventDefault and sets e.returnValue to empty string', () => {
    // Capture the handler passed to addEventListener
    let capturedHandler: ((e: BeforeUnloadEvent) => void) | undefined
    addMock.mockImplementation((_type: string, handler: (e: BeforeUnloadEvent) => void) => {
      capturedHandler = handler
    })

    renderHook(() => useNavigationGuard(true))

    expect(capturedHandler).toBeDefined()
    const fakeEvent = {
      preventDefault: vi.fn(),
      returnValue: '',
    } as unknown as BeforeUnloadEvent
    capturedHandler?.(fakeEvent)

    expect(fakeEvent.preventDefault).toHaveBeenCalled()
    expect(fakeEvent.returnValue).toBe('')
  })
})
