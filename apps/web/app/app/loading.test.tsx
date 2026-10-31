import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AppLoading from './loading'

describe('AppLoading', () => {
  it('announces loading state to assistive tech', () => {
    const { container } = render(<AppLoading />)
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading')).toHaveClass('sr-only')
  })

  it('renders skeleton placeholders for the page layout', () => {
    const { container } = render(<AppLoading />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('holds the skeleton back briefly so quick loads do not flash', () => {
    const { container } = render(<AppLoading />)
    const cls = container.firstElementChild?.className ?? ''
    expect(cls).toContain('opacity-0')
    expect(cls).toContain('var(--transition-duration-base)')
    expect(cls).toContain('var(--ease-enter)')
    expect(cls).toContain('400ms')
    expect(cls).not.toContain('200ms_ease-out')
  })
})
