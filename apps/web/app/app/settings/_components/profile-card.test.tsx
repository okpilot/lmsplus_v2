import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileCard } from './profile-card'

describe('ProfileCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  const defaultProps = {
    email: 'student@example.com',
    organizationName: 'PPL Academy',
    memberSince: '2024-01-15T00:00:00.000Z',
    stats: {
      totalSessions: 42,
      averageScore: 78,
      totalAnswered: 630,
    },
  }

  it('renders the email address', () => {
    render(<ProfileCard {...defaultProps} />)
    expect(screen.getByText('student@example.com')).toBeInTheDocument()
  })

  it('renders the organisation name when provided', () => {
    render(<ProfileCard {...defaultProps} />)
    expect(screen.getByText('PPL Academy')).toBeInTheDocument()
  })

  it('does not render the organisation row when organizationName is null', () => {
    render(<ProfileCard {...defaultProps} organizationName={null} />)
    expect(screen.queryByText('Organisation')).not.toBeInTheDocument()
  })

  it('renders total sessions stat', () => {
    render(<ProfileCard {...defaultProps} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders average score with percent sign', () => {
    render(<ProfileCard {...defaultProps} />)
    expect(screen.getByText('78%')).toBeInTheDocument()
  })

  it('renders total answered stat', () => {
    render(<ProfileCard {...defaultProps} />)
    expect(screen.getByText('630')).toBeInTheDocument()
  })

  it('renders the member since date in readable format', () => {
    render(<ProfileCard {...defaultProps} />)
    // Date formatted as "15 January 2024" via en-GB locale
    expect(screen.getByText('15 January 2024')).toBeInTheDocument()
  })
})
