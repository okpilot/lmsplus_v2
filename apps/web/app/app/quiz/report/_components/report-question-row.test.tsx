import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { ReportQuestionRow } from './report-question-row'

// ---- Mocks ------------------------------------------------------------------

vi.mock('@/app/app/_components/markdown-text', () => ({
  MarkdownText: ({ children, className }: { children: string; className?: string }) => (
    <div data-testid="markdown-text" className={className}>
      {children}
    </div>
  ),
}))

vi.mock('@/app/app/_components/zoomable-image', () => ({
  ZoomableImage: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="zoomable-image" data-src={src} role="img" aria-label={alt} />
  ),
}))

// ---- Fixtures ----------------------------------------------------------------

function makeQuestion(overrides: Partial<QuizReportQuestion> = {}): QuizReportQuestion {
  return {
    questionId: 'q1',
    questionText: 'What is lift?',
    questionNumber: '050-01-001',
    isCorrect: true,
    selectedOptionId: 'opt-a',
    correctOptionId: 'opt-a',
    options: [
      { id: 'opt-a', text: 'Upward force' },
      { id: 'opt-b', text: 'Downward force' },
    ],
    explanationText: null,
    explanationImageUrl: null,
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

  describe('correct answer', () => {
    it('renders question text for a correct answer', () => {
      render(<ReportQuestionRow question={makeQuestion({ isCorrect: true })} index={0} />)
      expect(screen.getByText('What is lift?')).toBeInTheDocument()
    })

    it('shows the selected answer with letter prefix for a correct answer', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ isCorrect: true, selectedOptionId: 'opt-a' })}
          index={0}
        />,
      )
      expect(screen.getByText(/A — Upward force/)).toBeInTheDocument()
    })

    it('does not show the correct answer row when the answer is correct', () => {
      render(<ReportQuestionRow question={makeQuestion({ isCorrect: true })} index={0} />)
      expect(screen.queryByText(/Correct answer:/)).not.toBeInTheDocument()
    })
  })

  describe('incorrect answer', () => {
    it('shows the selected (wrong) answer with letter prefix', () => {
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
      expect(screen.getByText(/B — Downward force/)).toBeInTheDocument()
    })

    it('shows the correct answer row when the answer is incorrect', () => {
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
      expect(screen.getByText(/Correct answer:/)).toBeInTheDocument()
      expect(screen.getByText(/A — Upward force/)).toBeInTheDocument()
    })

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

    it('hides the correct answer row when correctOption is not found in options', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            isCorrect: false,
            selectedOptionId: 'opt-b',
            correctOptionId: 'opt-unknown',
          })}
          index={0}
        />,
      )
      expect(screen.queryByText(/Correct answer:/)).not.toBeInTheDocument()
    })
  })

  describe('no answer fallback', () => {
    it('shows "No answer" when selectedOptionId matches no option', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ selectedOptionId: 'opt-nonexistent' })}
          index={0}
        />,
      )
      expect(screen.getByText(/No answer/)).toBeInTheDocument()
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
      const img = screen.getByTestId('zoomable-image')
      expect(img).toHaveAttribute('data-src', 'https://example.com/diagram.png')
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
    it('displays response time in seconds with one decimal place', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 3000 })} index={0} />)
      expect(screen.getByText('3.0s')).toBeInTheDocument()
    })

    it('rounds sub-second times to one decimal place', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 500 })} index={0} />)
      expect(screen.getByText('0.5s')).toBeInTheDocument()
    })

    it('displays longer response times correctly', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 12500 })} index={0} />)
      expect(screen.getByText('12.5s')).toBeInTheDocument()
    })
  })

  describe('question text display', () => {
    it('renders full question text without truncation', () => {
      const longText = 'A'.repeat(120)
      render(<ReportQuestionRow question={makeQuestion({ questionText: longText })} index={0} />)
      expect(screen.getByText(longText)).toBeInTheDocument()
    })
  })
})
