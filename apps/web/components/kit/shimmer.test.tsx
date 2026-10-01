import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Shimmer } from './shimmer'

describe('Shimmer', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Shimmer />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('merges a custom className with the base styles', () => {
    const { container } = render(<Shimmer className="h-10 w-full" />)
    const el = container.firstElementChild
    expect(el).toHaveClass('h-10', 'w-full', 'overflow-hidden')
  })
})
