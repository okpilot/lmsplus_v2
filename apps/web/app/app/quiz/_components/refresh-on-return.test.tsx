import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockUseRefreshOnReturn } = vi.hoisted(() => ({ mockUseRefreshOnReturn: vi.fn() }))

vi.mock('../_hooks/use-refresh-on-return', () => ({
  useRefreshOnReturn: () => mockUseRefreshOnReturn(),
}))

import { RefreshOnReturn } from './refresh-on-return'

describe('RefreshOnReturn', () => {
  it('renders nothing and registers the hook once', () => {
    const { container } = render(<RefreshOnReturn />)
    expect(container).toBeEmptyDOMElement()
    expect(mockUseRefreshOnReturn).toHaveBeenCalledTimes(1)
  })
})
