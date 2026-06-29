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

  it('ends the discovery session before navigating back to the quiz picker', async () => {
    const { result } = renderHook(() => useDiscoveryExit())
    await result.current()

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
    // Teardown must settle before the terminal navigation (code-style.md §6).
    expect(mockEndDiscovery.mock.invocationCallOrder[0]!).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0]!,
    )
  })

  it('navigates back to the quiz picker even when the teardown rejects', async () => {
    mockEndDiscovery.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useDiscoveryExit())
    await result.current()

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
  })
})
