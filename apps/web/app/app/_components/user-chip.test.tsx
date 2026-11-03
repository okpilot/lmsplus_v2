import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserChip } from './user-chip'

describe('UserChip', () => {
  it('shows the display name and its initials', () => {
    render(<UserChip displayName="Ada Pilot" />)
    expect(screen.getByText('Ada Pilot')).toBeInTheDocument()
    expect(screen.getByText('AP')).toBeInTheDocument()
  })

  it('shows a loading placeholder with an empty avatar when the name is not known yet', () => {
    const { container } = render(<UserChip displayName={null} />)
    expect(screen.getByText('Loading account')).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"]')).toBeEmptyDOMElement()
  })

  it('renders a grey avatar', () => {
    render(<UserChip displayName="Ada Pilot" />)
    const avatar =
      screen.getByText('AP').closest<HTMLElement>('[data-slot="avatar"]') ??
      document.createElement('i')
    expect(avatar.dataset.slot).toBe('avatar')
    expect(avatar.className).toContain('bg-muted')
    expect(avatar.className).toContain('text-muted-foreground')
    expect(avatar.className).not.toContain('bg-foreground')
  })

  it('renders a 28px avatar hidden from assistive tech', () => {
    render(<UserChip displayName="Ada Pilot" />)
    const avatar =
      screen.getByText('AP').closest<HTMLElement>('[data-slot="avatar"]') ??
      document.createElement('i')
    expect(avatar.dataset.slot).toBe('avatar')
    expect(avatar.className.split(/\s+/)).toContain('size-avatar')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders the name at caption size', () => {
    render(<UserChip displayName="Ada Pilot" />)
    expect(screen.getByText('Ada Pilot').className).toMatch(
      /(?<![\w-])text-caption-strong(?![\w-])/,
    )
  })
})
