import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { initials, UserChip } from './user-chip'

describe('initials', () => {
  it('uses the first letters of the first two words in upper case', () => {
    expect(initials('ada pilot')).toBe('AP')
    expect(initials('Ada Maria Pilot')).toBe('AM')
  })

  it('uses a single letter for a single word', () => {
    expect(initials('Ada')).toBe('A')
  })

  it('uses the first letter of an email address', () => {
    expect(initials('ada@example.com')).toBe('A')
  })

  it('falls back to a question mark for an empty name', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })
})

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
    const avatar = screen.getByText('AP')
    expect(avatar.className).toContain('bg-muted')
    expect(avatar.className).toContain('text-muted-foreground')
    expect(avatar.className).not.toContain('bg-foreground')
  })

  it('renders the name at caption size', () => {
    render(<UserChip displayName="Ada Pilot" />)
    expect(screen.getByText('Ada Pilot').className).toMatch(
      /(?<![\w-])text-caption-strong(?![\w-])/,
    )
  })
})
