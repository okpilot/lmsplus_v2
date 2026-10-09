import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewVersionPrompt } from './new-version-prompt'

const { mockCheck, mockStale } = vi.hoisted(() => ({ mockCheck: vi.fn(), mockStale: vi.fn() }))

vi.mock('../_hooks/use-new-version-check', () => ({ useNewVersionCheck: mockCheck }))
vi.mock('../_hooks/use-stale-chunk-reload', () => ({ useStaleChunkReload: mockStale }))

function state(prompt: 'none' | 'dialog' | 'banner') {
  mockCheck.mockReturnValue({ prompt, reload: vi.fn(), later: vi.fn() })
}

describe('NewVersionPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state('none')
  })

  it('starts the version check and the stale chunk reload', () => {
    render(<NewVersionPrompt />)
    expect(mockCheck).toHaveBeenCalledOnce()
    expect(mockStale).toHaveBeenCalledOnce()
  })

  it('renders nothing when there is no new version', () => {
    const { container } = render(<NewVersionPrompt />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows the dialog and no banner at the dialog stage', () => {
    state('dialog')
    render(<NewVersionPrompt />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the banner and no dialog at the banner stage', () => {
    state('banner')
    render(<NewVersionPrompt />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
