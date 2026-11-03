import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InternalExamsFallback } from './internal-exams-fallback'

describe('InternalExamsFallback', () => {
  it('renders placeholder rows with the shared skeleton', () => {
    const { container } = render(<InternalExamsFallback />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4)
    expect(container.querySelector('.animate-pulse:not([data-slot="skeleton"])')).toBeNull()
  })
})
