import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Wordmark, WordmarkText } from './wordmark'

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

describe('WordmarkText', () => {
  it('shows the lmsplus text without a link', () => {
    const { container } = render(<WordmarkText />)
    expect(container).toHaveTextContent('lmsplus')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('applies a caller size over the default size', () => {
    const { container } = render(<WordmarkText className="text-[28px]" />)
    const mark = container.firstElementChild
    expect(mark?.className).toContain('text-[28px]')
    expect(mark?.className).not.toContain('text-[18px]')
  })
})
