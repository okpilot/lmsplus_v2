import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// ---- Subject under test ----------------------------------------------------

import { useDiscoveryExit } from './use-discovery-exit'

// ---- Tests -----------------------------------------------------------------

describe('useDiscoveryExit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockEndDiscovery.mockResolvedValue({ success: true })
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
    const pending = result.current()
    // Let the handler reach its await — the nav must NOT have fired yet.
    await Promise.resolve()
    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()

    resolveTeardown()
    await pending

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('navigates back to the quiz picker even when the teardown rejects', async () => {
    mockEndDiscovery.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useDiscoveryExit())
    await result.current()

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('tears down and navigates only once when invoked twice in rapid succession', async () => {
    // A double-click fires the handler twice before the first settles. The
    // synchronous useRef one-shot guard (§6) must make the second call a no-op so
    // endDiscovery and the terminal nav each run exactly once.
    const { result } = renderHook(() => useDiscoveryExit())
    await Promise.all([result.current(), result.current()])

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
  })
})
