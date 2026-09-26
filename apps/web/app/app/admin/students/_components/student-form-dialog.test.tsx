import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentRow } from '../types'
import { StudentFormDialog } from './student-form-dialog'

// ---- Mocks ------------------------------------------------------------------

vi.mock('../actions/create-student', () => ({ createStudent: vi.fn() }))
vi.mock('../actions/update-student', () => ({ updateStudent: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// CreatedStudentPanel pulls in useSendLoginInstructions -> sendLoginInstructions ->
// login-instructions-recipient -> the admin (service-role) client, which throws when
// imported in a browser-like (jsdom) environment. This dialog only renders the panel;
// its own send behaviour is covered by created-student-panel.test.tsx.
vi.mock('../_hooks/use-send-login-instructions', () => ({
  useSendLoginInstructions: () => ({ isSending: false, handleSend: vi.fn() }),
}))

import { toast } from 'sonner'
import { createStudent } from '../actions/create-student'
import { updateStudent } from '../actions/update-student'

// ---- Fixtures -----------------------------------------------------------------

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
}

async function fillCreateForm() {
  await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
  await userEvent.type(screen.getByLabelText('Full name'), 'New Student')
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('StudentFormDialog — create', () => {
  it('shows the post-create panel instead of closing when createStudent succeeds', async () => {
    vi.mocked(createStudent).mockResolvedValue({ success: true, id: 'new-student-1' })
    const onOpenChange = vi.fn()

    render(<StudentFormDialog open={true} onOpenChange={onOpenChange} />)
    await fillCreateForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))

    await waitFor(() => {
      expect(screen.getByText('Student created.')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Send login instructions' })).toBeInTheDocument()
    // The dialog stays open — the panel replaces the form, onOpenChange(false) is not called.
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('ignores Escape while the post-create panel shows', async () => {
    vi.mocked(createStudent).mockResolvedValue({ success: true, id: 'new-student-1' })
    const onOpenChange = vi.fn()

    render(<StudentFormDialog open={true} onOpenChange={onOpenChange} />)
    await fillCreateForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))
    await waitFor(() => screen.getByText('Student created.'))

    await userEvent.keyboard('{Escape}')

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByText('Student created.')).toBeInTheDocument()
  })

  it('closes the dialog when Close is clicked on the post-create panel', async () => {
    vi.mocked(createStudent).mockResolvedValue({ success: true, id: 'new-student-1' })
    const onOpenChange = vi.fn()

    render(<StudentFormDialog open={true} onOpenChange={onOpenChange} />)
    await fillCreateForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))
    await waitFor(() => screen.getByText('Student created.'))

    // The dialog's own X is hidden while the panel shows, so only the panel's Close remains.
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows toast.error and stays on the form when createStudent fails', async () => {
    vi.mocked(createStudent).mockResolvedValue({ success: false, error: 'Invalid input' })

    render(<StudentFormDialog open={true} onOpenChange={vi.fn()} />)
    await fillCreateForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid input')
    })
    expect(screen.queryByText('Student created.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Student' })).toBeInTheDocument()
  })

  it('shows a generic error toast when createStudent throws', async () => {
    vi.mocked(createStudent).mockRejectedValue(new Error('network failure'))

    render(<StudentFormDialog open={true} onOpenChange={vi.fn()} />)
    await fillCreateForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Service error. Please try again.')
    })
  })

  it('resets the post-create panel back to the form when reopened', async () => {
    vi.mocked(createStudent).mockResolvedValue({ success: true, id: 'new-student-1' })
    const { rerender } = render(<StudentFormDialog open={true} onOpenChange={vi.fn()} />)
    await fillCreateForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))
    await waitFor(() => screen.getByText('Student created.'))

    rerender(<StudentFormDialog open={false} onOpenChange={vi.fn()} />)
    rerender(<StudentFormDialog open={true} onOpenChange={vi.fn()} />)

    expect(screen.queryByText('Student created.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Student' })).toBeInTheDocument()
  })
})

describe('StudentFormDialog — uncontrolled trigger', () => {
  it('opens again from its trigger after a create is closed', async () => {
    vi.mocked(createStudent).mockResolvedValue({ success: true, id: 'new-student-1' })
    render(<StudentFormDialog trigger={<button type="button">New Student</button>} />)

    await userEvent.click(screen.getByRole('button', { name: 'New Student' }))
    await fillCreateForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create Student' }))
    await waitFor(() => screen.getByText('Student created.'))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText('Student created.')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'New Student' }))

    expect(await screen.findByRole('button', { name: 'Create Student' })).toBeInTheDocument()
  })
})

describe('StudentFormDialog — edit', () => {
  it('shows toast.success and closes the dialog when updateStudent succeeds (no post-create panel)', async () => {
    vi.mocked(updateStudent).mockResolvedValue({ success: true })
    const onOpenChange = vi.fn()

    render(<StudentFormDialog student={STUDENT} open={true} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Student updated')
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByText('Student created.')).not.toBeInTheDocument()
  })

  it('shows toast.error and keeps the dialog open when updateStudent fails', async () => {
    vi.mocked(updateStudent).mockResolvedValue({ success: false, error: 'Invalid input' })
    const onOpenChange = vi.fn()

    render(<StudentFormDialog student={STUDENT} open={true} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid input')
    })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
