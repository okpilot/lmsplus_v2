import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

// SubjectSelect mock: renders a button that calls onValueChange with 'sub-1'.
// Fixtures use id='sub-1' so the hardcoded value triggers the "selected" branch.
vi.mock('./subject-select', () => ({
  SubjectSelect: ({
    value,
    onValueChange,
  }: {
    subjects: unknown[]
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
  timeLimitSeconds: 3600, // 1h exactly — no leftover minutes
}

const SUBJECT_HOURS_AND_MINUTES: ExamSubjectOption = {
  ...SUBJECT_MINUTES,
  timeLimitSeconds: 5400, // 1h 30min
}

// ---- Helpers --------------------------------------------------------------

function buildProps(
  overrides: Partial<{
    examSubjects: ExamSubjectOption[]
    subjectId: string
    onSubjectChange: (id: string) => void
  }> = {},
) {
  return {
    examSubjects: [SUBJECT_MINUTES],
    subjectId: '',
    onSubjectChange: vi.fn(),
    ...overrides,
  }
}

// ---- Tests ----------------------------------------------------------------

describe('ExamConfigForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('subject selector', () => {
    it('renders the subject select', () => {
      render(<ExamConfigForm {...buildProps()} />)
      expect(screen.getByTestId('subject-select')).toBeInTheDocument()
    })

    it('passes the current subjectId as value to SubjectSelect', () => {
      render(<ExamConfigForm {...buildProps({ subjectId: 'sub-1' })} />)
      expect(screen.getByTestId('subject-select')).toHaveAttribute('data-value', 'sub-1')
    })

    it('calls onSubjectChange when a subject is selected', async () => {
      const onSubjectChange = vi.fn()
      const user = userEvent.setup()
      render(<ExamConfigForm {...buildProps({ onSubjectChange })} />)
      await user.click(screen.getByTestId('subject-select'))
      expect(onSubjectChange).toHaveBeenCalledWith('sub-1')
    })
  })

  describe('parameters card when no subject is selected', () => {
    it('hides the Practice Exam parameters card when subjectId does not match any subject', () => {
      render(<ExamConfigForm {...buildProps({ subjectId: '' })} />)
      expect(screen.queryByText('Practice Exam Parameters')).not.toBeInTheDocument()
    })

    it('hides question count before a subject is selected', () => {
      render(<ExamConfigForm {...buildProps({ subjectId: '' })} />)
      expect(screen.queryByText('Questions')).not.toBeInTheDocument()
    })
  })

  describe('parameters card when a subject is selected', () => {
    it('shows the Practice Exam Parameters heading when a matching subject is provided', () => {
      render(<ExamConfigForm {...buildProps({ subjectId: 'sub-1' })} />)
      expect(screen.getByText('Practice Exam Parameters')).toBeInTheDocument()
    })

    it('displays the correct question count', () => {
      render(<ExamConfigForm {...buildProps({ subjectId: 'sub-1' })} />)
      expect(screen.getByText('20')).toBeInTheDocument()
      expect(screen.getByText('Questions')).toBeInTheDocument()
    })

    it('displays the pass mark percentage', () => {
      render(<ExamConfigForm {...buildProps({ subjectId: 'sub-1' })} />)
      expect(screen.getByText('75%')).toBeInTheDocument()
      expect(screen.getByText('Pass Mark')).toBeInTheDocument()
    })

    it('shows the Time Limit label', () => {
      render(<ExamConfigForm {...buildProps({ subjectId: 'sub-1' })} />)
      expect(screen.getByText('Time Limit')).toBeInTheDocument()
    })
  })

  describe('formatTime display', () => {
    it('shows minutes-only format for a time limit under one hour', () => {
      // timeLimitSeconds: 3000 → 50 min
      render(
        <ExamConfigForm {...buildProps({ subjectId: 'sub-1', examSubjects: [SUBJECT_MINUTES] })} />,
      )
      expect(screen.getByText('50 min')).toBeInTheDocument()
    })

    it('shows hours-only format when the time limit is exactly on the hour', () => {
      // timeLimitSeconds: 3600 → 1h (no leftover minutes)
      render(
        <ExamConfigForm
          {...buildProps({ subjectId: 'sub-1', examSubjects: [SUBJECT_HOURS_ONLY] })}
        />,
      )
      expect(screen.getByText('1h')).toBeInTheDocument()
    })

    it('shows hours and minutes format when both are non-zero', () => {
      // timeLimitSeconds: 5400 → 1h 30min
      render(
        <ExamConfigForm
          {...buildProps({ subjectId: 'sub-1', examSubjects: [SUBJECT_HOURS_AND_MINUTES] })}
        />,
      )
      expect(screen.getByText('1h 30min')).toBeInTheDocument()
    })
  })

  describe('multiple subjects in the list', () => {
    it('shows parameters only for the subject matching subjectId, not others', () => {
      const otherSubject: ExamSubjectOption = {
        id: 'sub-2',
        code: '010',
        name: 'Air Law',
        short: 'LAW',
        totalQuestions: 40,
        timeLimitSeconds: 3600,
        passMark: 75,
      }

      render(
        <ExamConfigForm
          examSubjects={[SUBJECT_MINUTES, otherSubject]}
          subjectId="sub-2"
          onSubjectChange={vi.fn()}
        />,
      )

      // sub-2 has 40 questions; sub-1 has 20 — only 40 should appear
      expect(screen.getByText('40')).toBeInTheDocument()
      expect(screen.queryByText('20')).not.toBeInTheDocument()
    })
  })
})
