import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Loading from './loading'

describe('ExamConfig loading', () => {
  it('renders the header and card placeholders with the shared skeleton', () => {
    const { container } = render(<Loading />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(11)
    expect(container.querySelector('.animate-pulse:not([data-slot="skeleton"])')).toBeNull()
  })
})
