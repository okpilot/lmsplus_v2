import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Wordmark } from './wordmark'

describe('Wordmark', () => {
  it('links home to the dashboard', () => {
    render(<Wordmark />)
    expect(screen.getByRole('link', { name: 'lmsplus home' })).toHaveAttribute(
      'href',
      '/app/dashboard',
    )
  })

  it('shows the lmsplus text', () => {
    render(<Wordmark />)
    expect(screen.getByRole('link')).toHaveTextContent('lmsplus')
  })
})
