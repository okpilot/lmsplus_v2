import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('thinking-orbs', () => ({
  ThinkingOrb: (props: { size?: number; paused?: boolean; state?: string }) => (
    <span
      data-testid="orb"
      data-size={props.size}
      data-paused={String(props.paused)}
      data-state={props.state}
    />
  ),
}))

import { OrbLoader } from './orb-loader'

function mockMotionPreference(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('OrbLoader', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockMotionPreference(false)
  })

  it('announces the label as a status', () => {
    render(<OrbLoader label="Saving" />)
    expect(screen.getByRole('status', { name: 'Saving' })).toBeInTheDocument()
  })

  it('animates the orb when motion is allowed', () => {
    render(<OrbLoader label="Saving" />)
    expect(screen.getByTestId('orb')).toHaveAttribute('data-paused', 'false')
  })

  it('pauses the orb when reduced motion is requested', () => {
    mockMotionPreference(true)
    render(<OrbLoader label="Saving" />)
    expect(screen.getByTestId('orb')).toHaveAttribute('data-paused', 'true')
  })

  it('renders the chosen size', () => {
    render(<OrbLoader label="Saving" size={64} />)
    expect(screen.getByTestId('orb')).toHaveAttribute('data-size', '64')
  })
})
