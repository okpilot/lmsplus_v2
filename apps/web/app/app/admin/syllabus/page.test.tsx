import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./_components/syllabus-content', () => ({
  SyllabusContent: () => <div />,
}))
vi.mock('./_components/syllabus-content-skeleton', () => ({
  SyllabusContentSkeleton: () => <div />,
}))

import SyllabusPage from './page'

describe('SyllabusPage', () => {
  it('renders the page title as a level-1 heading', () => {
    render(<SyllabusPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Syllabus Manager' })).toHaveClass(
      'text-title',
    )
  })
})
