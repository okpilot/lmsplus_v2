import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRedirect = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import AppIndexPage from './page'

describe('AppIndexPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sends a visitor at the bare app path to the dashboard', () => {
    AppIndexPage()
    expect(mockRedirect).toHaveBeenCalledWith('/app/dashboard')
  })
})
