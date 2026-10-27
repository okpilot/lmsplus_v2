import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubjectGridContent } from './subject-grid-content'

vi.mock('@/lib/queries/dashboard', () => ({
  getDashboardData: vi.fn().mockResolvedValue({ subjects: [] }),
}))
vi.mock('@/lib/queries/dashboard-course', () => ({
  getDashboardCourse: vi.fn().mockResolvedValue({ selected: null }),
}))
vi.mock('./subject-grid', () => ({ SubjectGrid: () => <div data-testid="subject-grid" /> }))

describe('SubjectGridContent', () => {
  it('renders Subject Progress as the shared level-2 heading', async () => {
    render(await SubjectGridContent())

    expect(screen.getByRole('heading', { level: 2, name: 'Subject Progress' })).toHaveClass(
      'text-heading',
    )
  })
})
