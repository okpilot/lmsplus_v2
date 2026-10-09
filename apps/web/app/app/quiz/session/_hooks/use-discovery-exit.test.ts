import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockReplace, mockEndDiscovery } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockEndDiscovery: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('../../actions/end-discovery', () => ({
  endDiscovery: (...args: unknown[]) => mockEndDiscovery(...args),
}))

import { _resetRunnerExit, isRunnerExiting } from '../_utils/runner-exit'
import { NAV_FALLBACK_MS } from './quiz-submit-handlers'

// jsdom's window.location is not fully writable, so replace it with a mockable stub.
// vi.resetAllMocks() does not reach a vi.fn() held only via defineProperty — reset it explicitly.
const mockLocationAssign = vi.fn()
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { assign: mockLocationAssign },
})

// ---- Subject under test ----------------------------------------------------

import { DISCOVERY_EXIT_TIMEOUT_MS, useDiscoveryExit } from './use-discovery-exit'

// ---- Tests -----------------------------------------------------------------

describe('useDiscoveryExit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    _resetRunnerExit()
    mockLocationAssign.mockReset()
    mockEndDiscovery.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not navigate until the discovery teardown settles', async () => {
    // Hold the teardown on a deferred promise so we can observe the gap between
    // "handler started" and "teardown resolved". Invocation order alone would pass
    // even if router.replace fired while endDiscovery was still pending — the §6
    // guarantee is that the nav waits for the Server Action to SETTLE.
    let resolveTeardown!: () => void
    mockEndDiscovery.mockReturnValue(
      new Promise<{ success: true }>((res) => {
        resolveTeardown = () => res({ success: true })
      }),
    )

    const { result } = renderHook(() => useDiscoveryExit())
    const pending = result.current.exit()
    // Let the handler reach its await — the nav must NOT have fired yet.
    await Promise.resolve()
    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()

    resolveTeardown()
    await pending

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('reports leaving as soon as the exit starts, before the teardown resolves', async () => {
    let resolveTeardown!: () => void
    mockEndDiscovery.mockReturnValue(
      new Promise<{ success: true }>((res) => {
        resolveTeardown = () => res({ success: true })
      }),
    )
    const { result } = renderHook(() => useDiscoveryExit())
    expect(result.current.leaving).toBe(false)

    let pending!: Promise<void>
    act(() => {
      pending = result.current.exit()
    })
    expect(result.current.leaving).toBe(true)

    await act(async () => {
      resolveTeardown()
      await pending
    })
  })

  it('navigates back to the quiz picker even when the teardown rejects', async () => {
    mockEndDiscovery.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useDiscoveryExit())
    await result.current.exit()

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('tears down and navigates only once when invoked twice in rapid succession', async () => {
    // A double-click fires the handler twice before the first settles. The
    // synchronous useRef one-shot guard (§6) must make the second call a no-op so
    // endDiscovery and the terminal nav each run exactly once.
    const { result } = renderHook(() => useDiscoveryExit())
    await Promise.all([result.current.exit(), result.current.exit()])

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('releases the leave guards before navigating away', async () => {
    let exitingAtNav: boolean | undefined
    mockReplace.mockImplementation(() => {
      exitingAtNav = isRunnerExiting()
    })
    const { result } = renderHook(() => useDiscoveryExit())
    await result.current.exit()
    expect(exitingAtNav).toBe(true)
  })

  it('leaves for the quiz picker when the discovery teardown stalls', async () => {
    vi.useFakeTimers()
    mockEndDiscovery.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDiscoveryExit())
    void result.current.exit()

    await vi.advanceTimersByTimeAsync(DISCOVERY_EXIT_TIMEOUT_MS - 1)
    expect(mockReplace).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
    expect(isRunnerExiting()).toBe(true)
  })

  it('hard-navigates to the quiz picker when the soft navigation leaves the runner mounted', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDiscoveryExit())
    await act(async () => result.current.exit())
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')

    await vi.advanceTimersByTimeAsync(NAV_FALLBACK_MS - 1)
    expect(mockLocationAssign).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(mockLocationAssign).toHaveBeenCalledWith('/app/quiz')
  })

  it('does not hard-navigate once the runner has left', async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useDiscoveryExit())
    await act(async () => result.current.exit())
    unmount()

    await vi.advanceTimersByTimeAsync(NAV_FALLBACK_MS + 1)
    expect(mockLocationAssign).not.toHaveBeenCalled()
  })
})
