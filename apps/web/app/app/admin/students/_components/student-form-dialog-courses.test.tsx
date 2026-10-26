import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CourseOption, StudentRow } from '../types'
import { StudentFormDialog } from './student-form-dialog'

vi.mock('../actions/create-student', () => ({ createStudent: vi.fn() }))
vi.mock('../actions/update-student', () => ({ updateStudent: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../_hooks/use-send-login-instructions', () => ({
  useSendLoginInstructions: () => ({ isSending: false, handleSend: vi.fn() }),
}))

import { toast } from 'sonner'
import { createStudent } from '../actions/create-student'
import { updateStudent } from '../actions/update-student'

const PPL = 'c0a5e000-0000-4000-8000-000000000001'
const RT = 'c0a5e000-0000-4000-8000-000000000002'
const ATPL = 'c0a5e000-0000-4000-8000-000000000003'

const COURSES: CourseOption[] = [
  { id: PPL, short: 'PPL', name: 'PPL(A)' },
  { id: RT, short: 'RT', name: 'VFR RT' },
  { id: ATPL, short: 'ATPL', name: 'ATPL(A)' },
]

const STUDENT: StudentRow = {
  id: 'student-1',
  email: 'alice@example.com',
  full_name: 'Alice Example',
  role: 'student',
  organization_id: 'org-1',
  last_active_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  login_instructions_sent_at: null,
  temp_password_expires_at: null,
  course_ids: [PPL, RT],
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('StudentFormDialog — courses', () => {
  it('renders one unchecked checkbox per course on create', () => {
    render(<StudentFormDialog open={true} onOpenChange={vi.fn()} courses={COURSES} />)

    for (const name of ['PPL(A)', 'VFR RT', 'ATPL(A)']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked()
    }
  })

  it('pre-fills the edit dialog with the student active courses', () => {
    render(
      <StudentFormDialog open={true} onOpenChange={vi.fn()} student={STUDENT} courses={COURSES} />,
    )

    expect(screen.getByRole('checkbox', { name: 'PPL(A)' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'VFR RT' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'ATPL(A)' })).not.toBeChecked()
  })

  it('hides the courses group when the role is not student', () => {
    render(
      <StudentFormDialog
        open={true}
        onOpenChange={vi.fn()}
        student={{ ...STUDENT, role: 'instructor', course_ids: [] }}
        courses={COURSES}
      />,
    )

    expect(screen.queryByRole('checkbox', { name: 'PPL(A)' })).not.toBeInTheDocument()
  })

  it('sends the ticked course ids to createStudent', async () => {
    vi.mocked(createStudent).mockResolvedValue({ success: true, id: 'new-1' })
    render(<StudentFormDialog open={true} onOpenChange={vi.fn()} courses={COURSES} />)

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Full name'), 'New Student')
    await userEvent.click(screen.getByRole('checkbox', { name: 'VFR RT' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))

    await waitFor(() => expect(createStudent).toHaveBeenCalled())
    expect(vi.mocked(createStudent).mock.calls[0]?.[0]).toMatchObject({ course_ids: [RT] })
  })

  it('sends the edited course ids to updateStudent', async () => {
    vi.mocked(updateStudent).mockResolvedValue({ success: true })
    render(
      <StudentFormDialog open={true} onOpenChange={vi.fn()} student={STUDENT} courses={COURSES} />,
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'ATPL(A)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(updateStudent).toHaveBeenCalled())
    const sent = vi.mocked(updateStudent).mock.calls[0]?.[0] as { course_ids: string[] }
    expect([...sent.course_ids].sort()).toEqual([PPL, RT, ATPL].sort())
  })

  it('toasts that courses were not saved when createStudent returns coursesSaved:false', async () => {
    vi.mocked(createStudent).mockResolvedValue({ success: true, id: 'new-1', coursesSaved: false })
    render(<StudentFormDialog open={true} onOpenChange={vi.fn()} courses={COURSES} />)

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Full name'), 'New Student')
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Student created, but courses were not saved. Edit the student to set them.',
      ),
    )
  })
})
