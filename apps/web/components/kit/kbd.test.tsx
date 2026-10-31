import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Kbd } from './kbd'

describe('Kbd', () => {
  it('renders a kbd element with a bottom key edge and chip text', () => {
    render(<Kbd>Enter</Kbd>)
    const el = screen.getByText('Enter')
    expect(el.tagName).toBe('KBD')
    for (const c of [
      'rounded-inner',
      'border-b-emphasis',
      'border-border',
      'bg-muted',
      'text-chip',
    ])
      expect(el).toHaveClass(c)
  })
})
