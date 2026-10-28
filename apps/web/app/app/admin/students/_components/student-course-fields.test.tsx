import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudentCourseFields } from './student-course-fields'

const COURSES = [
  { id: 'c1', short: 'PPL', name: 'PPL Theory' },
  { id: 'c2', short: 'KSA', name: 'KSA Exam' },
]

function renderFields() {
  return render(
    <StudentCourseFields courses={COURSES} value={[]} disabled={false} onChange={vi.fn()} />,
  )
}

describe('StudentCourseFields', () => {
  it('renders the group heading as "Courses (optional)"', () => {
    renderFields()
    expect(screen.getByText('Courses (optional)')).toBeInTheDocument()
  })

  it('keeps the group aria-label "Courses"', () => {
    renderFields()
    expect(screen.getByRole('group', { name: 'Courses' })).toBeInTheDocument()
  })

  it('styles the group heading as a muted field label', () => {
    renderFields()
    const cls = screen.getByText('Courses (optional)').className
    expect(cls).toContain('text-label')
    expect(cls).toContain('text-muted-foreground')
  })

  it('keeps course checkbox labels foreground', () => {
    renderFields()
    expect(screen.getByText('PPL Theory').closest('label')?.className).toContain('text-foreground')
  })
})
