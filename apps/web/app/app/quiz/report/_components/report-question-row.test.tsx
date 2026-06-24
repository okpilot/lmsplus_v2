import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { ReportFlagProvider } from './report-flag-context'
import { ReportQuestionRow } from './report-question-row'

// ---- Mocks ------------------------------------------------------------------

const { mockToggleFlag } = vi.hoisted(() => ({ mockToggleFlag: vi.fn() }))

vi.mock('../../actions/flag', () => ({ toggleFlag: mockToggleFlag }))

vi.mock('@/app/app/_components/markdown-text', () => ({
  MarkdownText: ({ children, className }: { children: string; className?: string }) => (
    <div data-testid="markdown-text" className={className}>
      {children}
    </div>
  ),
}))

// Mock mirrors the real ZoomableImage contract (#863): an accessible link
// wrapping a presentational img, so these tests track the real component output.
vi.mock('@/app/app/_components/zoomable-image', () => ({
  ZoomableImage: ({ src, alt }: { src: string; alt: string }) => (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open image in new tab: ${alt}`}
    >
      {/* biome-ignore lint/performance/noImgElement: test mock — no Next.js Image needed */}
      <img data-testid="zoomable-image" src={src} alt="" aria-hidden="true" />
    </a>
  ),
}))

// OptionsList is a real component — no mock; its rendering is part of the contract

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Fixtures ----------------------------------------------------------------

type McQuestion = Extract<QuizReportQuestion, { questionType: 'multiple_choice' }>

function makeQuestion(overrides: Partial<McQuestion> = {}): McQuestion {
  return {
    questionId: 'q1',
    questionText: 'What is lift?',
    questionNumber: '050-01-001',
    questionType: 'multiple_choice',
    isCorrect: true,
    selectedOptionId: 'opt-a',
    correctOptionId: 'opt-a',
    options: [
      { id: 'opt-a', text: 'Upward force' },
      { id: 'opt-b', text: 'Downward force' },
    ],
    explanationText: null,
    explanationImageUrl: null,
    questionImageUrl: null,
    responseTimeMs: 3000,
    ...overrides,
  }
}

// ---- Tests ------------------------------------------------------------------

describe('ReportQuestionRow', () => {
  describe('question label', () => {
    it('uses questionNumber as label when provided', () => {
      render(
        <ReportQuestionRow question={makeQuestion({ questionNumber: '050-01-001' })} index={0} />,
      )
      expect(screen.getByText('050-01-001')).toBeInTheDocument()
    })

    it('falls back to Q{index+1} when questionNumber is null', () => {
      render(<ReportQuestionRow question={makeQuestion({ questionNumber: null })} index={2} />)
      expect(screen.getByText('Q3')).toBeInTheDocument()
    })
  })

  describe('status icon', () => {
    it('shows the Correct icon when the answer is correct', () => {
      render(<ReportQuestionRow question={makeQuestion({ isCorrect: true })} index={0} />)
      expect(screen.getByRole('img', { name: 'Correct' })).toBeInTheDocument()
    })

    it('shows the Incorrect icon when the answer is wrong', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ isCorrect: false, selectedOptionId: 'opt-b' })}
          index={0}
        />,
      )
      expect(screen.getByRole('img', { name: 'Incorrect' })).toBeInTheDocument()
    })
  })

  describe('question text', () => {
    it('renders question text', () => {
      render(<ReportQuestionRow question={makeQuestion()} index={0} />)
      expect(screen.getByText('What is lift?')).toBeInTheDocument()
    })
  })

  describe('options list', () => {
    it('renders all option texts', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            options: [
              { id: 'opt-a', text: 'Upward force' },
              { id: 'opt-b', text: 'Downward force' },
            ],
            selectedOptionId: 'opt-a',
            correctOptionId: 'opt-a',
          })}
          index={0}
        />,
      )
      expect(screen.getByText('Upward force')).toBeInTheDocument()
      expect(screen.getByText('Downward force')).toBeInTheDocument()
    })

    it('marks the correct option with "Correct" label', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            isCorrect: true,
            selectedOptionId: 'opt-a',
            correctOptionId: 'opt-a',
          })}
          index={0}
        />,
      )
      expect(screen.getByText('Correct')).toBeInTheDocument()
    })

    it('marks the selected-wrong option with "Your answer" label', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            isCorrect: false,
            selectedOptionId: 'opt-b',
            correctOptionId: 'opt-a',
          })}
          index={0}
        />,
      )
      expect(screen.getByText('Your answer')).toBeInTheDocument()
    })

    it('shows both "Correct" and "Your answer" when the selected option is correct', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            isCorrect: true,
            selectedOptionId: 'opt-a',
            correctOptionId: 'opt-a',
          })}
          index={0}
        />,
      )
      expect(screen.getByText('Correct')).toBeInTheDocument()
      expect(screen.getByText('· Your answer')).toBeInTheDocument()
    })
  })

  describe('no answer fallback', () => {
    it('shows "Not answered" when selectedOptionId matches no option', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ selectedOptionId: 'opt-nonexistent' })}
          index={0}
        />,
      )
      expect(screen.getByText('Not answered')).toBeInTheDocument()
    })

    it('shows "Not answered" when selectedOptionId is null (VFR RT text-answer row)', () => {
      render(<ReportQuestionRow question={makeQuestion({ selectedOptionId: null })} index={0} />)
      expect(screen.getByText('Not answered')).toBeInTheDocument()
    })
  })

  describe('background tint', () => {
    it('applies pink tint background on incorrect rows', () => {
      const { container } = render(
        <ReportQuestionRow question={makeQuestion({ isCorrect: false })} index={0} />,
      )
      const row = container.firstElementChild as HTMLElement
      expect(row.className).toContain('bg-red-50')
    })

    it('does not apply pink tint on correct rows', () => {
      const { container } = render(
        <ReportQuestionRow question={makeQuestion({ isCorrect: true })} index={0} />,
      )
      const row = container.firstElementChild as HTMLElement
      expect(row.className).not.toContain('bg-red-50')
    })
  })

  describe('question image', () => {
    it('renders question image when questionImageUrl is set', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ questionImageUrl: 'https://example.com/q-img.png' })}
          index={0}
        />,
      )
      const link = screen.getByRole('link', {
        name: 'Open image in new tab: Question illustration',
      })
      expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/q-img.png')
    })

    it('does not render question image when questionImageUrl is null', () => {
      render(<ReportQuestionRow question={makeQuestion({ questionImageUrl: null })} index={0} />)
      const links = screen.queryAllByRole('link', {
        name: 'Open image in new tab: Question illustration',
      })
      expect(links).toHaveLength(0)
    })
  })

  describe('explanation toggle', () => {
    it('does not show toggle when there is no explanation', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ explanationText: null, explanationImageUrl: null })}
          index={0}
        />,
      )
      expect(screen.queryByText('Show explanation')).not.toBeInTheDocument()
    })

    it('shows toggle button when explanationText is present', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ explanationText: 'Lift acts perpendicular to relative wind.' })}
          index={0}
        />,
      )
      expect(screen.getByText('Show explanation')).toBeInTheDocument()
    })

    it('shows toggle button when only explanationImageUrl is present', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ explanationImageUrl: 'https://example.com/img.png' })}
          index={0}
        />,
      )
      expect(screen.getByText('Show explanation')).toBeInTheDocument()
    })

    it('does not render explanation content before toggle is clicked', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ explanationText: 'Lift acts perpendicular to relative wind.' })}
          index={0}
        />,
      )
      expect(screen.queryByTestId('markdown-text')).not.toBeInTheDocument()
    })

    it('renders markdown explanation after clicking toggle', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ explanationText: 'Lift acts perpendicular to relative wind.' })}
          index={0}
        />,
      )
      fireEvent.click(screen.getByText('Show explanation'))
      expect(screen.getByTestId('markdown-text')).toHaveTextContent(
        'Lift acts perpendicular to relative wind.',
      )
    })

    it('renders explanation image after clicking toggle', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            explanationText: 'Some text',
            explanationImageUrl: 'https://example.com/diagram.png',
          })}
          index={0}
        />,
      )
      fireEvent.click(screen.getByText('Show explanation'))
      const link = screen.getByRole('link', {
        name: 'Open image in new tab: Explanation illustration',
      })
      expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/diagram.png')
    })

    it('hides explanation when toggle is clicked again', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ explanationText: 'Some explanation text' })}
          index={0}
        />,
      )
      fireEvent.click(screen.getByText('Show explanation'))
      expect(screen.getByTestId('markdown-text')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Hide explanation'))
      expect(screen.queryByTestId('markdown-text')).not.toBeInTheDocument()
    })

    it('changes button text between Show and Hide', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ explanationText: 'Some explanation text' })}
          index={0}
        />,
      )
      expect(screen.getByText('Show explanation')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Show explanation'))
      expect(screen.getByText('Hide explanation')).toBeInTheDocument()
    })
  })

  describe('response time', () => {
    it('displays sub-minute response time as whole seconds', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 3000 })} index={0} />)
      expect(screen.getByText('3s')).toBeInTheDocument()
    })

    it('rounds sub-second times to whole seconds', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 500 })} index={0} />)
      expect(screen.getByText('1s')).toBeInTheDocument()
    })

    it('formats times over a minute as minutes and seconds', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 95_300 })} index={0} />)
      expect(screen.getByText('1m 35s')).toBeInTheDocument()
    })
  })

  describe('question text display', () => {
    it('renders full question text without truncation', () => {
      const longText = 'A'.repeat(120)
      render(<ReportQuestionRow question={makeQuestion({ questionText: longText })} index={0} />)
      expect(screen.getByText(longText)).toBeInTheDocument()
    })
  })

  describe('short-answer questions', () => {
    function makeShortAnswer(
      overrides: Partial<Extract<QuizReportQuestion, { questionType: 'short_answer' }>> = {},
    ): QuizReportQuestion {
      return {
        questionId: 'sa1',
        questionText: 'Read back the clearance.',
        questionNumber: '092-01-001',
        questionType: 'short_answer',
        isCorrect: true,
        responseText: 'cleared for takeoff',
        canonicalAnswer: 'cleared for takeoff',
        explanationText: null,
        explanationImageUrl: null,
        questionImageUrl: null,
        responseTimeMs: 4000,
        ...overrides,
      }
    }

    it('shows the student answer for a short-answer question', () => {
      render(<ReportQuestionRow question={makeShortAnswer()} index={0} />)
      expect(screen.getByText('cleared for takeoff')).toBeInTheDocument()
    })

    it('shows the expected answer when the short-answer response is wrong', () => {
      render(
        <ReportQuestionRow
          question={makeShortAnswer({
            isCorrect: false,
            responseText: 'cleared to land',
            canonicalAnswer: 'cleared for takeoff',
          })}
          index={0}
        />,
      )
      expect(screen.getByText('cleared to land')).toBeInTheDocument()
      expect(screen.getByText('cleared for takeoff')).toBeInTheDocument()
    })

    it('treats an empty short-answer response as not answered', () => {
      render(<ReportQuestionRow question={makeShortAnswer({ responseText: '' })} index={0} />)
      expect(screen.getByText('Not answered')).toBeInTheDocument()
    })
  })

  describe('dialog-fill questions', () => {
    function makeDialog(
      overrides: Partial<Extract<QuizReportQuestion, { questionType: 'dialog_fill' }>> = {},
    ): QuizReportQuestion {
      return {
        questionId: 'df1',
        questionText: 'Fill the readback.',
        questionNumber: '092-02-001',
        questionType: 'dialog_fill',
        isCorrect: false,
        blanks: [
          { index: 0, responseText: 'cleared', canonical: 'cleared', isCorrect: true },
          { index: 1, responseText: 'descend', canonical: 'climb', isCorrect: false },
        ],
        correctCount: 1,
        totalBlanks: 2,
        explanationText: null,
        explanationImageUrl: null,
        questionImageUrl: null,
        responseTimeMs: 6000,
        ...overrides,
      }
    }

    it('leads with the partial fraction of correct blanks', () => {
      render(<ReportQuestionRow question={makeDialog()} index={0} />)
      expect(screen.getByText('1 / 2 blanks correct')).toBeInTheDocument()
    })

    it('shows each blank response and the expected value for a wrong blank', () => {
      render(<ReportQuestionRow question={makeDialog()} index={0} />)
      expect(screen.getByText('descend')).toBeInTheDocument()
      expect(screen.getByText('(expected: climb)')).toBeInTheDocument()
    })

    it('shows a full fraction when every blank is correct', () => {
      render(
        <ReportQuestionRow
          question={makeDialog({
            isCorrect: true,
            correctCount: 2,
            blanks: [
              { index: 0, responseText: 'cleared', canonical: 'cleared', isCorrect: true },
              { index: 1, responseText: 'climb', canonical: 'climb', isCorrect: true },
            ],
          })}
          index={0}
        />,
      )
      expect(screen.getByText('2 / 2 blanks correct')).toBeInTheDocument()
    })
  })

  describe('flag toggle', () => {
    it('does not render a flag button without a flag provider (e.g. admin report view)', () => {
      render(<ReportQuestionRow question={makeQuestion({ questionId: 'q1' })} index={0} />)
      expect(screen.queryByTestId('report-flag-button')).not.toBeInTheDocument()
    })

    it('renders an unpressed Flag button when the question is not flagged', () => {
      render(
        <ReportFlagProvider initialFlaggedIds={[]}>
          <ReportQuestionRow question={makeQuestion({ questionId: 'q1' })} index={0} />
        </ReportFlagProvider>,
      )
      const button = screen.getByTestId('report-flag-button')
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(button).toHaveAttribute('aria-label', 'Flag question')
    })

    it('renders a pressed Unflag button when the question is already flagged', () => {
      render(
        <ReportFlagProvider initialFlaggedIds={['q1']}>
          <ReportQuestionRow question={makeQuestion({ questionId: 'q1' })} index={0} />
        </ReportFlagProvider>,
      )
      const button = screen.getByTestId('report-flag-button')
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(button).toHaveAttribute('aria-label', 'Unflag question')
    })

    it('flags the question when clicked', async () => {
      mockToggleFlag.mockResolvedValue({ success: true, flagged: true })
      render(
        <ReportFlagProvider initialFlaggedIds={[]}>
          <ReportQuestionRow question={makeQuestion({ questionId: 'q1' })} index={0} />
        </ReportFlagProvider>,
      )
      fireEvent.click(screen.getByTestId('report-flag-button'))
      await waitFor(() =>
        expect(screen.getByTestId('report-flag-button')).toHaveAttribute('aria-pressed', 'true'),
      )
      expect(mockToggleFlag).toHaveBeenCalledWith({ questionId: 'q1' })
    })

    it('disables the flag button while the toggle action is in-flight', async () => {
      let resolveToggle: (v: { success: true; flagged: boolean }) => void = () => {}
      mockToggleFlag.mockReturnValue(
        new Promise((resolve) => {
          resolveToggle = resolve
        }),
      )
      render(
        <ReportFlagProvider initialFlaggedIds={[]}>
          <ReportQuestionRow question={makeQuestion({ questionId: 'q1' })} index={0} />
        </ReportFlagProvider>,
      )
      const button = screen.getByTestId('report-flag-button')
      expect(button).not.toBeDisabled()
      fireEvent.click(button)
      await waitFor(() => expect(button).toBeDisabled())
      resolveToggle({ success: true, flagged: true })
      await waitFor(() => expect(button).not.toBeDisabled())
    })
  })
})
