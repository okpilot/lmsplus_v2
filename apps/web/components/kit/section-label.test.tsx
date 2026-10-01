import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SectionLabel } from './section-label'

describe('SectionLabel', () => {
  it('renders a paragraph with its text by default', () => {
    render(<SectionLabel>Topics</SectionLabel>)
    expect(screen.getByText('Topics').tagName).toBe('P')
  })

  it('renders the requested heading element', () => {
    render(<SectionLabel as="h2">Topics</SectionLabel>)
    expect(screen.getByRole('heading', { level: 2, name: 'Topics' })).toBeInTheDocument()
  })

  it('does not use a monospace font', () => {
    render(<SectionLabel>Topics</SectionLabel>)
    expect(screen.getByText('Topics')).not.toHaveClass('font-mono')
  })
})
