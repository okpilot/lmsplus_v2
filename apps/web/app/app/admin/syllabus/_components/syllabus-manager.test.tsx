import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../actions/upsert-subject', () => ({ upsertSubject: vi.fn() }))
vi.mock('./inline-form', () => ({ InlineForm: () => <div /> }))
vi.mock('./subject-row', () => ({ SubjectRow: () => <div /> }))

import { SyllabusManager } from './syllabus-manager'

describe('SyllabusManager', () => {
  it('shows the empty state in the shared empty part when there are no subjects', () => {
    const { container } = render(<SyllabusManager initialTree={[]} />)
    expect(container.querySelector('[data-slot="empty"]')).toHaveTextContent(
      'No subjects yet. Add your first subject below.',
    )
  })

  it('renders the add-subject title as a level-3 heading', () => {
    render(<SyllabusManager initialTree={[]} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Add Subject' })).toHaveClass(
      'text-label-strong',
    )
  })
})
