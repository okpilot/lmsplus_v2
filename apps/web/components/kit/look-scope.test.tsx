import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LookScope } from './look-scope'

describe('LookScope', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('marks its wrapper with the redesign look attribute when the switch is on', () => {
    vi.stubEnv('NEXT_PUBLIC_REDESIGN_LOOK', 'on')
    render(<LookScope>content</LookScope>)
    expect(screen.getByText('content')).toHaveAttribute('data-look', 'v2')
  })

  it('leaves the redesign look off when the switch is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_REDESIGN_LOOK', undefined)
    render(<LookScope>content</LookScope>)
    expect(screen.getByText('content')).not.toHaveAttribute('data-look')
  })

  it('leaves the redesign look off for any value other than on', () => {
    vi.stubEnv('NEXT_PUBLIC_REDESIGN_LOOK', 'true')
    render(<LookScope>content</LookScope>)
    expect(screen.getByText('content')).not.toHaveAttribute('data-look')
  })

  it('renders its children', () => {
    render(
      <LookScope>
        <span>inside</span>
      </LookScope>,
    )
    expect(screen.getByText('inside')).toBeInTheDocument()
  })

  it('merges a custom className with the base classes', () => {
    render(<LookScope className="min-h-screen">content</LookScope>)
    const el = screen.getByText('content')
    expect(el).toHaveClass('min-h-screen')
    expect(el).toHaveClass('bg-canvas')
  })
})
