import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockDelete, mockCookies } = vi.hoisted(() => {
  const mockDelete = vi.fn()
  const mockCookies = vi.fn()
  return { mockDelete, mockCookies }
})

vi.mock('next/headers', () => ({ cookies: mockCookies }))

// ---- Subject under test ----------------------------------------------------

import { clearDeploymentPin } from './clear-deployment-pin'

// ---- Tests -----------------------------------------------------------------

describe('clearDeploymentPin', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCookies.mockResolvedValue({ delete: mockDelete })
  })

  it('deletes the __vdpl cookie', async () => {
    await clearDeploymentPin()
    expect(mockDelete).toHaveBeenCalledOnce()
    expect(mockDelete).toHaveBeenCalledWith('__vdpl')
  })
})
