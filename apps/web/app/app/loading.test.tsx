import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AppLoading from './loading'

describe('AppLoading', () => {
  it('announces loading state to assistive tech', () => {
    const { container } = render(<AppLoading />)
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading')).toHaveClass('sr-only')
  })
})
