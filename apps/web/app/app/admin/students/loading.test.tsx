import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StudentsLoading from './loading'

describe('Students loading', () => {
  it('renders the header placeholders with the shared skeleton', () => {
    const { container } = render(<StudentsLoading />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
    expect(container.querySelector('.animate-pulse:not([data-slot="skeleton"])')).toBeNull()
  })
})
