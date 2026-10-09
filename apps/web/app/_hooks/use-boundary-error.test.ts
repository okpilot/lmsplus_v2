import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBoundaryError } from './use-boundary-error'

const { mockCapture, mockIsStale, mockReload } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockIsStale: vi.fn(),
  mockReload: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: mockCapture }))
vi.mock('@/lib/stale-deployment', () => ({
  isStaleDeploymentError: mockIsStale,
  reloadOnceForStaleDeployment: mockReload,
}))

describe('useBoundaryError', () => {
  const error = new Error('x')

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reports a regular error to Sentry', () => {
    mockIsStale.mockReturnValue(false)
    renderHook(() => useBoundaryError(error))
    expect(mockCapture).toHaveBeenCalledWith(error)
    expect(mockReload).not.toHaveBeenCalled()
  })

  it('reloads instead of reporting a stale-deployment error', () => {
    mockIsStale.mockReturnValue(true)
    mockReload.mockReturnValue(true)
    renderHook(() => useBoundaryError(error))
    expect(mockReload).toHaveBeenCalledOnce()
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('reports a stale-deployment error when the reload is refused', () => {
    mockIsStale.mockReturnValue(true)
    mockReload.mockReturnValue(false)
    renderHook(() => useBoundaryError(error))
    expect(mockCapture).toHaveBeenCalledWith(error)
  })
})
