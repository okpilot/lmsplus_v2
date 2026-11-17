import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SubjectCode } from './subject-code'

describe('SubjectCode', () => {
  it('renders a muted tabular span', () => {
    render(<SubjectCode>AGK</SubjectCode>)
    const el = screen.getByText('AGK')
    expect(el.tagName).toBe('SPAN')
    expect(el).toHaveClass('text-muted-foreground', 'tabular-nums')
  })

  it('merges className', () => {
    render(<SubjectCode className="shrink-0">AGK</SubjectCode>)
    expect(screen.getByText('AGK')).toHaveClass('shrink-0', 'tabular-nums')
  })
})
