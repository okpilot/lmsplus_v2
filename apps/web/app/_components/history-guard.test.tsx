import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockInstall } = vi.hoisted(() => ({ mockInstall: vi.fn() }))
vi.mock('@/lib/history-guard', () => ({ installHistoryGuard: mockInstall }))

import { HistoryGuard } from './history-guard'

describe('HistoryGuard', () => {
  it('installs the history interceptor on mount and renders nothing', () => {
    const { container } = render(<HistoryGuard />)
    expect(mockInstall).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })
})
