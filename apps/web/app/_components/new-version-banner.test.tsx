import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewVersionBanner } from './new-version-banner'

const onReload = vi.fn()

describe('NewVersionBanner', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('announces that a new version is available', () => {
    render(<NewVersionBanner onReload={onReload} />)
    expect(screen.getByRole('status')).toHaveTextContent('A new version is available.')
  })

  it('reloads when Reload is clicked', async () => {
    render(<NewVersionBanner onReload={onReload} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledOnce()
  })

  it('offers no way to dismiss it', () => {
    render(<NewVersionBanner onReload={onReload} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('publishes its height so toasts can sit above it', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ height: 54 } as DOMRect)
    render(<NewVersionBanner onReload={onReload} />)
    expect(document.documentElement.style.getPropertyValue('--reload-banner-h')).toBe('54px')
  })
})

describe('NewVersionBanner floating surface', () => {
  it('floats with a ring and shadow and no border', () => {
    render(<NewVersionBanner onReload={onReload} />)
    const el = screen.getByRole('status')
    expect(el).toHaveClass('ring-1', 'shadow-lg')
    expect(el.className).not.toMatch(/(^|\s)border(\s|$)/)
  })
})
