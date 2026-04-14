import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUseExamStart } = vi.hoisted(() => ({
  mockUseExamStart: vi.fn(),
}))

vi.mock('../_hooks/use-exam-start', () => ({
  useExamStart: () => mockUseExamStart(),
}))

// The SubjectSelect mock always calls onValueChange with 'sub-1'.
// Fixtures must use 'sub-1' as the subject id to trigger the selected state.
vi.mock('./subject-select', () => ({
  SubjectSelect: ({
    value,
    onValueChange,
  }: {
    value: string
    onValueChange: (v: string) => void
  }) => (
    <button
      type="button"
      data-testid="subject-select"
      data-value={value}
      onClick={() => onValueChange('sub-1')}
    >
      SubjectSelect
    </button>
  ),
}))

// ---- Subject under test ---------------------------------------------------

import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import { ExamConfigForm } from './exam-config-form'

// ---- Fixtures -------------------------------------------------------------

// All subjects use id='sub-1' so the mock's hardcoded onValueChange('sub-1') matches.
const SUBJECT_MINUTES: ExamSubjectOption = {
  id: 'sub-1',
  code: '050',
  name: 'Meteorology',
  short: 'MET',
  totalQuestions: 20,
  timeLimitSeconds: 3000, // 50 min
  passMark: 75,
}

const SUBJECT_HOURS_ONLY: ExamSubjectOption = {
  ...SUBJECT_MINUTES,
  timeLimitSeconds: 3600, // 1h exactly (no leftover minutes)
}

const SUBJECT_HOURS_AND_MINUTES: ExamSubjectOption = {
  ...SUBJECT_MINUTES,
  timeLimitSeconds: 5400, // 1h 30min
}

function buildDefaultHook(
  overrides: { loading?: boolean; error?: string | null; handleStart?: () => void } = {},
) {
  return {
    loading: false,
    error: null,
    handleStart: vi.fn(),
    ...overrides,
  }
}

// ---- Tests ----------------------------------------------------------------

describe('ExamConfigForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseExamStart.mockReturnValue(buildDefaultHook())
  })

  describe('initial state (no subject selected)', () => {
    it('renders the subject select', () => {
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      expect(screen.getByTestId('subject-select')).toBeInTheDocument()
    })

    it('disables the Start Exam button when no subject is selected', () => {
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      expect(screen.getByRole('button', { name: 'Start Exam' })).toBeDisabled()
    })

    it('hides exam parameters before a subject is selected', () => {
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      expect(screen.queryByText('Exam Parameters')).not.toBeInTheDocument()
    })
  })

  describe('subject selected', () => {
    it('shows exam parameters card after selecting a subject', async () => {
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(screen.getByText('Exam Parameters')).toBeInTheDocument()
    })

    it('displays the correct question count', async () => {
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(screen.getByText('20')).toBeInTheDocument()
      expect(screen.getByText('Questions')).toBeInTheDocument()
    })

    it('displays the pass mark percentage', async () => {
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(screen.getByText('75%')).toBeInTheDocument()
      expect(screen.getByText('Pass Mark')).toBeInTheDocument()
    })

    it('enables the Start Exam button when a subject is selected and not loading', async () => {
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(screen.getByRole('button', { name: 'Start Exam' })).not.toBeDisabled()
    })
  })

  describe('formatTime display', () => {
    it('shows minutes-only format for time under one hour', async () => {
      // timeLimitSeconds: 3000 → 50 min
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(screen.getByText('50 min')).toBeInTheDocument()
    })

    it('shows hours-only format when time is exactly on the hour', async () => {
      // timeLimitSeconds: 3600 → 1h (no minutes remainder)
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_HOURS_ONLY]} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(screen.getByText('1h')).toBeInTheDocument()
    })

    it('shows hours and minutes format when both are non-zero', async () => {
      // timeLimitSeconds: 5400 → 1h 30min
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_HOURS_AND_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(screen.getByText('1h 30min')).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows "Starting..." text and disables the button while loading', async () => {
      mockUseExamStart.mockReturnValue(buildDefaultHook({ loading: true }))
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      const btn = screen.getByRole('button', { name: 'Starting...' })
      expect(btn).toBeDisabled()
    })
  })

  describe('error state', () => {
    it('shows the error message when useExamStart returns an error', async () => {
      mockUseExamStart.mockReturnValue(buildDefaultHook({ error: 'Failed to start exam' }))
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(screen.getByText('Failed to start exam')).toBeInTheDocument()
    })

    it('does not show error text when error is null', () => {
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      expect(screen.queryByText('Failed to start exam')).not.toBeInTheDocument()
    })
  })

  describe('handleStart', () => {
    it('calls handleStart when Start Exam button is clicked', async () => {
      const handleStart = vi.fn()
      mockUseExamStart.mockReturnValue(buildDefaultHook({ handleStart }))
      const user = userEvent.setup()
      render(<ExamConfigForm userId="u-1" examSubjects={[SUBJECT_MINUTES]} />)
      await user.click(screen.getByTestId('subject-select'))
      await user.click(screen.getByRole('button', { name: 'Start Exam' }))
      expect(handleStart).toHaveBeenCalledOnce()
    })
  })
})
