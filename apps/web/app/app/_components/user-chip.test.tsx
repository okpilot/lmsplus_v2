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
})
