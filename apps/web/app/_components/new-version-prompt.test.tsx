import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewVersionPrompt } from './new-version-prompt'

const { mockCheck, mockReload } = vi.hoisted(() => ({ mockCheck: vi.fn(), mockReload: vi.fn() }))

vi.mock('../_hooks/use-new-version-check', () => ({ useNewVersionCheck: mockCheck }))
vi.mock('../_hooks/use-stale-chunk-reload', () => ({ useStaleChunkReload: mockReload }))

describe('NewVersionPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('starts the version check and the stale chunk reload', () => {
    render(<NewVersionPrompt />)
    expect(mockCheck).toHaveBeenCalledOnce()
    expect(mockReload).toHaveBeenCalledOnce()
  })

  it('renders nothing', () => {
    const { container } = render(<NewVersionPrompt />)
    expect(container).toBeEmptyDOMElement()
  })
})
