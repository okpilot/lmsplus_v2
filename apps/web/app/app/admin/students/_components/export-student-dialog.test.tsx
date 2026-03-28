import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockExportStudentData, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockExportStudentData: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('../actions/export-student-data', () => ({
  exportStudentData: mockExportStudentData,
}))
vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError } }))

// jsdom does not implement URL.createObjectURL / URL.revokeObjectURL
vi.stubGlobal('URL', {
  createObjectURL: vi.fn().mockReturnValue('blob:mock'),
  revokeObjectURL: vi.fn(),
})

// ---- Subject under test ---------------------------------------------------

import type { StudentRow } from '../types'
import { ExportStudentDialog } from './export-student-dialog'

// ---- Helpers ---------------------------------------------------------------

const MOCK_STUDENT: StudentRow = {
  id: 'cccccccc-0000-4000-a000-000000000003',
  email: 'jane@example.com',
  full_name: 'Jane Smith',
  role: 'student',
  organization_id: 'org-1',
  last_active_at: null,
  created_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_PAYLOAD = {
  exported_at: '2026-03-27T10:00:00.000Z',
  user: {
    id: MOCK_STUDENT.id,
    email: MOCK_STUDENT.email,
    full_name: MOCK_STUDENT.full_name,
    role: 'student',
    created_at: '2026-01-01T00:00:00Z',
    last_active_at: null,
  },
  quiz_sessions: [],
  quiz_answers: [],
  student_responses: [],
  fsrs_cards: [],
  flagged_questions: [],
  question_comments: [],
  user_consents: [],
  audit_events: [],
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ExportStudentDialog', () => {
  describe('rendering', () => {
    it('renders the dialog title when open', () => {
      render(<ExportStudentDialog student={MOCK_STUDENT} open={true} onOpenChange={vi.fn()} />)
      expect(screen.getByText('Export student data')).toBeInTheDocument()
    })

    it('renders the student name in the description', () => {
      render(<ExportStudentDialog student={MOCK_STUDENT} open={true} onOpenChange={vi.fn()} />)
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument()
    })

    it('falls back to email when full_name is null', () => {
      const studentNoName = { ...MOCK_STUDENT, full_name: null }
      render(<ExportStudentDialog student={studentNoName} open={true} onOpenChange={vi.fn()} />)
      expect(screen.getByText(/jane@example\.com/)).toBeInTheDocument()
    })

    it('renders the Export and Cancel buttons', () => {
      render(<ExportStudentDialog student={MOCK_STUDENT} open={true} onOpenChange={vi.fn()} />)
      expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  describe('happy path', () => {
    it('shows a success toast and closes the dialog when export succeeds', async () => {
      mockExportStudentData.mockResolvedValue({ success: true, data: MOCK_PAYLOAD })
      const mockOnOpenChange = vi.fn()

      const user = userEvent.setup()
      render(
        <ExportStudentDialog student={MOCK_STUDENT} open={true} onOpenChange={mockOnOpenChange} />,
      )

      await user.click(screen.getByRole('button', { name: /^export$/i }))

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('Student data exported')
        expect(mockOnOpenChange).toHaveBeenCalledWith(false)
      })
    })

    it('calls exportStudentData with the student userId', async () => {
      mockExportStudentData.mockResolvedValue({ success: true, data: MOCK_PAYLOAD })

      const user = userEvent.setup()
      render(<ExportStudentDialog student={MOCK_STUDENT} open={true} onOpenChange={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /^export$/i }))

      await waitFor(() => {
        expect(mockExportStudentData).toHaveBeenCalledWith({ userId: MOCK_STUDENT.id })
      })
    })
  })

  describe('error path', () => {
    it('shows an error toast and does not close when export fails', async () => {
      mockExportStudentData.mockResolvedValue({
        success: false,
        error: 'Failed to export student data',
      })
      const mockOnOpenChange = vi.fn()

      const user = userEvent.setup()
      render(
        <ExportStudentDialog student={MOCK_STUDENT} open={true} onOpenChange={mockOnOpenChange} />,
      )

      await user.click(screen.getByRole('button', { name: /^export$/i }))

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to export student data')
      })
      expect(mockOnOpenChange).not.toHaveBeenCalled()
      expect(mockToastSuccess).not.toHaveBeenCalled()
    })
  })

  describe('cancel button', () => {
    it('calls onOpenChange(false) when Cancel is clicked', async () => {
      const mockOnOpenChange = vi.fn()
      const user = userEvent.setup()
      render(
        <ExportStudentDialog student={MOCK_STUDENT} open={true} onOpenChange={mockOnOpenChange} />,
      )

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('null student guard', () => {
    it('does not call exportStudentData when student is null', async () => {
      const user = userEvent.setup()
      render(<ExportStudentDialog student={null} open={true} onOpenChange={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /^export$/i }))

      expect(mockExportStudentData).not.toHaveBeenCalled()
    })
  })

  describe('pending state', () => {
    it('shows Exporting text and disables the export button while the action is in flight', async () => {
      let resolve: (value: unknown) => void = () => {}
      mockExportStudentData.mockReturnValue(
        new Promise((r) => {
          resolve = r
        }),
      )
      const user = userEvent.setup()
      render(<ExportStudentDialog student={MOCK_STUDENT} open={true} onOpenChange={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /^export$/i }))

      expect(screen.getByRole('button', { name: /exporting/i })).toBeDisabled()

      resolve({ success: false, error: 'cancelled' })
    })
  })
})
